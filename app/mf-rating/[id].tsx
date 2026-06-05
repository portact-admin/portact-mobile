import React, { useMemo } from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@hooks/useTheme';
import { usePortfolioStore, lookupMFRating } from '@store/usePortfolioStore';
import { Typography } from '@components/ui/Typography';
import { Card } from '@components/ui/Card';
import { Divider } from '@components/ui/Divider';
import { EmptyState } from '@components/ui/EmptyState';
import { RawMFRating } from '@models/backup';

// ─── helpers ────────────────────────────────────────────────────────────────

function ratingColor(rating: number, gain: string, warning: string, loss: string): string {
  if (rating >= 7.5) return gain;
  if (rating >= 5) return warning;
  return loss;
}

function ratingBg(rating: number, gainSoft: string, warningSoft: string, lossSoft: string): string {
  if (rating >= 7.5) return gainSoft;
  if (rating >= 5) return warningSoft;
  return lossSoft;
}

function ratingLabel(rating: number): string {
  if (rating >= 9) return 'Exceptional';
  if (rating >= 7.5) return 'Strong';
  if (rating >= 6) return 'Good';
  if (rating >= 5) return 'Average';
  if (rating >= 3.5) return 'Below Average';
  return 'Weak';
}

function humaniseKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMetricValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (!isFinite(value)) return '—';
    // Heuristic: values that look like percentages (< 200) show with % suffix;
    // very large values (AUM-like) compact; otherwise plain number.
    if (Math.abs(value) < 200) return `${value.toFixed(2)}%`;
    return value.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }
  if (typeof value === 'string') return value || '—';
  return String(value);
}

// ─── sub-components ─────────────────────────────────────────────────────────

function SectionTitle({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <Typography variant="footnote" color={colors.textSecondary} weight="600">
      {label.toUpperCase()}
    </Typography>
  );
}

function ScoreCircle({ rating }: { rating: number }) {
  const { colors } = useTheme();
  const color = ratingColor(rating, colors.gain, colors.warning, colors.loss);
  const bg = ratingBg(rating, colors.gainSoft, `${colors.warning}22`, colors.lossSoft);
  const size = 110;

  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 4,
          borderColor: color,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant="display" weight="800" color={color} style={{ lineHeight: 40 }}>
          {rating.toFixed(1)}
        </Typography>
        <Typography variant="caption" color={color} weight="600">
          / 10
        </Typography>
      </View>
      <Typography variant="callout" weight="700" color={color}>
        {ratingLabel(rating)}
      </Typography>
    </View>
  );
}

function DimensionBar({ label, value }: { label: string; value: number }) {
  const { colors, radius } = useTheme();
  const color = ratingColor(value, colors.gain, colors.warning, colors.loss);
  const pct = Math.min(Math.max(value / 10, 0), 1);

  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="footnote" color={colors.textSecondary}>
          {label}
        </Typography>
        <Typography variant="footnote" weight="700" color={color}>
          {value.toFixed(1)}
        </Typography>
      </View>
      <View
        style={{
          height: 6,
          borderRadius: radius.full,
          backgroundColor: colors.border,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: '100%',
            width: `${pct * 100}%`,
            backgroundColor: color,
            borderRadius: radius.full,
          }}
        />
      </View>
    </View>
  );
}

function BulletList({ items, color }: { items: string[]; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {items.map((item, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Typography variant="body" color={color} style={{ lineHeight: 22, marginTop: 1 }}>
            •
          </Typography>
          <Typography variant="body" color={colors.textPrimary} style={{ flex: 1, lineHeight: 22 }}>
            {item}
          </Typography>
        </View>
      ))}
    </View>
  );
}

interface PeerEntry {
  fund_name?: string;
  returns_3y?: string;
  composite_rank?: number;
  key_differentiator?: string;
  [key: string]: unknown;
}

function PeerRow({ peer }: { peer: PeerEntry }) {
  const { colors, spacing, radius } = useTheme();
  const rank = peer.composite_rank ?? 0;
  const isTopRank = rank === 1;

  const rankBg  = isTopRank ? `${colors.warning}22` : colors.surfaceSecondary;
  const rankCol = isTopRank ? colors.warning         : colors.textSecondary;

  return (
    <View style={{ paddingVertical: spacing.sm, gap: spacing.xs }}>
      {/* Row 1: rank badge + fund name + 3Y CAGR */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View
          style={{
            backgroundColor: rankBg,
            borderRadius: radius.full,
            paddingHorizontal: 8,
            paddingVertical: 3,
            flexShrink: 0,
          }}
        >
          <Typography variant="micro" weight="800" color={rankCol}>
            #{rank}
          </Typography>
        </View>

        <Typography
          variant="footnote"
          weight={isTopRank ? '700' : '500'}
          color={isTopRank ? colors.warning : colors.textPrimary}
          style={{ flex: 1 }}
          numberOfLines={2}
        >
          {isTopRank ? '🏆 ' : ''}{peer.fund_name ?? '—'}
        </Typography>

        {peer.returns_3y ? (
          <Typography variant="footnote" weight="700" color={colors.gain} style={{ flexShrink: 0 }}>
            {peer.returns_3y}
          </Typography>
        ) : null}
      </View>

      {/* Row 2: differentiator */}
      {peer.key_differentiator ? (
        <Typography
          variant="caption"
          color={colors.textSecondary}
          style={{ lineHeight: 18, paddingLeft: 44 }}
        >
          {peer.key_differentiator}
        </Typography>
      ) : null}
    </View>
  );
}

// ─── main screen ────────────────────────────────────────────────────────────

export default function MFRatingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const { assets, mfRatingsByAssetId } = usePortfolioStore();

  const asset = useMemo(() => assets.find((a) => String(a.id) === id), [assets, id]);
  const rating: RawMFRating | undefined = asset
    ? lookupMFRating(asset.id, asset.name, mfRatingsByAssetId)
    : undefined;

  if (!asset || !rating) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <EmptyState title="Rating not found" subtitle="No AI rating is available for this fund." />
      </SafeAreaView>
    );
  }

  // Parse breakdown dimensions — accept any numeric key/value pair.
  const breakdown = useMemo(() => {
    if (!rating.rating_breakdown || typeof rating.rating_breakdown !== 'object') return [];
    return Object.entries(rating.rating_breakdown as Record<string, unknown>)
      .filter(([, v]) => typeof v === 'number')
      .map(([k, v]) => ({ label: humaniseKey(k), value: v as number }));
  }, [rating.rating_breakdown]);

  // Parse key metrics — skip non-primitive values.
  const metrics = useMemo(() => {
    if (!rating.key_metrics || typeof rating.key_metrics !== 'object') return [];
    return Object.entries(rating.key_metrics as Record<string, unknown>)
      .filter(([, v]) => v != null && typeof v !== 'object')
      .map(([k, v]) => ({ label: humaniseKey(k), value: v }));
  }, [rating.key_metrics]);

  // Parse peer comparison list — sort by composite_rank ascending.
  const peers = useMemo(() => {
    if (!Array.isArray(rating.peer_comparison)) return [];
    return (rating.peer_comparison as PeerEntry[])
      .slice()
      .sort((a, b) => (a.composite_rank ?? 99) - (b.composite_rank ?? 99));
  }, [rating.peer_comparison]);

  const strengths = Array.isArray(rating.strengths) ? rating.strengths as string[] : [];
  const weaknesses = Array.isArray(rating.weaknesses) ? rating.weaknesses as string[] : [];

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
          AI Rating
        </Typography>
        {rating.ai_provider ? (
          <View
            style={{
              backgroundColor: colors.accentSoft,
              borderRadius: radius.full,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <Typography variant="micro" color={colors.accent} weight="600">
              {rating.ai_provider.toUpperCase()}
            </Typography>
          </View>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, gap: spacing.lg, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card — score + fund identity */}
        <Card>
          <View style={{ alignItems: 'center', gap: spacing.md }}>
            {rating.rating != null ? (
              <ScoreCircle rating={rating.rating} />
            ) : (
              <Typography variant="callout" color={colors.textSecondary}>No overall rating available</Typography>
            )}
            <View style={{ alignItems: 'center', gap: 4 }}>
              <Typography variant="headline" weight="700" align="center">
                {rating.fund_name ?? asset.name}
              </Typography>
              {(rating.category || rating.fund_house) ? (
                <Typography variant="footnote" color={colors.textSecondary} align="center">
                  {[rating.category, rating.fund_house].filter(Boolean).join('  ·  ')}
                </Typography>
              ) : null}
            </View>
          </View>
        </Card>

        {/* Rating breakdown */}
        {breakdown.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            <SectionTitle label="Rating Breakdown" />
            <Card style={{ gap: spacing.md }}>
              {breakdown.map((d) => (
                <DimensionBar key={d.label} label={d.label} value={d.value} />
              ))}
            </Card>
          </View>
        )}

        {/* Strengths & Weaknesses */}
        {(strengths.length > 0 || weaknesses.length > 0) && (
          <View style={{ gap: spacing.sm }}>
            <SectionTitle label="Strengths & Weaknesses" />
            <Card style={{ gap: spacing.md }}>
              {strengths.length > 0 && (
                <View style={{ gap: spacing.sm }}>
                  <Typography variant="footnote" color={colors.gain} weight="700">
                    Strengths
                  </Typography>
                  <BulletList items={strengths} color={colors.gain} />
                </View>
              )}
              {strengths.length > 0 && weaknesses.length > 0 && <Divider />}
              {weaknesses.length > 0 && (
                <View style={{ gap: spacing.sm }}>
                  <Typography variant="footnote" color={colors.loss} weight="700">
                    Weaknesses
                  </Typography>
                  <BulletList items={weaknesses} color={colors.loss} />
                </View>
              )}
            </Card>
          </View>
        )}

        {/* Investment recommendation */}
        {rating.investment_recommendation ? (
          <View style={{ gap: spacing.sm }}>
            <SectionTitle label="Recommendation" />
            <Card>
              <Typography variant="body" style={{ lineHeight: 24 }}>
                {rating.investment_recommendation}
              </Typography>
            </Card>
          </View>
        ) : null}

        {/* Suitable for */}
        {rating.suitable_for ? (
          <View style={{ gap: spacing.sm }}>
            <SectionTitle label="Suitable For" />
            <Card>
              <Typography variant="body" style={{ lineHeight: 24 }}>
                {rating.suitable_for}
              </Typography>
            </Card>
          </View>
        ) : null}

        {/* Best in class */}
        {(rating.best_in_class_name || rating.best_in_class_reason) ? (
          <View style={{ gap: spacing.sm }}>
            <SectionTitle label="Best in Class" />
            <Card style={{ gap: spacing.sm }}>
              {rating.best_in_class_name ? (
                <Typography variant="callout" weight="700">
                  {rating.best_in_class_name}
                </Typography>
              ) : null}
              {rating.best_in_class_reason ? (
                <Typography variant="body" color={colors.textSecondary} style={{ lineHeight: 24 }}>
                  {rating.best_in_class_reason}
                </Typography>
              ) : null}
            </Card>
          </View>
        ) : null}

        {/* Key metrics */}
        {metrics.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            <SectionTitle label="Key Metrics" />
            <Card style={{ gap: 0 }}>
              {metrics.map((m, i) => (
                <React.Fragment key={m.label}>
                  {i > 0 && <Divider />}
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: spacing.sm,
                      paddingVertical: spacing.sm,
                    }}
                  >
                    <Typography variant="body" color={colors.textSecondary} style={{ flex: 1 }}>
                      {m.label}
                    </Typography>
                    <Typography variant="body" weight="600" align="right" style={{ flexShrink: 1, maxWidth: '55%' }}>
                      {formatMetricValue(m.value)}
                    </Typography>
                  </View>
                </React.Fragment>
              ))}
            </Card>
          </View>
        )}

        {/* Justification */}
        {rating.justification ? (
          <View style={{ gap: spacing.sm }}>
            <SectionTitle label="Analysis" />
            <Card>
              <Typography variant="body" color={colors.textSecondary} style={{ lineHeight: 24 }}>
                {rating.justification}
              </Typography>
            </Card>
          </View>
        ) : null}

        {/* Peer comparison */}
        {peers.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            <SectionTitle label="Peer Comparison" />
            <Card style={{ gap: 0 }}>
              {/* Column header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.xs }}>
                <View style={{ flex: 1, paddingLeft: 44 }}>
                  <Typography variant="micro" color={colors.textTertiary} weight="600">FUND</Typography>
                </View>
                <Typography variant="micro" color={colors.textTertiary} weight="600" style={{ flexShrink: 0 }}>3Y CAGR</Typography>
              </View>
              <Divider />
              {peers.map((peer, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <Divider />}
                  <PeerRow peer={peer} />
                </React.Fragment>
              ))}
            </Card>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
