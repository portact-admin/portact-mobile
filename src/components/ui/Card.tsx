import React from 'react';
import { View, ViewStyle, StyleProp, Pressable, PressableProps } from 'react-native';
import { useTheme } from '@hooks/useTheme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  onPress?: PressableProps['onPress'];
}

export function Card({ children, style, padding, onPress }: CardProps) {
  const theme = useTheme();
  const { colors, radius, spacing } = theme;

  const baseStyle: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: padding ?? spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [baseStyle, { opacity: pressed ? 0.85 : 1 }, style]}
        accessibilityRole="button"
      >
        {children}
      </Pressable>
    );
  }

  return <View style={[baseStyle, style]}>{children}</View>;
}
