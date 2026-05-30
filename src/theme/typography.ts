import { TextStyle } from 'react-native';

export const fontSizes = {
  micro: 10,
  caption: 12,
  footnote: 13,
  body: 15,
  callout: 16,
  headline: 17,
  title3: 20,
  title2: 22,
  title1: 28,
  display: 34,
  hero: 42,
} as const;

export const fontWeights = {
  regular: '400' as TextStyle['fontWeight'],
  medium: '500' as TextStyle['fontWeight'],
  semibold: '600' as TextStyle['fontWeight'],
  bold: '700' as TextStyle['fontWeight'],
  heavy: '800' as TextStyle['fontWeight'],
};

export const lineHeights = {
  tight: 1.1,
  snug: 1.25,
  normal: 1.4,
  relaxed: 1.6,
} as const;

export const letterSpacings = {
  tight: -0.5,
  normal: 0,
  wide: 0.5,
  wider: 1,
} as const;

export type TypographyVariant =
  | 'hero'
  | 'display'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'headline'
  | 'callout'
  | 'body'
  | 'footnote'
  | 'caption'
  | 'micro';

export const typographyStyles: Record<TypographyVariant, Pick<TextStyle, 'fontSize' | 'fontWeight' | 'lineHeight' | 'letterSpacing'>> = {
  hero: {
    fontSize: fontSizes.hero,
    fontWeight: fontWeights.bold,
    lineHeight: fontSizes.hero * lineHeights.tight,
    letterSpacing: letterSpacings.tight,
  },
  display: {
    fontSize: fontSizes.display,
    fontWeight: fontWeights.bold,
    lineHeight: fontSizes.display * lineHeights.snug,
    letterSpacing: letterSpacings.tight,
  },
  title1: {
    fontSize: fontSizes.title1,
    fontWeight: fontWeights.bold,
    lineHeight: fontSizes.title1 * lineHeights.snug,
    letterSpacing: letterSpacings.tight,
  },
  title2: {
    fontSize: fontSizes.title2,
    fontWeight: fontWeights.semibold,
    lineHeight: fontSizes.title2 * lineHeights.snug,
    letterSpacing: letterSpacings.normal,
  },
  title3: {
    fontSize: fontSizes.title3,
    fontWeight: fontWeights.semibold,
    lineHeight: fontSizes.title3 * lineHeights.normal,
    letterSpacing: letterSpacings.normal,
  },
  headline: {
    fontSize: fontSizes.headline,
    fontWeight: fontWeights.semibold,
    lineHeight: fontSizes.headline * lineHeights.normal,
    letterSpacing: letterSpacings.normal,
  },
  callout: {
    fontSize: fontSizes.callout,
    fontWeight: fontWeights.regular,
    lineHeight: fontSizes.callout * lineHeights.normal,
    letterSpacing: letterSpacings.normal,
  },
  body: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.regular,
    lineHeight: fontSizes.body * lineHeights.relaxed,
    letterSpacing: letterSpacings.normal,
  },
  footnote: {
    fontSize: fontSizes.footnote,
    fontWeight: fontWeights.regular,
    lineHeight: fontSizes.footnote * lineHeights.normal,
    letterSpacing: letterSpacings.normal,
  },
  caption: {
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.regular,
    lineHeight: fontSizes.caption * lineHeights.normal,
    letterSpacing: letterSpacings.wide,
  },
  micro: {
    fontSize: fontSizes.micro,
    fontWeight: fontWeights.medium,
    lineHeight: fontSizes.micro * lineHeights.normal,
    letterSpacing: letterSpacings.wider,
  },
};
