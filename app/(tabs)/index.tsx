import React, { useMemo, useState } from 'react';
import { ScrollView, View, Pressable, RefreshControl, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@hooks/useTheme';
import { usePortfolioStore } from '@store/usePortfolioStore';
import { AllocationDonut } from '@components/charts/AllocationDonut';
import { PortfolioLineChart } from '@components/charts/PortfolioLineChart';
import { Typography } from '@components/ui/Typography';
import { Card } from '@components/ui/Card';
import { LoadingSpinner } from '@components/ui/LoadingSpinner';
import { EmptyState } from '@components/ui/EmptyState';
import { Button } from '@components/ui/Button';
import { formatCompact, formatPercent, gainColor } from '@utils/formatters';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

type ChartPeriod = '1M' | '3M' | '6M' | '1Y' | 'ALL';
const PERIODS: ChartPeriod[] = ['1M', '3M', '6M', '1Y', 'ALL'];

export default function OverviewScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const { status, summary, allocations, snapshots, backup, refreshLivePrices, lastPriceRefresh } = usePortfolioStore();
  const [period, setPeriod] = useState<ChartPeriod>('ALL');
  const [refreshing, setRefreshing] = useState(false);

  const totalCash = summary
    ? (summary.bankBalance ?? 0) + (summary.dematCash ?? 0) + (summary.cryptoCash ?? 0)
    : 0;

  const pnlColor = summary
    ? gainColor(summary.totalGainLoss, colors.gain, colors.loss, colors.textSecondary)
    : colors.textSecondary;

  async function onRefresh() {
    setRefreshing(true);
    await refreshLivePrices();
    setRefreshing(false);
  }

  if (status === 'idle' || status === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner message="Loading portfolio…" />
        </View>
      </SafeAreaView>
    );
  }

  if (status === 'error' || !summary) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <EmptyState
            title="No Data"
            subtitle="Import your PortAct backup to view your portfolio."
            action={
              <Button label="Import Backup" variant="primary" onPress={() => router.replace('/onboarding')} />
            }
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
<ScrollView
        contentContainerStyle={{ padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xxxl }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* ── Net Worth card ── */}
        <LinearGradient
          colors={[`${colors.accent}22`, colors.background]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md, borderWidth: 1, borderColor: `${colors.accent}33` }}
        >
          <Typography variant="caption" color={colors.textSecondary} weight="600">NET WORTH</Typography>

          <Typography variant="hero" weight="800">{formatCompact(summary.totalValue)}</Typography>

          {/* Overall P&L */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ backgroundColor: summary.totalGainLoss >= 0 ? colors.gainSoft : colors.lossSoft, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
              <Typography variant="footnote" color={pnlColor} weight="700">
                {formatPercent(summary.gainLossPercent)} overall
              </Typography>
            </View>
            <Typography variant="footnote" color={pnlColor} weight="600">
              {summary.totalGainLoss >= 0 ? '+' : ''}{formatCompact(summary.totalGainLoss)}
            </Typography>
          </View>

          {/* 3-col breakdown */}
          <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, gap: spacing.md }}>
            {[
              { label: 'Invested', value: formatCompact(summary.totalInvested) },
              { label: 'Assets', value: String(summary.assetCount) },
              { label: 'Cash', value: formatCompact(totalCash) },
            ].map((item) => (
              <View key={item.label} style={{ flex: 1, gap: 2 }}>
                <Typography variant="micro" color={colors.textSecondary} weight="600">{item.label.toUpperCase()}</Typography>
                <Typography variant="callout" weight="700">{item.value}</Typography>
              </View>
            ))}
          </View>
        </LinearGradient>

        {/* ── Portfolio Growth chart ── */}
        {snapshots.length > 0 && (
          <Card style={{ gap: spacing.md }}>
            {/* Title and period pills on separate rows so pills never overflow on narrow screens */}
            <View style={{ gap: spacing.xs }}>
              <Typography variant="headline">Portfolio Growth</Typography>
              <View style={{ flexDirection: 'row', gap: 4, justifyContent: 'flex-end' }}>
                {PERIODS.map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setPeriod(p)}
                    hitSlop={6}
                    style={{
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 4,
                      borderRadius: 999,
                      backgroundColor: p === period ? colors.accent : colors.surfaceSecondary,
                    }}
                  >
                    <Typography
                      variant="micro"
                      color={p === period ? '#fff' : colors.textSecondary}
                      weight="600"
                    >
                      {p}
                    </Typography>
                  </Pressable>
                ))}
              </View>
            </View>
            <PortfolioLineChart snapshots={snapshots} period={period} />
          </Card>
        )}

        {/* ── Allocation ── */}
        {allocations.length > 0 && (
          <Card style={{ gap: spacing.md }}>
            <Typography variant="headline">Allocation</Typography>
            <AllocationDonut
              allocations={allocations}
              totalValue={summary.totalValue}
              size={isTablet ? 220 : 180}
            />
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
