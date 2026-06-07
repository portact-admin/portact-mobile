import React, { useMemo } from 'react';
import { ScrollView, View, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@hooks/useTheme';
import { usePortfolioStore, lookupStockRating } from '@store/usePortfolioStore';
import { Typography } from '@components/ui/Typography';
import { Card } from '@components/ui/Card';
import { Divider } from '@components/ui/Divider';
import { EmptyState } from '@components/ui/EmptyState';
import { RawStockRating, RawStockPeer } from '@models/backup';

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

function recColor(rec: string | null | undefined, gain: string, warn: string, loss: string): string {
  if (!rec) return warn;
  const r = rec.toLowerCase();
  if (r.includes('buy') || r.includes('accumulate')) return gain;
  if (r.includes('sell') || r.includes('avoid')) return loss;
  return warn;
}

function recBg(rec: string | null | undefined, gainSoft: string, warnSoft: string, lossSoft: string): string {
  if (!rec) return warnSoft;
  const r = rec.toLowerCase();
  if (r.includes('buy') || r.includes('accumulate')) return gainSoft;
  if (r.includes('sell') || r.includes('avoid')) return lossSoft;
  return warnSoft;
}

function humaniseKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const BREAKDOWN_ORDER = [
  'business_quality',
  'financial_health',
  'valuation',
  'growth',
  'management',
] as const;

const BREAKDOWN_LABELS: Record<string, string> = {
  business_quality: 'Business Quality & Moat',
  financial_health: 'Financial Health',
  valuation: 'Valuation',
  growth: 'Growth Prospects',
  management: 'Management Quality',
};

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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {/* flex: 1 ensures long labels never push the score value off-screen */}
        <Typography variant="footnote" color={colors.textSecondary} style={{ flex: 1 }} numberOfLines={1}>
          {label}
        </Typography>
        <Typography variant="footnote" weight="700" color={color} style={{ flexShrink: 0 }}>
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

function HorizonRow({ label, rec }: { label: string; rec: string | null | undefined }) {
  const { colors, spacing, radius } = useTheme();
  if (!rec) return null;
  const color = recColor(rec, colors.gain, colors.warning, colors.loss);
  const bg = recBg(rec, colors.gainSoft, `${colors.warning}22`, colors.lossSoft);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
      {/* Fixed-width label so all three horizon rows align */}
      <Typography variant="footnote" color={colors.textSecondary} style={{ width: 72, flexShrink: 0 }}>
        {label}
      </Typography>
      {/* Pill shrinks rather than overflowing when recommendation text is long */}
      <View
        style={{
          backgroundColor: bg,
          borderRadius: radius.full,
          paddingHorizontal: 10,
          paddingVertical: 3,
          flexShrink: 1,
        }}
      >
        <Typography variant="footnote" weight="700" color={color}>
          {rec}
        </Typography>
      </View>
    </View>
  );
}

// Inline metric chip: "Label  value" — keeps label and value together to avoid
// them splitting awkwardly when the row wraps.
function MetricChip({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <Text style={{ fontSize: 11, color: colors.textSecondary }}>
      {label + ' '}
      <Text style={{ fontWeight: '600', color: colors.textPrimary }}>{value}</Text>
    </Text>
  );
}

function PeerRow({ peer, isUS, bestInClass }: { peer: RawStockPeer; isUS: boolean; bestInClass?: string | null }) {
  const { colors, spacing, radius } = useTheme();
  const rank = peer.composite_rank ?? 0;
  const isTopRank = rank === 1;
  const isBest = peer.company_name === bestInClass;

  const rankBg = isTopRank ? `${colors.warning}22` : colors.surfaceSecondary;
  const rankCol = isTopRank ? colors.warning : colors.textSecondary;

  const marginValue = isUS ? peer.fcf_margin : peer.ebitda_margin;
  const marginLabel = isUS ? 'FCF' : 'EBITDA';
  const returnValue = isUS ? peer.roic : peer.roe;
  const returnLabel = isUS ? 'ROIC' : 'ROE';

  const hasMetrics = peer.revenue_growth_3y || marginValue || returnValue || peer.pe_ratio;

  return (
    <View style={{ paddingVertical: spacing.sm, gap: 6 }}>
      {/* Row 1: rank badge + company name */}
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

        {/* flex:1 prevents long names from pushing anything off screen */}
        <Typography
          variant="footnote"
          weight={isBest ? '700' : '500'}
          color={isBest ? colors.warning : colors.textPrimary}
          style={{ flex: 1 }}
          numberOfLines={2}
        >
          {isBest ? '🏆 ' : ''}{peer.company_name}
        </Typography>
      </View>

      {/* Row 2: key metrics — wrap so they never overflow horizontally */}
      {hasMetrics ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingLeft: 40 }}>
          {peer.revenue_growth_3y ? (
            <MetricChip label="Rev 3Y:" value={peer.revenue_growth_3y} colors={colors} />
          ) : null}
          {marginValue ? (
            <MetricChip label={`${marginLabel}:`} value={marginValue} colors={colors} />
          ) : null}
          {returnValue ? (
            <MetricChip label={`${returnLabel}:`} value={returnValue} colors={colors} />
          ) : null}
          {peer.pe_ratio ? (
            <MetricChip label="P/E:" value={peer.pe_ratio} colors={colors} />
          ) : null}
        </View>
      ) : null}

      {/* Row 3: differentiator */}
      {peer.key_differentiator ? (
        <Typography
          variant="caption"
          color={colors.textSecondary}
          style={{ lineHeight: 18, paddingLeft: 40 }}
        >
          {peer.key_differentiator}
        </Typography>
      ) : null}
    </View>
  );
}

// ─── main screen ────────────────────────────────────────────────────────────

export default function StockRatingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const { assets, stockRatingsByAssetId } = usePortfolioStore();

  const asset = useMemo(() => assets.find((a) => String(a.id) === id), [assets, id]);
  const rating: RawStockRating | undefined = asset
    ? lookupStockRating(asset.id, asset.symbol, stockRatingsByAssetId)
    : undefined;

  if (!asset || !rating) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <EmptyState title="Rating not found" subtitle="No AI rating is available for this stock." />
      </SafeAreaView>
    );
  }

  const isUS = rating.exchange === 'NYSE' || rating.exchange === 'NASDAQ';

  const breakdown = useMemo(() => {
    if (!rating.rating_breakdown) return [];
    const rb = rating.rating_breakdown as Record<string, number>;
    return BREAKDOWN_ORDER
      .filter((k) => typeof rb[k] === 'number')
      .map((k) => ({ key: k, label: BREAKDOWN_LABELS[k] ?? humaniseKey(k), value: rb[k] }));
  }, [rating.rating_breakdown]);

  const metrics = useMemo(() => {
    if (!rating.key_metrics) return [];
    return Object.entries(rating.key_metrics)
      .filter(([, v]) => v != null && String(v).trim() !== '')
      .map(([k, v]) => ({ label: humaniseKey(k), value: String(v) }));
  }, [rating.key_metrics]);

  const peers = useMemo(() => {
    if (!Array.isArray(rating.peer_comparison)) return [];
    return (rating.peer_comparison as RawStockPeer[])
      .slice()
      .sort((a, b) => (a.composite_rank ?? 99) - (b.composite_rank ?? 99));
  }, [rating.peer_comparison]);

  const strengths = Array.isArray(rating.strengths) ? rating.strengths as string[] : [];
  const weaknesses = Array.isArray(rating.weaknesses) ? rating.weaknesses as string[] : [];
  const hasHorizons = rating.recommendation_3y || rating.recommendation_5y || rating.recommendation_10y;

  const chips = [
    rating.ticker,
    rating.exchange,
    rating.sector,
    rating.market_cap_category,
  ].filter(Boolean) as string[];

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
        {/* Hero card — score + stock identity */}
        <Card>
          <View style={{ alignItems: 'center', gap: spacing.md }}>
            <ScoreCircle rating={rating.rating} />

            <View style={{ alignItems: 'center', gap: 6, width: '100%' }}>
              <Typography variant="headline" weight="700" align="center" numberOfLines={2}>
                {rating.company_name}
              </Typography>

              {/* Info chips — wrap naturally, no overflow */}
              {chips.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
                  {chips.map((chip, i) => (
                    <View
                      key={i}
                      style={{
                        backgroundColor: colors.surfaceSecondary,
                        borderRadius: radius.full,
                        paddingHorizontal: 10,
                        paddingVertical: 3,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <Typography variant="micro" weight="600" color={colors.textSecondary} numberOfLines={1}>
                        {chip}
                      </Typography>
                    </View>
                  ))}
                </View>
              )}

              {/* Primary recommendation pill */}
              {rating.investment_recommendation ? (
                <View
                  style={{
                    backgroundColor: recBg(
                      rating.investment_recommendation,
                      colors.gainSoft,
                      `${colors.warning}22`,
                      colors.lossSoft,
                    ),
                    borderRadius: radius.full,
                    paddingHorizontal: 14,
                    paddingVertical: 5,
                    maxWidth: '90%',
                  }}
                >
                  <Typography
                    variant="footnote"
                    weight="700"
                    align="center"
                    color={recColor(rating.investment_recommendation, colors.gain, colors.warning, colors.loss)}
                    numberOfLines={2}
                  >
                    {rating.investment_recommendation}
                  </Typography>
                </View>
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
                <DimensionBar key={d.key} label={d.label} value={d.value} />
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

        {/* Investment horizon recommendations */}
        {hasHorizons && (
          <View style={{ gap: spacing.sm }}>
            <SectionTitle label="Investment Horizons" />
            <Card style={{ gap: spacing.md }}>
              <HorizonRow label="3-Year" rec={rating.recommendation_3y} />
              <HorizonRow label="5-Year" rec={rating.recommendation_5y} />
              <HorizonRow label="10-Year" rec={rating.recommendation_10y} />
            </Card>
          </View>
        )}

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
                      {m.value}
                    </Typography>
                  </View>
                </React.Fragment>
              ))}
            </Card>
          </View>
        )}

        {/* Analyst justification */}
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
                <Typography variant="callout" weight="700" numberOfLines={2}>
                  🏆 {rating.best_in_class_name}
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

        {/* Peer comparison */}
        {peers.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            <SectionTitle label="Peer Comparison" />
            <Card style={{ gap: 0 }}>
              {peers.map((peer, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <Divider />}
                  <PeerRow peer={peer} isUS={isUS} bestInClass={rating.best_in_class_name} />
                </React.Fragment>
              ))}
            </Card>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
