import React, { useMemo } from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@hooks/useTheme';
import { usePortfolioStore } from '@store/usePortfolioStore';
import { Typography } from '@components/ui/Typography';
import { Card } from '@components/ui/Card';
import { Badge } from '@components/ui/Badge';
import { Divider } from '@components/ui/Divider';
import { EmptyState } from '@components/ui/EmptyState';
import { formatCurrency, formatCompact, formatNumber, formatPercent, formatDate, formatRelativeDate } from '@utils/formatters';
import { assetTypeColors } from '@theme/colors';
import { RawTransaction } from '@models/backup';

// ─── Smart formatter for raw detail fields ───────────────────────────────────
const DATE_KEY_RE = /date|_at$|_on$|maturity|listing|start|end|expiry|inception/i;
const CURRENCY_KEY_RE = /value|price|amount|face|nav|balance|invested|profit|loss|corpus|dividend/i;
const PERCENT_KEY_RE = /rate|ratio|yield|percentage|return|irr|xirr|cagr|expense/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T.*)?$/;

function formatDetailValue(key: string, raw: unknown): string {
  if (raw == null) return '—';
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';

  if (typeof raw === 'number') {
    if (!isFinite(raw)) return '—';
    if (PERCENT_KEY_RE.test(key)) return formatPercent(raw, 2);
    if (CURRENCY_KEY_RE.test(key)) return formatCurrency(raw);
    // Plain number — 0 decimals for integers, up to 4 for fractions
    return formatNumber(raw, Number.isInteger(raw) ? 0 : 4);
  }

  if (typeof raw === 'string') {
    if (!raw.trim()) return '—';
    if (DATE_KEY_RE.test(key) || ISO_DATE_RE.test(raw)) {
      const formatted = formatDate(raw);
      if (formatted !== '—') return formatted;
    }
    return raw;
  }

  return String(raw);
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm,
        paddingVertical: spacing.sm,
      }}
    >
      <Typography
        variant="body"
        color={colors.textSecondary}
        style={{ flex: 1 }}
      >
        {label}
      </Typography>
      <Typography
        variant="body"
        weight={highlight ? '700' : '400'}
        align="right"
        style={{ flexShrink: 1, maxWidth: '58%' }}
      >
        {value}
      </Typography>
    </View>
  );
}

function TransactionRow({ tx }: { tx: RawTransaction }) {
  const { colors, spacing, radius } = useTheme();
  const isBuy = ['buy', 'deposit', 'invest'].includes(tx.transaction_type.toLowerCase());

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: isBuy ? colors.gainSoft : colors.lossSoft,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        <Typography variant="caption" color={isBuy ? colors.gain : colors.loss}>
          {isBuy ? '↓' : '↑'}
        </Typography>
      </View>
      <View style={{ flex: 1 }}>
        <Typography variant="callout" weight="600">{tx.transaction_type.toUpperCase()}</Typography>
        <Typography variant="caption" color={colors.textSecondary}>
          {formatDate(tx.transaction_date)}
          {tx.quantity != null ? ` · ${formatNumber(tx.quantity, Number.isInteger(tx.quantity) ? 0 : 4)} units` : ''}
        </Typography>
        {tx.notes ? (
          <Typography variant="caption" color={colors.textTertiary} numberOfLines={2}>
            {tx.notes}
          </Typography>
        ) : null}
      </View>
      <Typography variant="callout" weight="600" align="right" style={{ flexShrink: 0, maxWidth: 110 }}>
        {tx.amount != null ? formatCompact(tx.amount) : tx.price != null ? `@${formatCompact(tx.price)}` : '—'}
      </Typography>
    </View>
  );
}

export default function AssetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const { assets, backup } = usePortfolioStore();

  const asset = useMemo(
    () => assets.find((a) => String(a.id) === id),
    [assets, id],
  );

  const transactions = useMemo(
    () =>
      (backup?.transactions ?? [])
        .filter((t) => String(t.asset_id) === id)
        .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date)),
    [backup, id],
  );

  if (!asset) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <EmptyState title="Asset not found" />
      </SafeAreaView>
    );
  }

  const dotColor = assetTypeColors[asset.assetType] ?? colors.textTertiary;
  const isGain = asset.profitLoss >= 0;

  const extraDetails = Object.entries(asset.details ?? {}).filter(
    ([k]) => !['id', 'user_id', 'asset_id'].includes(k),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      {/* Nav header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          gap: spacing.md,
        }}
      >
        <Pressable
          onPress={router.back}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Typography variant="headline" color={colors.accent}>‹</Typography>
        </Pressable>
        <Typography variant="headline" weight="600" numberOfLines={1} style={{ flex: 1 }}>
          {asset.name}
        </Typography>
        <Badge label={asset.assetTypeDisplayName} variant="neutral" size="sm" />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, gap: spacing.lg, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero value card */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.xl,
            padding: spacing.xl,
            borderWidth: 1,
            borderColor: colors.border,
            borderLeftWidth: 4,
            borderLeftColor: dotColor,
            gap: spacing.md,
          }}
        >
          <View>
            <Typography variant="micro" color={colors.textSecondary} weight="600">CURRENT VALUE</Typography>
            <Typography variant="display" weight="800">
              {formatCompact(asset.currentValue)}
            </Typography>
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <Badge
              label={formatPercent(asset.profitLossPercent, 2)}
              variant={isGain ? 'gain' : 'loss'}
              size="md"
            />
            <Typography variant="body" color={isGain ? colors.gain : colors.loss} weight="600">
              {isGain ? '+' : ''}{formatCompact(asset.profitLoss)}
            </Typography>
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Typography variant="micro" color={colors.textSecondary} weight="600">INVESTED</Typography>
              <Typography variant="callout" weight="600" numberOfLines={1}>{formatCompact(asset.totalInvested)}</Typography>
            </View>
            {asset.xirr != null && (
              <View style={{ flex: 1 }}>
                <Typography variant="micro" color={colors.textSecondary} weight="600">XIRR</Typography>
                <Typography
                  variant="callout"
                  weight="600"
                  numberOfLines={1}
                  color={asset.xirr >= 0 ? colors.gain : colors.loss}
                >
                  {formatPercent(asset.xirr, 2)}
                </Typography>
              </View>
            )}
            {asset.lastPriceUpdate && (
              <View style={{ flex: 1 }}>
                <Typography variant="micro" color={colors.textSecondary} weight="600">UPDATED</Typography>
                <Typography variant="callout" weight="600" numberOfLines={1}>
                  {formatRelativeDate(asset.lastPriceUpdate)}
                </Typography>
              </View>
            )}
          </View>
        </View>

        {/* Core details */}
        <Card style={{ gap: 0 }}>
          {[
            { label: 'Broker / Account', value: asset.brokerName ?? '—' },
            { label: 'Account Holder', value: asset.accountHolderName ?? '—' },
            asset.isin ? { label: 'ISIN', value: asset.isin } : null,
            asset.symbol ? { label: 'Symbol', value: asset.symbol } : null,
            asset.quantity != null
              ? { label: 'Quantity', value: formatNumber(asset.quantity, Number.isInteger(asset.quantity) ? 0 : 4) }
              : null,
            asset.avgBuyPrice != null ? { label: 'Avg Buy Price', value: formatCurrency(asset.avgBuyPrice, asset.currency) } : null,
            asset.currentPrice != null ? { label: 'Current Price', value: formatCurrency(asset.currentPrice, asset.currency) } : null,
          ]
            .filter(Boolean)
            .map((row, i, arr) => (
              <React.Fragment key={row!.label}>
                <DetailRow label={row!.label} value={row!.value} />
                {i < arr.length - 1 && <Divider />}
              </React.Fragment>
            ))}
        </Card>

        {/* Extra details from JSON blob */}
        {extraDetails.length > 0 && (
          <Card style={{ gap: 0 }}>
            <View style={{ paddingBottom: spacing.sm }}>
              <Typography variant="footnote" color={colors.textSecondary} weight="600">DETAILS</Typography>
            </View>
            {extraDetails.map(([key, val], i) => (
              <React.Fragment key={key}>
                {i > 0 && <Divider />}
                <DetailRow
                  label={key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  value={formatDetailValue(key, val)}
                />
              </React.Fragment>
            ))}
          </Card>
        )}

        {/* Transactions */}
        {transactions.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            <Typography variant="headline">Transactions</Typography>
            <Card style={{ gap: 0 }}>
              {transactions.map((tx, i) => (
                <React.Fragment key={tx.id}>
                  {i > 0 && <Divider />}
                  <TransactionRow tx={tx} />
                </React.Fragment>
              ))}
            </Card>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
