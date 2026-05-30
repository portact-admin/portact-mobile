import React from 'react';
import { Text, TextStyle, TextProps } from 'react-native';
import { useTheme, TypographyVariant } from '@hooks/useTheme';

interface TypographyProps extends TextProps {
  variant?: TypographyVariant;
  color?: string;
  align?: TextStyle['textAlign'];
  weight?: TextStyle['fontWeight'];
  children: React.ReactNode;
}

export function Typography({
  variant = 'body',
  color,
  align,
  weight,
  style,
  children,
  ...rest
}: TypographyProps) {
  const theme = useTheme();
  const variantStyle = theme.typography[variant];

  return (
    <Text
      style={[
        variantStyle,
        { color: color ?? theme.colors.textPrimary },
        align ? { textAlign: align } : undefined,
        weight ? { fontWeight: weight } : undefined,
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
}
