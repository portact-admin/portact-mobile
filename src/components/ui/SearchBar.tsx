import React from 'react';
import { View, TextInput, Pressable, ViewStyle } from 'react-native';
import { useTheme } from '@hooks/useTheme';
import { Typography } from './Typography';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: ViewStyle;
}

export function SearchBar({ value, onChangeText, placeholder = 'Search…', style }: SearchBarProps) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: spacing.md,
          height: 44,
          gap: spacing.sm,
        },
        style,
      ]}
    >
      <Typography variant="body" color={colors.textTertiary}>⌕</Typography>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        style={[
          typography.body,
          { flex: 1, color: colors.textPrimary, padding: 0 },
        ]}
        clearButtonMode="while-editing"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={placeholder}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText('')} hitSlop={8} accessibilityLabel="Clear search">
          <Typography variant="body" color={colors.textTertiary}>✕</Typography>
        </Pressable>
      )}
    </View>
  );
}
