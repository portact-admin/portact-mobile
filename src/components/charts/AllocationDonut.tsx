import React from 'react';
import { View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { AssetAllocation } from '@models/portfolio';
import { Typography } from '@components/ui/Typography';
import { useTheme } from '@hooks/useTheme';
import { formatCompact, formatPercent } from '@utils/formatters';

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

      {/* Vertical legend — same style as expense category chart */}
      <View style={{ gap: 6 }}>
        {allocations.map((a) => (
          <View key={a.assetType} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: a.color }} />
            <Typography variant="footnote" style={{ flex: 1 }} numberOfLines={1}>
              {a.displayName}
            </Typography>
            <Typography variant="footnote" weight="600" color={colors.textSecondary}>
              {formatCompact(a.currentValue)}
            </Typography>
            <Typography variant="micro" color={colors.textTertiary} style={{ width: 36, textAlign: 'right' }}>
              {formatPercent(a.percentage, 1)}
            </Typography>
          </View>
        ))}
      </View>
    </View>
  );
}
