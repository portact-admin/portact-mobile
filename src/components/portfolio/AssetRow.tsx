import React from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Asset } from '@models/portfolio';
import { Typography } from '@components/ui/Typography';
import { useTheme } from '@hooks/useTheme';
import { formatCompact, formatPercent } from '@utils/formatters';
import { assetTypeColors } from '@theme/colors';
import { usePortfolioStore, lookupMFRating } from '@store/usePortfolioStore';
import { Ionicons } from '@expo/vector-icons';

const NO_QTY_TYPES = new Set([
  'pf', 'nps', 'gratuity', 'pension', 'insurance_policy',
  'ppf', 'ssy', 'nsc', 'kvp', 'scss', 'mis',
  'fixed_deposit', 'recurring_deposit', 'savings_account',
  'land', 'farm_land', 'house',
  'corporate_bond', 'rbi_bond', 'tax_saving_bond',
  'physical_cash', 'physical_currency', 'physical_gold', 'physical_silver',
  'precious_stone', 'painting', 'collectible', 'physical_other',
]);

const MF_TYPES = new Set([
  'equity_mutual_fund', 'hybrid_mutual_fund', 'debt_mutual_fund', 'mutual_fund',
]);

function formatQty(quantity: number, assetType: string): string {
  if (quantity % 1 === 0) return `${quantity}`;
  const d = assetType === 'crypto' ? 6 : 4;
  return quantity.toFixed(d).replace(/\.?0+$/, '');
}

function ratingColor(rating: number, gain: string, warning: string, loss: string): string {
  if (rating >= 7.5) return gain;
  if (rating >= 5) return warning;
  return loss;
}

function ratingBg(rating: number, gainSoft: string, warningSoft: string, lossSoft: string): string {
  if (rating >= 7.5) return gainSoft;
  if (rating >= 5) return warningSoft;
  return lossSoft;
}

export type SortKey = 'name' | 'invested' | 'value' | 'day';
export type SortDir = 'asc' | 'desc';

const COL_INVESTED = 62;
const COL_VALUE    = 68;
const COL_DAY      = 46;

interface AssetRowProps {
  asset: Asset;
}

export function AssetRow({ asset }: AssetRowProps) {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const livePrices = usePortfolioStore((s) => s.livePrices);
  const mfRatingsByAssetId = usePortfolioStore((s) => s.mfRatingsByAssetId);

  const live = livePrices.get(asset.id);
  const currentPrice = live?.price ?? asset.currentPrice;
  const currentValue =
    currentPrice != null && asset.quantity != null
      ? currentPrice * asset.quantity
      : asset.currentValue;
  const dayChangePct = live?.dayChangePct ?? asset.dayChangePct;

  const dotColor = assetTypeColors[asset.assetType] ?? colors.textTertiary;
  const hasDayChange = dayChangePct != null && isFinite(dayChangePct);

  const showSymbol =
    asset.symbol &&
    asset.symbol.toUpperCase() !== asset.name.toUpperCase().slice(0, asset.symbol.length + 2);
  const showQty = asset.quantity != null && !NO_QTY_TYPES.has(asset.assetType);

  const subtitleParts: string[] = [];
  if (showSymbol) subtitleParts.push(asset.symbol!);
  if (showQty) subtitleParts.push(`${formatQty(asset.quantity!, asset.assetType)} units`);

  // Recompute P&L from the live currentValue so it stays in sync after a price
  // refresh. asset.profitLoss / profitLossPercent are stale backup values and
  // would show the wrong % whenever the live price differs from the export price.
  const overallPnl = currentValue - asset.totalInvested;
  const overallPct = asset.totalInvested > 0 ? (overallPnl / asset.totalInvested) * 100 : 0;
  const overallColor = overallPnl >= 0 ? colors.gain : colors.loss;
  const overallLabel = overallPct !== 0 ? formatPercent(overallPct, 1) : null;

  const dayColor = hasDayChange
    ? (dayChangePct === 0 ? colors.textTertiary : (dayChangePct! > 0 ? colors.gain : colors.loss))
    : colors.textTertiary;
  const dayLabel = hasDayChange
    ? `${dayChangePct! > 0 ? '+' : ''}${dayChangePct!.toFixed(2)}%`
    : null;

  const isMF = MF_TYPES.has(asset.assetType);
  const mfRating = isMF ? lookupMFRating(asset.id, asset.name, mfRatingsByAssetId) : undefined;

  return (
    <Pressable
      onPress={() => router.push(`/asset/${asset.id}`)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: spacing.md,
        paddingVertical: 10,
        gap: 8,
        backgroundColor: pressed ? colors.surfaceSecondary : 'transparent',
      })}
      accessibilityRole="button"
    >
      {/* Color bar */}
      <View style={{ width: 3, height: 32, borderRadius: 2, backgroundColor: dotColor, marginTop: 2 }} />

      {/* Name column */}
      <View style={{ flex: 1, gap: 2 }}>
        <Typography variant="footnote" weight="600" style={{ lineHeight: 17 }}>
          {asset.name}
        </Typography>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {subtitleParts.length > 0 && (
            <Typography variant="micro" color={colors.textSecondary} numberOfLines={1}>
              {subtitleParts.join('  ·  ')}
            </Typography>
          )}
          {mfRating?.rating != null && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                router.push(`/mf-rating/${asset.id}` as any);
              }}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`MF rating ${mfRating.rating.toFixed(1)} out of 10`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 2,
                backgroundColor: ratingBg(
                  mfRating.rating!,
                  colors.gainSoft,
                  `${colors.warning}22`,
                  colors.lossSoft,
                ),
                borderRadius: radius.full,
                paddingHorizontal: 6,
                paddingVertical: 2,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Typography
                variant="micro"
                weight="700"
                color={ratingColor(mfRating.rating!, colors.gain, colors.warning, colors.loss)}
              >
                ★ {mfRating.rating.toFixed(1)}
              </Typography>
            </Pressable>
          )}
        </View>
      </View>

      {/* Invested column */}
      <View style={{ width: COL_INVESTED, alignItems: 'flex-end', gap: 2 }}>
        <Typography variant="footnote" weight="500">
          {formatCompact(asset.totalInvested, asset.currency)}
        </Typography>
      </View>

      {/* Current value column — overall change % below */}
      <View style={{ width: COL_VALUE, alignItems: 'flex-end', gap: 2 }}>
        <Typography variant="footnote" weight="700">
          {formatCompact(currentValue, asset.currency)}
        </Typography>
        {overallLabel && (
          <Typography variant="micro" weight="600" color={overallColor}>
            {overallLabel}
          </Typography>
        )}
      </View>

      {/* Daily change % column */}
      <View style={{ width: COL_DAY, alignItems: 'flex-end', justifyContent: 'center', height: 34 }}>
        {dayLabel ? (
          <Typography variant="micro" weight="600" color={dayColor}>
            {dayLabel}
          </Typography>
        ) : (
          <Typography variant="micro" color={colors.textTertiary}>—</Typography>
        )}
      </View>
    </Pressable>
  );
}

interface AssetColumnHeaderProps {
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}

export function AssetColumnHeader({ sortKey, sortDir, onSort }: AssetColumnHeaderProps) {
  const { colors, spacing } = useTheme();

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) {
      return <Ionicons name="swap-vertical-outline" size={10} color={colors.textTertiary} />;
    }
    return (
      <Ionicons
        name={sortDir === 'asc' ? 'chevron-up' : 'chevron-down'}
        size={10}
        color={colors.accent}
      />
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      {/* Spacer matching the 3px color bar */}
      <View style={{ width: 3 }} />

      <Pressable
        onPress={() => onSort('name')}
        hitSlop={8}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 }}
      >
        <Typography
          variant="micro"
          color={sortKey === 'name' ? colors.accent : colors.textTertiary}
          weight="600"
        >
          NAME
        </Typography>
        <SortIcon col="name" />
      </Pressable>

      <Pressable
        onPress={() => onSort('invested')}
        hitSlop={8}
        style={{ width: COL_INVESTED, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}
      >
        <SortIcon col="invested" />
        <Typography
          variant="micro"
          color={sortKey === 'invested' ? colors.accent : colors.textTertiary}
          weight="600"
        >
          INVESTED
        </Typography>
      </Pressable>

      <Pressable
        onPress={() => onSort('value')}
        hitSlop={8}
        style={{ width: COL_VALUE, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}
      >
        <SortIcon col="value" />
        <Typography
          variant="micro"
          color={sortKey === 'value' ? colors.accent : colors.textTertiary}
          weight="600"
        >
          VALUE
        </Typography>
      </Pressable>

      <Pressable
        onPress={() => onSort('day')}
        hitSlop={8}
        style={{ width: COL_DAY, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}
      >
        <SortIcon col="day" />
        <Typography
          variant="micro"
          color={sortKey === 'day' ? colors.accent : colors.textTertiary}
          weight="600"
        >
          DAY%
        </Typography>
      </Pressable>
    </View>
  );
}
