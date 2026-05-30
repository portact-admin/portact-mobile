import React from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Asset } from '@models/portfolio';
import { Typography } from '@components/ui/Typography';
import { Badge } from '@components/ui/Badge';
import { useTheme } from '@hooks/useTheme';
import { formatCompact, formatPercent } from '@utils/formatters';
import { assetTypeColors } from '@theme/colors';

interface TopHoldingsProps {
  assets: Asset[];
  title?: string;
}

export function TopHoldings({ assets, title = 'Top Holdings' }: TopHoldingsProps) {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();

  if (assets.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Typography variant="headline">{title}</Typography>

      {assets.map((asset, index) => {
        const dotColor = assetTypeColors[asset.assetType] ?? colors.textTertiary;
        const isGain = asset.profitLoss >= 0;

        return (
          <Pressable
            key={asset.id}
            onPress={() => router.push(`/asset/${asset.id}`)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              padding: spacing.md,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: pressed ? 0.85 : 1,
            })}
            accessibilityRole="button"
            accessibilityLabel={`View ${asset.name}`}
          >
            {/* Rank + color dot */}
            <View style={{ width: 32, alignItems: 'center', gap: 4 }}>
              <Typography variant="caption" color={colors.textTertiary} weight="600">
                {String(index + 1).padStart(2, '0')}
              </Typography>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor }} />
            </View>

            {/* Name + type */}
            <View style={{ flex: 1, gap: 2 }}>
              <Typography variant="callout" weight="600" numberOfLines={1}>
                {asset.name}
              </Typography>
              <Typography variant="caption" color={colors.textSecondary}>
                {asset.assetTypeDisplayName}
                {asset.brokerName ? ` · ${asset.brokerName}` : ''}
              </Typography>
            </View>

            {/* Value + P&L */}
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
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
      })}
    </View>
  );
}
