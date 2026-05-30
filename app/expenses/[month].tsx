import React, { useMemo, useState } from 'react';
import {
  View, ScrollView, Pressable, FlatList, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PieChart } from 'react-native-gifted-charts';
import { useTheme } from '@hooks/useTheme';
import { usePortfolioStore } from '@store/usePortfolioStore';
import { Typography } from '@components/ui/Typography';
import { Card } from '@components/ui/Card';
import { Divider } from '@components/ui/Divider';
import { formatCompact } from '@utils/formatters';
import { catColor } from '../(tabs)/expenses';
import { RawExpense } from '@models/backup';
import dayjs from 'dayjs';

type SortField = 'date' | 'description' | 'category' | 'amount';
type SortDir = 'asc' | 'desc';

const SCREEN_WIDTH = Dimensions.get('window').width;

function displayName(e: RawExpense): string {
  if (e.merchant_name && e.merchant_name.trim()) return e.merchant_name.trim();
  return (e.description ?? '').trim();
}

export default function MonthExpensesScreen() {
  const { month } = useLocalSearchParams<{ month: string }>();
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const backup = usePortfolioStore((s) => s.backup);

  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { expenses, catMap } = useMemo(() => {
    if (!backup) return { expenses: [], catMap: {} };
    const cm: Record<number, string> = {};
    for (const c of backup.expense_categories ?? []) cm[c.id] = c.name;

    const filtered = (backup.expenses ?? []).filter(
      (e) =>
        !e.is_amortized_entry &&
        e.classification === 'expense' &&
        (e.transaction_date ?? '').startsWith(month ?? ''),
    );
    return { expenses: filtered, catMap: cm };
  }, [backup, month]);

  const total = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);

  // Pie chart data — top categories for this month
  const pieData = useMemo(() => {
    const cats: Record<string, number> = {};
    for (const e of expenses) {
      const cat = e.category_id ? (catMap[e.category_id] ?? 'Other') : 'Other';
      cats[cat] = (cats[cat] ?? 0) + e.amount;
    }
    return Object.entries(cats)
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount], i) => ({
        name,
        value: amount,
        color: catColor(i),
        text: total > 0 && (amount / total) * 100 >= 8
          ? `${((amount / total) * 100).toFixed(0)}%`
          : '',
      }));
  }, [expenses, catMap, total]);

  // Sorted transactions
  const sorted = useMemo(() => {
    return [...expenses].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'date':
          cmp = (a.transaction_date ?? '').localeCompare(b.transaction_date ?? '');
          break;
        case 'description':
          cmp = displayName(a).localeCompare(displayName(b));
          break;
        case 'category': {
          const ca = a.category_id ? (catMap[a.category_id] ?? 'Other') : 'Other';
          const cb = b.category_id ? (catMap[b.category_id] ?? 'Other') : 'Other';
          cmp = ca.localeCompare(cb);
          break;
        }
        case 'amount':
          cmp = a.amount - b.amount;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [expenses, catMap, sortField, sortDir]);

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'date' || field === 'amount' ? 'desc' : 'asc');
    }
  }

  const monthLabel = month ? dayjs(month).format('MMMM YYYY') : '';
  const pieRadius = Math.min(90, (SCREEN_WIDTH - 64) / 2);

  function SortHeader({ field, label, flex, align }: {
    field: SortField; label: string; flex?: number; align?: 'left' | 'right';
  }) {
    const active = sortField === field;
    return (
      <Pressable
        onPress={() => handleSort(field)}
        style={{ flex, alignItems: align === 'right' ? 'flex-end' : 'flex-start', flexDirection: 'row', gap: 2 }}
      >
        <Typography
          variant="micro"
          weight="600"
          color={active ? colors.accent : colors.textTertiary}
        >
          {label}
        </Typography>
        {active && (
          <Ionicons
            name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'}
            size={9}
            color={colors.accent}
          />
        )}
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          gap: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Typography variant="headline" weight="700">{monthLabel}</Typography>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <View style={{ padding: spacing.md, gap: spacing.lg }}>
            {/* Month summary */}
            <Card style={{ gap: spacing.xs }}>
              <Typography variant="micro" color={colors.textSecondary} weight="600">TOTAL EXPENSES</Typography>
              <Typography variant="title3" weight="800">{formatCompact(total)}</Typography>
              <Typography variant="caption" color={colors.textTertiary}>
                {expenses.length} transaction{expenses.length !== 1 ? 's' : ''}
              </Typography>
            </Card>

            {/* Pie chart */}
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
                {/* Legend */}
                <View style={{ gap: 6 }}>
                  {pieData.map((d) => (
                    <View key={d.name} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: d.color }} />
                      <Typography variant="footnote" style={{ flex: 1 }} numberOfLines={1}>{d.name}</Typography>
                      <Typography variant="footnote" weight="600" color={colors.textSecondary}>
                        {formatCompact(d.value)}
                      </Typography>
                      <Typography variant="micro" color={colors.textTertiary} style={{ width: 36, textAlign: 'right' }}>
                        {total > 0 ? `${((d.value / total) * 100).toFixed(1)}%` : ''}
                      </Typography>
                    </View>
                  ))}
                </View>
              </Card>
            )}

            {/* Sort header row */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: spacing.sm,
                paddingVertical: 6,
                backgroundColor: colors.surface,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <SortHeader field="date" label="DATE" flex={undefined} />
              <View style={{ width: 8 }} />
              <SortHeader field="description" label="DESCRIPTION" flex={1} />
              <SortHeader field="category" label="CATEGORY" flex={undefined} />
              <View style={{ width: 8 }} />
              <SortHeader field="amount" label="AMOUNT" align="right" />
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <Divider style={{ marginHorizontal: spacing.md }} />}
        renderItem={({ item }) => {
          const cat = item.category_id ? (catMap[item.category_id] ?? 'Other') : 'Other';
          const name = displayName(item);
          const dateStr = dayjs(item.transaction_date).format('D MMM');
          return (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                paddingHorizontal: spacing.md,
                paddingVertical: 10,
                gap: 6,
              }}
            >
              {/* Date */}
              <Typography variant="caption" color={colors.textSecondary} style={{ width: 42, marginTop: 1 }}>
                {dateStr}
              </Typography>
              {/* Description */}
              <Typography variant="footnote" style={{ flex: 1 }} numberOfLines={3}>
                {name || '—'}
              </Typography>
              {/* Category */}
              <Typography
                variant="caption"
                color={colors.textSecondary}
                style={{ width: 80, textAlign: 'center', marginTop: 1 }}
                numberOfLines={2}
              >
                {cat}
              </Typography>
              {/* Amount */}
              <Typography variant="footnote" weight="700" style={{ width: 64, textAlign: 'right', marginTop: 1 }}>
                {formatCompact(item.amount)}
              </Typography>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={{ padding: spacing.xl, alignItems: 'center' }}>
            <Typography variant="footnote" color={colors.textSecondary}>No transactions for this month.</Typography>
          </View>
        }
      />
    </SafeAreaView>
  );
}
