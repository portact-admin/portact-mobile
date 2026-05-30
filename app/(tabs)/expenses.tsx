import React, { useMemo } from 'react';
import { View, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { useRouter } from 'expo-router';
import { useTheme } from '@hooks/useTheme';
import { usePortfolioStore } from '@store/usePortfolioStore';
import { Typography } from '@components/ui/Typography';
import { Card } from '@components/ui/Card';
import { EmptyState } from '@components/ui/EmptyState';
import { Button } from '@components/ui/Button';
import { formatCompact } from '@utils/formatters';
import dayjs from 'dayjs';

const SCREEN_WIDTH = Dimensions.get('window').width;

// 15-color palette — cycles for any number of categories
const PALETTE = [
  '#E05C5C', '#E0935C', '#E0C65C', '#8BE05C', '#5CE08B',
  '#5CE0C6', '#5CA7E0', '#6E5CE0', '#B05CE0', '#E05CB0',
  '#C75C5C', '#5C8BE0', '#5CE05C', '#E05C8B', '#5CBFE0',
];
export function catColor(i: number) { return PALETTE[i % PALETTE.length]; }

function useExpenseData() {
  const backup = usePortfolioStore((s) => s.backup);
  const year = dayjs().year();

  return useMemo(() => {
    if (!backup) return null;

    const catMap: Record<number, string> = {};
    for (const c of backup.expense_categories ?? []) catMap[c.id] = c.name;

    const yearStr = String(year);
    const raw = (backup.expenses ?? []).filter(
      (e) => !e.is_amortized_entry &&
              e.classification === 'expense' &&
              (e.transaction_date ?? '').startsWith(yearStr),
    );

    // Monthly totals
    const byMonth: Record<string, number> = {};
    const byMonthCat: Record<string, Record<string, number>> = {};
    for (const e of raw) {
      const m = e.transaction_date.slice(0, 7);
      byMonth[m] = (byMonth[m] ?? 0) + e.amount;
      if (!byMonthCat[m]) byMonthCat[m] = {};
      const cat = e.category_id ? (catMap[e.category_id] ?? 'Other') : 'Other';
      byMonthCat[m][cat] = (byMonthCat[m][cat] ?? 0) + e.amount;
    }

    const months = Object.keys(byMonth).sort();
    const total = months.reduce((s, m) => s + byMonth[m], 0);
    const currentMonth = dayjs().format('YYYY-MM');
    const monthsElapsed = months.filter((m) => m <= currentMonth).length || 1;
    const avg = total / monthsElapsed;

    // Year-level category totals
    const yearCats: Record<string, number> = {};
    for (const e of raw) {
      const cat = e.category_id ? (catMap[e.category_id] ?? 'Other') : 'Other';
      yearCats[cat] = (yearCats[cat] ?? 0) + e.amount;
    }
    const topCats = Object.entries(yearCats)
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount], i) => ({ name, amount, color: catColor(i) }));

    return { months, byMonth, total, avg, topCats, year };
  }, [backup, year]);
}

export default function ExpensesScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { status } = usePortfolioStore();
  const data = useExpenseData();

  if (status !== 'loaded' || !data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <EmptyState
            title="No expense data"
            subtitle="Import your PortAct backup to view expenses."
            action={<Button label="Import Backup" variant="primary" onPress={() => router.replace('/onboarding')} />}
          />
        </View>
      </SafeAreaView>
    );
  }

  const { months, byMonth, total, avg, topCats, year } = data;

  const chartWidth = SCREEN_WIDTH - 32 - spacing.md * 2;
  const barWidth = Math.max(20, Math.min(40, Math.floor((chartWidth - 20) / Math.max(months.length, 1)) - 8));
  const barSpacing = Math.max(4, Math.floor((chartWidth - months.length * barWidth - 20) / Math.max(months.length, 1)));

  const barData = months.map((m) => ({
    value: byMonth[m],
    label: dayjs(m).format('MMM'),
    frontColor: colors.accent,
    topLabelComponent: () => (
      <Typography variant="micro" color={colors.textSecondary} style={{ fontSize: 8, marginBottom: 2 }}>
        {formatCompact(byMonth[m])}
      </Typography>
    ),
    onPress: () => router.push(`/expenses/${m}` as any),
  }));

  // Give the tallest bar 20 % headroom so its top label is never clipped
  const maxBarValue = months.length > 0 ? Math.max(...months.map((m) => byMonth[m])) : 0;
  const barChartMaxValue = maxBarValue * 1.25;

  // Pie chart for category breakdown
  const pieRadius = Math.min(90, (chartWidth - 32) / 2);
  const pieData = topCats.map((cat) => ({
    value: cat.amount,
    color: cat.color,
    text: total > 0 && (cat.amount / total) * 100 >= 8
      ? `${((cat.amount / total) * 100).toFixed(0)}%`
      : '',
  }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, gap: spacing.lg, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Typography variant="title2" weight="700">Expenses {year}</Typography>

        {/* Summary cards */}
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Card style={{ flex: 1, gap: spacing.xs }}>
            <Typography variant="micro" color={colors.textSecondary} weight="600">TOTAL {year}</Typography>
            <Typography variant="title3" weight="800">{formatCompact(total)}</Typography>
            <Typography variant="micro" color={colors.textTertiary}>{months.length} month{months.length !== 1 ? 's' : ''}</Typography>
          </Card>
          <Card style={{ flex: 1, gap: spacing.xs }}>
            <Typography variant="micro" color={colors.textSecondary} weight="600">AVG / MONTH</Typography>
            <Typography variant="title3" weight="800">{formatCompact(avg)}</Typography>
            <Typography variant="micro" color={colors.textTertiary}>till date</Typography>
          </Card>
        </View>

        {/* Monthly trend */}
        {months.length > 0 && (
          <Card style={{ gap: spacing.md }}>
            <Typography variant="headline">Monthly Trend</Typography>
            <Typography variant="caption" color={colors.textSecondary}>Tap a bar to see details</Typography>
            <BarChart
              data={barData}
              width={chartWidth}
              height={180}
              maxValue={barChartMaxValue}
              barWidth={barWidth}
              spacing={barSpacing}
              xAxisColor={colors.border}
              yAxisColor="transparent"
              hideYAxisText
              xAxisLabelTextStyle={{ color: colors.textTertiary, fontSize: 10 }}
              noOfSections={3}
              isAnimated
              disableScroll
              initialSpacing={8}
            />
          </Card>
        )}

        {/* Expenses by category — donut pie chart + legend */}
        {pieData.length > 0 && (
          <Card style={{ gap: spacing.md }}>
            <Typography variant="headline">By Category</Typography>
            <View style={{ alignItems: 'center' }}>
              <PieChart
                data={pieData}
                donut
                radius={pieRadius}
                innerRadius={pieRadius - 36}
                showText
                textSize={11}
                fontWeight="700"
                strokeColor={colors.background}
                strokeWidth={2}
                centerLabelComponent={() => (
                  <View style={{ alignItems: 'center' }}>
                    <Typography variant="micro" color={colors.textSecondary}>TOTAL</Typography>
                    <Typography variant="footnote" weight="700">{formatCompact(total)}</Typography>
                  </View>
                )}
              />
            </View>
            <View style={{ gap: 6 }}>
              {topCats.map((cat) => {
                const pct = total > 0 ? (cat.amount / total) * 100 : 0;
                return (
                  <View key={cat.name} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cat.color }} />
                    <Typography variant="footnote" style={{ flex: 1 }} numberOfLines={1}>{cat.name}</Typography>
                    <Typography variant="footnote" weight="600" color={colors.textSecondary}>
                      {formatCompact(cat.amount)}
                    </Typography>
                    <Typography variant="micro" color={colors.textTertiary} style={{ width: 36, textAlign: 'right' }}>
                      {pct.toFixed(1)}%
                    </Typography>
                  </View>
                );
              })}
            </View>
          </Card>
        )}

        {months.length === 0 && (
          <EmptyState title="No expenses" subtitle={`No expense records found for ${year}.`} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
