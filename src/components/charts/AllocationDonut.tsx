import React from 'react';
import { View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { AssetAllocation } from '@models/portfolio';
import { Typography } from '@components/ui/Typography';
import { useTheme } from '@hooks/useTheme';
import { formatCompact } from '@utils/formatters';

interface AllocationDonutProps {
  allocations: AssetAllocation[];
  totalValue: number;
  size?: number;
}

export function AllocationDonut({ allocations, totalValue, size = 180 }: AllocationDonutProps) {
  const { colors, spacing } = useTheme();

  const pieData = allocations.map((a) => ({
    value: a.percentage,
    color: a.color,
    text: a.percentage >= 8 ? `${a.percentage.toFixed(0)}%` : '',
  }));

  if (pieData.length === 0) {
    return (
      <View style={{ height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="footnote" color={colors.textSecondary}>No data</Typography>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.lg }}>
      {/* Donut chart */}
      <View style={{ alignItems: 'center' }}>
        <PieChart
          data={pieData}
          donut
          radius={size / 2}
          innerRadius={size / 2 - 36}
          showText
          textSize={11}
          fontWeight="700"
          strokeColor={colors.background}
          strokeWidth={2}
          centerLabelComponent={() => (
            <View style={{ alignItems: 'center' }}>
              <Typography variant="micro" color={colors.textSecondary} align="center">TOTAL</Typography>
              <Typography variant="footnote" weight="700" align="center">
                {formatCompact(totalValue)}
              </Typography>
            </View>
          )}
        />
      </View>

      {/* Vertical legend */}
      <View style={{ gap: 8 }}>
        {allocations.map((a) => (
          <View key={a.assetType} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: a.color, flexShrink: 0 }} />
            <Typography variant="footnote" style={{ flex: 1 }} numberOfLines={1}>
              {a.displayName}
            </Typography>
            <Typography variant="footnote" weight="600" color={colors.textSecondary}>
              {formatCompact(a.currentValue)}
            </Typography>
            <View style={{
              minWidth: 52,
              alignItems: 'flex-end',
            }}>
              <Typography variant="footnote" weight="700" color={colors.textPrimary}>
                {a.percentage.toFixed(1)}%
              </Typography>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
