import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useTheme } from '@hooks/useTheme';

interface DividerProps {
  vertical?: boolean;
  style?: ViewStyle;
}

export function Divider({ vertical, style }: DividerProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.border,
          ...(vertical
            ? { width: 1, alignSelf: 'stretch' }
            : { height: 1, alignSelf: 'stretch' }),
        },
        style,
      ]}
    />
  );
}
