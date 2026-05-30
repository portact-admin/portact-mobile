import { useColorScheme } from 'react-native';
import { useThemeStore } from '@store/useThemeStore';
import { darkColors, lightColors, ThemeColors } from '@theme/colors';
import { spacing, radius, iconSizes } from '@theme/spacing';
import { typographyStyles, TypographyVariant } from '@theme/typography';

export interface Theme {
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  iconSizes: typeof iconSizes;
  typography: typeof typographyStyles;
  isDark: boolean;
}

export function useTheme(): Theme {
  const preference = useThemeStore((s) => s.preference);
  const systemScheme = useColorScheme();
  const isDark = preference === 'system'
    ? systemScheme === 'dark'
    : preference === 'dark';

  return {
    colors: isDark ? darkColors : lightColors,
    spacing,
    radius,
    iconSizes,
    typography: typographyStyles,
    isDark,
  };
}

export type { TypographyVariant };
