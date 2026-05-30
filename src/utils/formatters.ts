import dayjs from 'dayjs';

const INR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function formatCurrency(
  value: number,
  currency = 'INR',
  compact = false,
): string {
  if (!isFinite(value)) return '—';
  if (compact) return formatCompact(value, currency);
  return currency === 'USD'
    ? USD_FORMATTER.format(value)
    : INR_FORMATTER.format(value);
}

export function formatCompact(value: number, currency = 'INR'): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const prefix = currency === 'USD' ? '$' : '₹';

  if (abs >= 1_00_00_000) return `${sign}${prefix}${(abs / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `${sign}${prefix}${(abs / 1_00_000).toFixed(2)}L`;
  if (abs >= 1_000) return `${sign}${prefix}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${prefix}${abs.toFixed(0)}`;
}

export function formatPercent(value: number, decimals = 2): string {
  if (!isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number, decimals = 2): string {
  if (!isFinite(value)) return '—';
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  }).format(value);
}

export function formatDate(dateStr: string | null, format = 'DD MMM YYYY'): string {
  if (!dateStr) return '—';
  const d = dayjs(dateStr);
  return d.isValid() ? d.format(format) : '—';
}

export function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = dayjs(dateStr);
  if (!d.isValid()) return '—';
  const now = dayjs();
  const diffDays = now.diff(d, 'day');
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.format('DD MMM YYYY');
}

export function gainColor(value: number, gainColor: string, lossColor: string, neutralColor: string): string {
  if (value > 0) return gainColor;
  if (value < 0) return lossColor;
  return neutralColor;
}
