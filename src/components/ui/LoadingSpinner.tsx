import React from 'react';
import { ActivityIndicator, View, ViewStyle } from 'react-native';
import { Typography } from './Typography';
import { useTheme } from '@hooks/useTheme';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'small' | 'large';
  style?: ViewStyle;
}

export function LoadingSpinner({ message, size = 'large', style }: LoadingSpinnerProps) {
  const { colors, spacing } = useTheme();
  return (
    <View style={[{ alignItems: 'center', gap: spacing.md }, style]}>
      <ActivityIndicator size={size} color={colors.accent} />
      {message ? (
        <Typography variant="footnote" color={colors.textSecondary} align="center">
          {message}
        </Typography>
      ) : null}
    </View>
  );
}
