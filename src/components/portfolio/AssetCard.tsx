import React from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Asset } from '@models/portfolio';
import { Typography } from '@components/ui/Typography';
import { Badge } from '@components/ui/Badge';
import { useTheme } from '@hooks/useTheme';
import { formatCompact, formatPercent, formatCurrency } from '@utils/formatters';
import { assetTypeColors } from '@theme/colors';

interface AssetCardProps {
  asset: Asset;
}

export function AssetCard({ asset }: AssetCardProps) {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const dotColor = assetTypeColors[asset.assetType] ?? colors.textTertiary;
  const isGain = asset.profitLoss >= 0;

  return (
    <Pressable
      onPress={() => router.push(`/asset/${asset.id}`)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        gap: spacing.md,
        backgroundColor: pressed ? colors.surfaceSecondary : 'transparent',
        borderRadius: radius.md,
      })}
      accessibilityRole="button"
      accessibilityLabel={`${asset.name}, ${formatCompact(asset.currentValue)}`}
    >
      {/* Color dot indicator */}
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: `${dotColor}22`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dotColor }} />
      </View>

      {/* Name / broker */}
      <View style={{ flex: 1, gap: 2 }}>
        <Typography variant="callout" weight="600" numberOfLines={1}>
          {asset.name}
        </Typography>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          {asset.brokerName ? (
            <Typography variant="caption" color={colors.textSecondary} numberOfLines={1}>
              {asset.brokerName}
            </Typography>
          ) : null}
          {asset.quantity != null && (
            <Typography variant="caption" color={colors.textTertiary}>
              {asset.quantity % 1 === 0
                ? `${asset.quantity} units`
                : `${asset.quantity.toFixed(4)} units`}
            </Typography>
          )}
        </View>
      </View>

      {/* Value + P&L */}
      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        <Typography variant="callout" weight="700">
          {formatCompact(asset.currentValue)}
        </Typography>
        <Badge
          label={formatPercent(asset.profitLossPercent, 1)}
          variant={isGain ? 'gain' : 'loss'}
          size="sm"
        />
      </View>
    </Pressable>
  );
}
