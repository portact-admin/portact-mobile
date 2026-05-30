import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { Typography } from './Typography';
import { useTheme } from '@hooks/useTheme';

type BadgeVariant = 'gain' | 'loss' | 'neutral' | 'accent' | 'warning';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

export function Badge({ label, variant = 'neutral', size = 'sm', style }: BadgeProps) {
  const { colors, radius, spacing } = useTheme();

  const bgMap: Record<BadgeVariant, string> = {
    gain: colors.gainSoft,
    loss: colors.lossSoft,
    neutral: colors.surfaceSecondary,
    accent: colors.accentSoft,
    warning: `${colors.warning}22`,
  };

  const textMap: Record<BadgeVariant, string> = {
    gain: colors.gain,
    loss: colors.loss,
    neutral: colors.textSecondary,
    accent: colors.accent,
    warning: colors.warning,
  };

  const padV = size === 'sm' ? spacing.xs / 2 : spacing.xs;
  const padH = size === 'sm' ? spacing.sm : spacing.md;

  return (
    <View
      style={[
        {
          backgroundColor: bgMap[variant],
          borderRadius: radius.full,
          paddingVertical: padV,
          paddingHorizontal: padH,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      <Typography
        variant={size === 'sm' ? 'micro' : 'caption'}
        color={textMap[variant]}
        weight="600"
      >
        {label}
      </Typography>
    </View>
  );
}
