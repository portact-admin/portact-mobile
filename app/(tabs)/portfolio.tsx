import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { FlatList, View, ScrollView, Pressable, ActivityIndicator, RefreshControl, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, Gesture, Directions } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@hooks/useTheme';
import { usePortfolioStore } from '@store/usePortfolioStore';
import { AssetRow, AssetColumnHeader, SortKey, SortDir } from '@components/portfolio/AssetRow';
import { Typography } from '@components/ui/Typography';
import { Divider } from '@components/ui/Divider';
import { EmptyState } from '@components/ui/EmptyState';
import { Button } from '@components/ui/Button';
import { formatCompact, formatPercent, gainColor } from '@utils/formatters';
import { Asset } from '@models/portfolio';
import { useRouter } from 'expo-router';

interface TabDef { key: string; label: string; types: string[] }

const TABS: TabDef[] = [
  { key: 'stocks',      label: 'Stocks',        types: ['stock', 'esop', 'rsu', 'reit', 'invit'] },
  { key: 'us_stocks',  label: 'US Stocks',     types: ['us_stock'] },
  { key: 'equity_mf',  label: 'Equity MFs',    types: ['equity_mutual_fund'] },
  { key: 'hybrid_mf',  label: 'Hybrid MFs',    types: ['hybrid_mutual_fund'] },
  { key: 'commodities',label: 'Commodities',   types: ['commodity', 'sovereign_gold_bond'] },
  { key: 'debt_mf',    label: 'Debt MFs',      types: ['debt_mutual_fund'] },
  { key: 'crypto',     label: 'Crypto',        types: ['crypto'] },
  { key: 'deposits',   label: 'Deposits',      types: ['fixed_deposit', 'recurring_deposit', 'savings_account'] },
  { key: 'retirement', label: 'Retirement',    types: ['pf', 'nps', 'gratuity', 'pension', 'insurance_policy'] },
  { key: 'govt',       label: 'Govt Schemes',  types: ['ppf', 'ssy', 'nsc', 'kvp', 'scss', 'mis'] },
  { key: 'real_estate',label: 'Real Estate',   types: ['land', 'farm_land', 'house'] },
  { key: 'bonds',      label: 'Bonds',         types: ['corporate_bond', 'rbi_bond', 'tax_saving_bond'] },
  { key: 'physical',   label: 'Physical',      types: ['physical_cash', 'physical_currency', 'physical_gold', 'physical_silver', 'precious_stone', 'painting', 'collectible', 'physical_other'] },
];

function TabSummaryCard({ assets, style }: { assets: Asset[]; style?: object }) {
  const { colors, spacing, radius } = useTheme();
  const livePrices = usePortfolioStore((s) => s.livePrices);

  const { totalValue, totalInvested, totalGainLoss, gainLossPct } = useMemo(() => {
    let tv = 0, ti = 0;
    for (const a of assets) {
      const live = livePrices.get(a.id);
      const price = live?.price ?? a.currentPrice;
      const val = price != null && a.quantity != null ? price * a.quantity : a.currentValue;
      tv += val;
      ti += a.totalInvested;
    }
    const gl = tv - ti;
    return { totalValue: tv, totalInvested: ti, totalGainLoss: gl, gainLossPct: ti > 0 ? (gl / ti) * 100 : 0 };
  }, [assets, livePrices]);

  const glColor = gainColor(totalGainLoss, colors.gain, colors.loss, colors.textSecondary);

  return (
    <View
      style={[{
        marginHorizontal: spacing.md,
        marginBottom: spacing.sm,
        borderRadius: radius.lg,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      }, style]}
    >
      <View style={{ gap: 2 }}>
        <Typography variant="micro" color={colors.textSecondary} weight="600">TOTAL VALUE</Typography>
        <Typography variant="title3" weight="800">{formatCompact(totalValue)}</Typography>
        <Typography variant="caption" color={colors.textTertiary}>
          {assets.length} holding{assets.length !== 1 ? 's' : ''}
        </Typography>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        <Typography variant="micro" color={colors.textSecondary} weight="600">INVESTED</Typography>
        <Typography variant="callout" weight="700">{formatCompact(totalInvested)}</Typography>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: totalGainLoss >= 0 ? colors.gainSoft : colors.lossSoft,
          borderRadius: 999,
          paddingHorizontal: 8,
          paddingVertical: 2,
        }}>
          <Typography variant="caption" color={glColor} weight="700">
            {totalGainLoss >= 0 ? '+' : ''}{formatCompact(totalGainLoss)}
            {totalInvested > 0 ? ` (${formatPercent(gainLossPct, 1)})` : ''}
          </Typography>
        </View>
      </View>
    </View>
  );
}

export default function PortfolioScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const { assets, status, priceRefreshing, refreshLivePrices, livePrices } = usePortfolioStore();
  const [activeTab, setActiveTab] = useState(TABS[0].key);
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [refreshResult, setRefreshResult] = useState<{ refreshed: number; total: number } | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  // Tab scroll
  const tabScrollRef = useRef<ScrollView>(null);
  const tabScrollWidthRef = useRef(0);
  const tabLayoutsRef = useRef<Map<string, { x: number; width: number }>>(new Map());

  // Refs so gesture callbacks (UI thread) always read the latest JS state
  const activeTabRef = useRef(activeTab);
  const tabsWithAssetsRef = useRef<TabDef[]>([]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // Scroll the tab strip so the active tab is centred
  useEffect(() => {
    const layout = tabLayoutsRef.current.get(activeTab);
    if (!layout || !tabScrollRef.current) return;
    const offset = layout.x + layout.width / 2 - tabScrollWidthRef.current / 2;
    tabScrollRef.current.scrollTo({ x: Math.max(0, offset), animated: true });
  }, [activeTab]);

  async function handleRefresh() {
    if (priceRefreshing) return;
    setRefreshResult(null);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    const result = await refreshLivePrices();
    setRefreshResult(result);
    dismissTimer.current = setTimeout(() => setRefreshResult(null), 5000);
  }

  const tabsWithAssets = useMemo(() => {
    const typeSet = new Set(assets.map((a) => a.assetType));
    return TABS.filter((t) => t.types.some((ty) => typeSet.has(ty)));
  }, [assets]);

  // Reset to first available tab if the current tab no longer has assets
  useEffect(() => {
    if (tabsWithAssets.length > 0 && !tabsWithAssets.find((t) => t.key === activeTab)) {
      setActiveTab(tabsWithAssets[0].key);
    }
  }, [tabsWithAssets, activeTab]);

  const activeAssets = useMemo(() => {
    const tab = TABS.find((t) => t.key === activeTab);
    if (!tab) return [];
    const filtered = assets.filter((a) => tab.types.includes(a.assetType));
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name')     cmp = a.name.localeCompare(b.name);
      if (sortKey === 'invested') cmp = a.totalInvested - b.totalInvested;
      if (sortKey === 'value')    cmp = a.currentValue - b.currentValue;
      if (sortKey === 'day') {
        // Use the same value that AssetRow displays: live price dayChangePct first,
        // falling back to backup value. Assets with no data sort to the bottom.
        const da = (livePrices.get(a.id)?.dayChangePct ?? a.dayChangePct) ?? Infinity;
        const db = (livePrices.get(b.id)?.dayChangePct ?? b.dayChangePct) ?? Infinity;
        cmp = da - db;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [assets, activeTab, sortKey, sortDir, livePrices]);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return key;
      }
      // name → A-Z; day% → most negative first (biggest losers/movers at top); others → highest first
      setSortDir(key === 'name' ? 'asc' : key === 'day' ? 'asc' : 'desc');
      return key;
    });
  }, []);

  // Keep ref in sync so gesture callbacks can read the latest list
  useEffect(() => { tabsWithAssetsRef.current = tabsWithAssets; }, [tabsWithAssets]);

  const goToNextTab = useCallback(() => {
    const tabs = tabsWithAssetsRef.current;
    const idx = tabs.findIndex((t) => t.key === activeTabRef.current);
    if (idx < tabs.length - 1) setActiveTab(tabs[idx + 1].key);
  }, []);

  const goToPrevTab = useCallback(() => {
    const tabs = tabsWithAssetsRef.current;
    const idx = tabs.findIndex((t) => t.key === activeTabRef.current);
    if (idx > 0) setActiveTab(tabs[idx - 1].key);
  }, []);

  const swipeGesture = useMemo(
    () =>
      Gesture.Race(
        Gesture.Fling().direction(Directions.LEFT).onEnd(() => runOnJS(goToNextTab)()),
        Gesture.Fling().direction(Directions.RIGHT).onEnd(() => runOnJS(goToPrevTab)()),
      ),
    [goToNextTab, goToPrevTab],
  );

  const renderItem = useCallback(
    ({ item }: { item: Asset }) => <AssetRow asset={item} />,
    [],
  );

  const renderSeparator = useCallback(
    () => <Divider style={{ marginLeft: spacing.md + 3 + 10 }} />,
    [spacing],
  );

  if (status === 'idle' || (status === 'loaded' && assets.length === 0)) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <EmptyState
            title="No assets found"
            subtitle="Import your PortAct backup to see your portfolio."
            action={<Button label="Import Backup" variant="primary" onPress={() => router.replace('/onboarding')} />}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Title row with refresh button */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
        paddingBottom: spacing.xs,
      }}>
        <Typography variant="title2" weight="700">Portfolio</Typography>
        <Pressable
          onPress={handleRefresh}
          disabled={priceRefreshing}
          hitSlop={12}
          style={{ padding: 4 }}
        >
          {priceRefreshing
            ? <ActivityIndicator size="small" color={colors.accent} />
            : <Ionicons name="refresh-outline" size={22} color={colors.textSecondary} />}
        </Pressable>
      </View>

      {/* Refresh result banner — auto-dismisses after 5 s */}
      {refreshResult && (
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.xs,
        }}>
          <Ionicons
            name={refreshResult.refreshed > 0 ? 'checkmark-circle' : 'alert-circle-outline'}
            size={14}
            color={refreshResult.refreshed > 0 ? colors.gain : colors.textTertiary}
          />
          <Typography variant="caption" color={refreshResult.refreshed > 0 ? colors.gain : colors.textTertiary}>
            {refreshResult.refreshed} of {refreshResult.total} prices updated
          </Typography>
        </View>
      )}

      {/* Tab bar — underline style, no clipping */}
      <View
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
        onLayout={(e: LayoutChangeEvent) => { tabScrollWidthRef.current = e.nativeEvent.layout.width; }}
      >
        <ScrollView
          ref={tabScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.md }}
        >
          {tabsWithAssets.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                onLayout={(e: LayoutChangeEvent) => {
                  tabLayoutsRef.current.set(tab.key, {
                    x: e.nativeEvent.layout.x,
                    width: e.nativeEvent.layout.width,
                  });
                }}
                style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10 }}
              >
                <Typography
                  variant="footnote"
                  weight={isActive ? '700' : '500'}
                  color={isActive ? colors.accent : colors.textSecondary}
                >
                  {tab.label}
                </Typography>
                {/* Active indicator sits flush with the container's bottom border */}
                {isActive && (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 2.5,
                      backgroundColor: colors.accent,
                      borderTopLeftRadius: 2,
                      borderTopRightRadius: 2,
                    }}
                  />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <GestureDetector gesture={swipeGesture}>
        <View style={{ flex: 1 }}>
          <TabSummaryCard assets={activeAssets} style={{ marginTop: spacing.md }} />

          <FlatList
            data={activeAssets}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            ItemSeparatorComponent={renderSeparator}
            ListHeaderComponent={<AssetColumnHeader sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
            ListEmptyComponent={
              <EmptyState
                title="No assets here"
                subtitle="This category has no holdings in your backup."
                style={{ marginTop: spacing.xl }}
              />
            }
            contentContainerStyle={{ paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={priceRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.accent}
                colors={[colors.accent]}
              />
            }
          />
        </View>
      </GestureDetector>
    </SafeAreaView>
  );
}
