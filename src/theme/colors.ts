export const palette = {
  blue50: '#EBF2FF',
  blue100: '#C3D9FF',
  blue400: '#4D94FF',
  blue500: '#1A6EFF',
  blue600: '#0055E6',

  green50: '#E6FAF0',
  green400: '#2ED882',
  green500: '#00C853',
  green600: '#00A844',

  red50: '#FFF0EF',
  red400: '#FF6B63',
  red500: '#FF3B30',
  red600: '#D62B21',

  amber400: '#FFB733',
  amber500: '#FF9500',

  purple400: '#BF7FFF',
  purple500: '#A259FF',

  neutral0: '#FFFFFF',
  neutral50: '#F5F5F7',
  neutral100: '#E5E5EA',
  neutral200: '#D1D1D6',
  neutral300: '#AEAEB2',
  neutral400: '#8E8E93',
  neutral500: '#636366',
  neutral600: '#48484A',
  neutral700: '#3A3A3C',
  neutral800: '#2C2C2E',
  neutral850: '#1C1C1E',
  neutral900: '#121214',
  neutral950: '#0A0A0F',
  neutral1000: '#000000',
} as const;

export type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  backgroundSecondary: string;
  surface: string;
  surfaceSecondary: string;
  border: string;
  borderSubtle: string;

  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;

  accent: string;
  accentSoft: string;
  gain: string;
  gainSoft: string;
  loss: string;
  lossSoft: string;
  warning: string;

  tabBar: string;
  tabBarBorder: string;
}

export const lightColors: ThemeColors = {
  background: palette.neutral50,
  backgroundSecondary: palette.neutral100,
  surface: palette.neutral0,
  surfaceSecondary: palette.neutral50,
  border: palette.neutral100,
  borderSubtle: palette.neutral200,

  textPrimary: palette.neutral1000,
  textSecondary: palette.neutral500,
  textTertiary: palette.neutral300,
  textInverse: palette.neutral0,

  accent: palette.blue500,
  accentSoft: palette.blue50,
  gain: palette.green500,
  gainSoft: palette.green50,
  loss: palette.red500,
  lossSoft: palette.red50,
  warning: palette.amber500,

  tabBar: palette.neutral0,
  tabBarBorder: palette.neutral100,
};

export const darkColors: ThemeColors = {
  background: palette.neutral950,
  backgroundSecondary: palette.neutral900,
  surface: palette.neutral850,
  surfaceSecondary: palette.neutral800,
  border: palette.neutral800,
  borderSubtle: palette.neutral700,

  textPrimary: palette.neutral0,
  textSecondary: palette.neutral400,
  textTertiary: palette.neutral600,
  textInverse: palette.neutral1000,

  accent: palette.blue400,
  accentSoft: '#0D1F3C',
  gain: palette.green400,
  gainSoft: '#0A2318',
  loss: palette.red400,
  lossSoft: '#2A0F0E',
  warning: palette.amber400,

  tabBar: palette.neutral850,
  tabBarBorder: palette.neutral800,
};

export const assetTypeColors: Record<string, string> = {
  // Equities
  stock:              palette.blue500,   // #1A6EFF
  us_stock:           '#457B9D',
  esop:               '#2563EB',
  rsu:                '#3B82F6',
  reit:               '#10B981',
  invit:              '#059669',

  // Mutual Funds
  equity_mutual_fund: palette.purple500, // #A259FF
  hybrid_mutual_fund: '#7B61FF',
  debt_mutual_fund:   '#00BCD4',
  mutual_fund:        palette.purple500,

  // Commodities & Precious Metals
  commodity:          '#FFC107',         // gold/amber
  sovereign_gold_bond:'#FF8F00',         // deeper amber-gold
  sgb:                '#FF8F00',         // alias
  physical_gold:      '#D4A017',         // muted gold
  physical_silver:    '#90A4AE',         // silver-grey
  physical_other:     '#A1887F',

  // Crypto
  crypto:             palette.amber500,  // #FF9500

  // Fixed Income / Savings
  fixed_deposit:      palette.green500,
  recurring_deposit:  '#1ABC9C',
  savings_account:    '#26C6DA',
  corporate_bond:     '#26A69A',
  rbi_bond:           '#80CBC4',
  tax_saving_bond:    '#4DB6AC',
  bond:               '#48CAE4',

  // Govt Schemes
  ppf:                palette.green600,
  ssy:                '#F06292',
  nps:                '#00B4D8',
  nsc:                '#43A047',
  kvp:                '#388E3C',
  scss:               '#2E7D32',
  mis:                '#558B2F',

  // Retirement / Benefits
  pf:                 '#4CAF50',
  gratuity:           '#F57C00',         // warm orange
  pension:            '#EF6C00',

  // Insurance
  insurance:          '#9C27B0',
  insurance_policy:   '#7B1FA2',         // deep purple

  // Real Estate
  real_estate:        '#E76F51',
  land:               '#8D6E63',
  farm_land:          '#6D4C41',
  house:              '#795548',

  // Physical / Other
  physical_cash:      '#78909C',
  physical_currency:  '#546E7A',
  etf:                '#2196F3',

  default:            palette.neutral400,
};
