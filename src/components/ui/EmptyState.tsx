import React from 'react';
import { View, ViewStyle } from 'react-native';
import { Typography } from './Typography';
import { useTheme } from '@hooks/useTheme';

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  style?: ViewStyle;
}

export function EmptyState({ title, subtitle, action, style }: EmptyStateProps) {
  const { colors, spacing } = useTheme();
  return (
    <View style={[{ alignItems: 'center', gap: spacing.sm, padding: spacing.xl }, style]}>
      <Typography variant="title3" align="center">{title}</Typography>
      {subtitle ? (
        <Typography variant="body" color={colors.textSecondary} align="center">
          {subtitle}
        </Typography>
      ) : null}
      {action}
    </View>
  );
}
