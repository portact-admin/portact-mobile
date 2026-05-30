import React from 'react';
import { Pressable, View, ActivityIndicator, ViewStyle, StyleProp, PressableProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Typography } from './Typography';
import { useTheme } from '@hooks/useTheme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  leftIcon,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const { colors, radius, spacing, typography } = useTheme();

  const heightMap: Record<ButtonSize, number> = { sm: 36, md: 48, lg: 56 };
  const paddingMap: Record<ButtonSize, number> = { sm: spacing.md, md: spacing.lg, lg: spacing.xl };
  const variantMap: Record<ButtonSize, keyof typeof typography> = { sm: 'footnote', md: 'callout', lg: 'headline' };

  const height = heightMap[size];
  const paddingH = paddingMap[size];
  const isDisabled = disabled || loading;

  const containerStyle: ViewStyle = {
    height,
    paddingHorizontal: paddingH,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
    opacity: isDisabled ? 0.5 : 1,
  };

  const inner = (
    <>
      {loading
        ? <ActivityIndicator size="small" color={variant === 'primary' ? '#fff' : colors.accent} />
        : leftIcon}
      <Typography
        variant={variantMap[size]}
        color={
          variant === 'primary' ? '#fff'
          : variant === 'danger' ? colors.loss
          : colors.accent
        }
        weight="600"
      >
        {label}
      </Typography>
    </>
  );

  if (variant === 'primary') {
    return (
      <Pressable
        disabled={isDisabled}
        style={({ pressed }) => [containerStyle, { opacity: pressed ? 0.8 : isDisabled ? 0.5 : 1 }, style]}
        accessibilityRole="button"
        accessibilityLabel={label}
        {...rest}
      >
        <LinearGradient
          colors={[colors.accent, `${colors.accent}CC`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: radius.md,
          }}
        />
        {inner}
      </Pressable>
    );
  }

  const bgMap: Record<ButtonVariant, string> = {
    primary: colors.accent,
    secondary: colors.accentSoft,
    ghost: 'transparent',
    danger: colors.lossSoft,
  };

  return (
    <Pressable
      disabled={isDisabled}
      style={({ pressed }) => [
        containerStyle,
        { backgroundColor: bgMap[variant], opacity: pressed ? 0.8 : isDisabled ? 0.5 : 1 },
        variant !== 'ghost' ? undefined : { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...rest}
    >
      {inner}
    </Pressable>
  );
}
