import React from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Asset } from '@models/portfolio';
import { Typography } from '@components/ui/Typography';
import { useTheme } from '@hooks/useTheme';
import { formatCompact, formatPercent } from '@utils/formatters';
import { assetTypeColors } from '@theme/colors';
import { usePortfolioStore } from '@store/usePortfolioStore';

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

// Fixed widths for the two right-hand columns — keep them consistent across all rows.
const COL_INVESTED = 68;
const COL_VALUE = 72;

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
  const dayChangePositive = (dayChangePct ?? 0) >= 0;

  const showSymbol =
    asset.symbol &&
    asset.symbol.toUpperCase() !== asset.name.toUpperCase().slice(0, asset.symbol.length + 2);
  const showQty = asset.quantity != null && !NO_QTY_TYPES.has(asset.assetType);

  const subtitleParts: string[] = [];
  if (showSymbol) subtitleParts.push(asset.symbol!);
  if (showQty) subtitleParts.push(`${formatQty(asset.quantity!, asset.assetType)} units`);

  const pnlColor =
    hasDayChange
      ? dayChangePct === 0
        ? colors.textTertiary
        : dayChangePositive
        ? colors.gain
        : colors.loss
      : asset.profitLoss >= 0
      ? colors.gain
      : colors.loss;

  const pnlLabel = hasDayChange
    ? `${dayChangePositive ? '+' : ''}${(dayChangePct!).toFixed(2)}%`
    : asset.profitLossPercent !== 0
    ? formatPercent(asset.profitLossPercent, 1)
    : null;

  const isMF = MF_TYPES.has(asset.assetType);
  const mfRating = isMF ? mfRatingsByAssetId.get(asset.id) : undefined;

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

      {/* Name column — wraps freely */}
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

      {/* Current value column */}
      <View style={{ width: COL_VALUE, alignItems: 'flex-end', gap: 2 }}>
        <Typography variant="footnote" weight="700">
          {formatCompact(currentValue, asset.currency)}
        </Typography>
        {pnlLabel && (
          <Typography variant="micro" weight="600" color={pnlColor}>
            {pnlLabel}
          </Typography>
        )}
      </View>
    </Pressable>
  );
}

/** Column header row — render once above the asset list. */
export function AssetColumnHeader() {
  const { colors, spacing } = useTheme();
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

      <Typography variant="micro" color={colors.textTertiary} weight="600" style={{ flex: 1 }}>
        NAME
      </Typography>

      <Typography
        variant="micro"
        color={colors.textTertiary}
        weight="600"
        style={{ width: COL_INVESTED, textAlign: 'right' }}
      >
        INVESTED
      </Typography>

      <Typography
        variant="micro"
        color={colors.textTertiary}
        weight="600"
        style={{ width: COL_VALUE, textAlign: 'right' }}
      >
        VALUE
      </Typography>
    </View>
  );
}
