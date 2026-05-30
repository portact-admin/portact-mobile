import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PortfolioSummary } from '@models/portfolio';
import { Typography } from '@components/ui/Typography';
import { useTheme } from '@hooks/useTheme';
import { formatCompact, formatPercent, gainColor } from '@utils/formatters';

interface NetWorthHeaderProps {
  summary: PortfolioSummary;
}

export function NetWorthHeader({ summary }: NetWorthHeaderProps) {
  const { colors, spacing, radius } = useTheme();
  const pnlColor = gainColor(summary.totalGainLoss, colors.gain, colors.loss, colors.textSecondary);

  return (
    <LinearGradient
      colors={[`${colors.accent}22`, colors.background]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{
        borderRadius: radius.xl,
        padding: spacing.xl,
        gap: spacing.md,
        borderWidth: 1,
        borderColor: `${colors.accent}33`,
      }}
    >
      <Typography variant="caption" color={colors.textSecondary} weight="600">
        NET WORTH
      </Typography>

      <Typography variant="hero" weight="800">
        {formatCompact(summary.totalValue)}
      </Typography>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View
          style={{
            backgroundColor: summary.totalGainLoss >= 0 ? colors.gainSoft : colors.lossSoft,
            borderRadius: radius.full,
            paddingHorizontal: spacing.sm,
            paddingVertical: 3,
          }}
        >
          <Typography variant="footnote" color={pnlColor} weight="700">
            {formatPercent(summary.gainLossPercent)}
          </Typography>
        </View>
        <Typography variant="footnote" color={pnlColor} weight="600">
          {summary.totalGainLoss >= 0 ? '+' : ''}{formatCompact(summary.totalGainLoss)} overall
        </Typography>
      </View>

      {/* 3-column breakdown */}
      <View
        style={{
          flexDirection: 'row',
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: spacing.md,
          gap: spacing.md,
        }}
      >
        {[
          { label: 'Invested', value: summary.totalInvested },
          { label: 'Bank', value: summary.bankBalance },
          { label: 'Holdings', value: summary.assetCount, isCount: true },
        ].map((item) => (
          <View key={item.label} style={{ flex: 1, gap: 2 }}>
            <Typography variant="micro" color={colors.textSecondary} weight="600">
              {item.label.toUpperCase()}
            </Typography>
            <Typography variant="callout" weight="700">
              {item.isCount ? String(item.value) : formatCompact(item.value)}
            </Typography>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
}
