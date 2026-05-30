import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Linking, Pressable, ScrollView, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import { LineChart } from 'react-native-gifted-charts';
import { Dimensions } from 'react-native';
import { useTheme } from '@hooks/useTheme';
import { usePortfolioStore } from '@store/usePortfolioStore';
import { Typography } from '@components/ui/Typography';
import { Card } from '@components/ui/Card';
import { Divider } from '@components/ui/Divider';
import { formatCompact } from '@utils/formatters';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  fetchBtcFearGreed, fetchCommodityPrices, fetchFinancialNews,
  fetchMarketIndices, fetchUsFearGreed, fetchUsdInr, fetchIndiaVix,
  type CommodityPrice, type NewsItem, type QuoteData, type SentimentData,
} from '@services/marketService';
import { RawMacroDataPoint } from '@models/backup';

dayjs.extend(relativeTime);

const SCREEN_W = Dimensions.get('window').width;

// ─── Zone definitions (matching PortAct exactly) ──────────────────────────────

interface Zone { min: number; max: number; label: string; color: string }

const MMI_ZONES: Zone[] = [
  { min: 0,  max: 30,  label: 'Extreme Fear', color: '#2e7d32' },
  { min: 30, max: 50,  label: 'Fear',         color: '#e65100' },
  { min: 50, max: 70,  label: 'Greed',        color: '#b71c1c' },
  { min: 70, max: 100, label: 'Extreme Greed',color: '#7b003c' },
];

const FNG_ZONES: Zone[] = [
  { min: 0,  max: 25,  label: 'Extreme Fear', color: '#2e7d32' },
  { min: 25, max: 45,  label: 'Fear',         color: '#e65100' },
  { min: 45, max: 55,  label: 'Neutral',      color: '#f57f17' },
  { min: 55, max: 75,  label: 'Greed',        color: '#b71c1c' },
  { min: 75, max: 100, label: 'Extreme Greed',color: '#7b003c' },
];

function activeZoneFor(v: number, zones: Zone[]): Zone {
  return zones.find((z) => v >= z.min && v <= z.max) ?? zones[zones.length - 1];
}

// Tick label positions matching PortAct's gauge (midpoint of each zone)
const MMI_TICKS  = [
  { v: 15, lbl: 'Ext. Fear',  color: '#2e7d32' },
  { v: 40, lbl: 'Fear',       color: '#e65100' },
  { v: 60, lbl: 'Greed',      color: '#b71c1c' },
  { v: 85, lbl: 'Ext. Greed', color: '#7b003c' },
];
const FNG_TICKS = [
  { v: 12, lbl: 'Ext. Fear',  color: '#2e7d32' },
  { v: 35, lbl: 'Fear',       color: '#e65100' },
  { v: 50, lbl: 'Neutral',    color: '#f57f17' },
  { v: 65, lbl: 'Greed',      color: '#b71c1c' },
  { v: 88, lbl: 'Ext. Greed', color: '#7b003c' },
];

// ─── SVG Semicircle Gauge ─────────────────────────────────────────────────────

interface GaugeProps {
  value: number;
  zones: Zone[];
  ticks: { v: number; lbl: string; color: string }[];
  isDark: boolean;
}

function SemiCircleGauge({ value, zones, ticks, isDark }: GaugeProps) {
  const [W, setW] = useState(SCREEN_W - 64);
  const clamped = Math.max(0, Math.min(100, value));
  const zone = activeZoneFor(clamped, zones);

  // Geometry
  const H  = W * 0.52;
  const cx = W / 2;
  const cy = H - 8;
  const R  = W * 0.36;   // outer radius
  const r  = R * 0.60;   // inner radius (donut width = R - r)

  // Arc path for a zone segment (donut slice)
  function arcPath(vStart: number, vEnd: number): string {
    const a1 = (1 - vStart / 100) * Math.PI;
    const a2 = (1 - vEnd / 100) * Math.PI;
    const lg = vEnd - vStart > 50 ? 1 : 0;
    const x1 = cx + R * Math.cos(a1), y1 = cy - R * Math.sin(a1);
    const x2 = cx + R * Math.cos(a2), y2 = cy - R * Math.sin(a2);
    const xi1 = cx + r * Math.cos(a1), yi1 = cy - r * Math.sin(a1);
    const xi2 = cx + r * Math.cos(a2), yi2 = cy - r * Math.sin(a2);
    return `M ${x1} ${y1} A ${R} ${R} 0 ${lg} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${r} ${r} 0 ${lg} 0 ${xi1} ${yi1} Z`;
  }

  // Needle
  const nA = (1 - clamped / 100) * Math.PI;
  const nR = r - 4;
  const tipX = cx + nR * Math.cos(nA), tipY = cy - nR * Math.sin(nA);
  const perp = nA + Math.PI / 2;
  const bh = 4.5;
  const n1x = cx + bh * Math.cos(perp), n1y = cy - bh * Math.sin(perp);
  const n2x = cx - bh * Math.cos(perp), n2y = cy + bh * Math.sin(perp);

  // Tick label positions (just outside the outer arc)
  const tickItems = ticks.map((t) => {
    const a = (1 - t.v / 100) * Math.PI;
    const lr = R + 11;
    const tx = cx + lr * Math.cos(a);
    const ty = cy - lr * Math.sin(a);
    const anchor: 'start' | 'middle' | 'end' =
      tx < cx - 15 ? 'end' : tx > cx + 15 ? 'start' : 'middle';
    return { ...t, tx, ty: ty + 3, anchor };
  });

  const hubColor = zone.color;
  const bgColor  = isDark ? '#333' : '#e0e0e0';

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ width: '100%' }}>
      <Svg width={W} height={H + 10}>
        {/* Grey background arc (full semicircle) */}
        <Path d={arcPath(0, 100)} fill={bgColor} opacity={0.35} />

        {/* Coloured zone arcs */}
        {zones.map((z) => (
          <Path key={z.label} d={arcPath(z.min, z.max)} fill={z.color} />
        ))}

        {/* Thin separator lines between zones */}
        {zones.slice(0, -1).map((z) => {
          const a = (1 - z.max / 100) * Math.PI;
          return (
            <Path
              key={`sep-${z.max}`}
              d={`M ${cx + r * Math.cos(a)} ${cy - r * Math.sin(a)} L ${cx + R * Math.cos(a)} ${cy - R * Math.sin(a)}`}
              stroke={isDark ? '#111' : '#fff'}
              strokeWidth={1.5}
            />
          );
        })}

        {/* Tick labels */}
        {tickItems.map((t) => (
          <SvgText
            key={t.lbl}
            x={t.tx} y={t.ty}
            fontSize={W * 0.028}
            fill={t.color}
            textAnchor={t.anchor}
            fontWeight="600"
          >
            {t.lbl}
          </SvgText>
        ))}

        {/* Needle triangle */}
        <Path
          d={`M ${tipX} ${tipY} L ${n1x} ${n1y} L ${n2x} ${n2y} Z`}
          fill={hubColor}
        />

        {/* Hub circle */}
        <Circle cx={cx} cy={cy} r={8} fill={hubColor} />
        <Circle cx={cx} cy={cy} r={4} fill={isDark ? '#1a1a1a' : '#fff'} />
      </Svg>

      {/* Value + label — rendered as native text for crisp display */}
      <View style={{ alignItems: 'center', marginTop: -8 }}>
        <Typography variant="title1" weight="800" style={{ color: hubColor, fontSize: 38, lineHeight: 42 }}>
          {clamped.toFixed(1)}
        </Typography>
        <Typography variant="callout" weight="700" style={{ color: hubColor, letterSpacing: 1 }}>
          {zone.label.toUpperCase()}
        </Typography>
      </View>
    </View>
  );
}

// ─── Mini sparkline ────────────────────────────────────────────────────────────

function Sparkline({ points }: { points: RawMacroDataPoint[] }) {
  const { colors } = useTheme();
  if (points.length < 2) return null;

  const vals = points.map((p) => p.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const floor = Math.max(0, minV - (maxV - minV) * 0.1);
  const chartW = SCREEN_W - 64 - 32;

  return (
    <View style={{ marginTop: 12 }}>
      <Typography variant="micro" color={colors.textTertiary} style={{ marginBottom: 4 }}>
        60-day history
      </Typography>
      <LineChart
        data={points.map((p) => ({ value: p.value - floor }))}
        width={chartW}
        height={48}
        maxValue={(maxV - floor) * 1.15}
        color={colors.accent}
        thickness={1.5}
        areaChart
        startFillColor={`${colors.accent}25`}
        endFillColor="transparent"
        curved
        curvature={0.2}
        hideDataPoints
        hideYAxisText
        yAxisColor="transparent"
        xAxisColor="transparent"
        hideRules
        initialSpacing={0}
        endSpacing={0}
        spacing={Math.max(2, Math.floor(chartW / Math.max(points.length - 1, 1)))}
        disableScroll
      />
    </View>
  );
}

// ─── Sentiment Card (gauge + sparkline) ───────────────────────────────────────

function SentimentCard({
  title, value, zones, ticks, history, loading,
}: {
  title: string;
  value: number | null;
  zones: Zone[];
  ticks: { v: number; lbl: string; color: string }[];
  history: RawMacroDataPoint[];
  loading: boolean;
}) {
  const { colors, spacing, isDark } = useTheme();
  const displayValue = value ?? (history.length > 0 ? history[history.length - 1].value : null);

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="headline">{title}</Typography>
        {loading && <ActivityIndicator size="small" color={colors.accent} />}
      </View>

      {displayValue != null ? (
        <SemiCircleGauge value={displayValue} zones={zones} ticks={ticks} isDark={isDark} />
      ) : (
        <View style={{ height: 120, alignItems: 'center', justifyContent: 'center' }}>
          {loading
            ? <ActivityIndicator color={colors.accent} />
            : <Typography variant="footnote" color={colors.textSecondary}>No data available</Typography>
          }
        </View>
      )}

    </Card>
  );
}

// ─── Index / Commodity grid tile ──────────────────────────────────────────────

interface TileData {
  label: string;
  sub?: string;
  primary: string;
  secondary?: string;
  changePct: number;
  bgColor: string;
}

function MarketTile({ item }: { item: TileData }) {
  const { colors, spacing, radius } = useTheme();
  const pos = item.changePct >= 0;
  const changeColor = item.changePct === 0 ? colors.textTertiary : pos ? colors.gain : colors.loss;

  return (
    <View style={{
      flex: 1,
      backgroundColor: item.bgColor,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: 4,
    }}>
      <Typography variant="micro" color={colors.textSecondary} weight="600">
        {item.label.toUpperCase()}
      </Typography>
      {item.sub && (
        <Typography variant="micro" color={colors.textTertiary}>{item.sub}</Typography>
      )}
      <Typography variant="callout" weight="800" numberOfLines={1}>{item.primary}</Typography>
      {item.secondary && (
        <Typography variant="micro" color={colors.textSecondary}>{item.secondary}</Typography>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 }}>
        <Ionicons name={pos ? 'arrow-up' : 'arrow-down'} size={10} color={changeColor} />
        <Typography variant="micro" weight="700" color={changeColor}>
          {Math.abs(item.changePct).toFixed(2)}%
        </Typography>
      </View>
    </View>
  );
}

function TileGrid({ tiles }: { tiles: TileData[] }) {
  const { spacing } = useTheme();
  const rows: TileData[][] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));
  return (
    <View style={{ gap: spacing.sm }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: spacing.sm }}>
          {row.map((tile) => <MarketTile key={tile.label} item={tile} />)}
          {row.length === 1 && <View style={{ flex: 1 }} />}
        </View>
      ))}
    </View>
  );
}

// ─── News card ────────────────────────────────────────────────────────────────

function NewsCard({ item, isLast }: { item: NewsItem; isLast: boolean }) {
  const { colors, spacing } = useTheme();
  const timeAgo = useMemo(() => {
    try { return dayjs(new Date(item.pubDate)).fromNow(); } catch { return ''; }
  }, [item.pubDate]);

  return (
    <>
      <Pressable
        onPress={() => Linking.openURL(item.link)}
        style={({ pressed }) => ({ paddingVertical: spacing.md, opacity: pressed ? 0.7 : 1 })}
      >
        <Typography variant="footnote" weight="600" numberOfLines={2} style={{ marginBottom: 4 }}>
          {item.title}
        </Typography>
        {item.description.length > 0 && (
          <Typography variant="micro" color={colors.textSecondary} numberOfLines={2} style={{ marginBottom: 4 }}>
            {item.description}
          </Typography>
        )}
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          <Typography variant="micro" color={colors.textTertiary}>{item.source}</Typography>
          {timeAgo && <Typography variant="micro" color={colors.textTertiary}>· {timeAgo}</Typography>}
        </View>
      </Pressable>
      {!isLast && <Divider />}
    </>
  );
}

// ─── Macro tile ───────────────────────────────────────────────────────────────

function MacroTile({ label, value, unit, subLabel, bgColor }: {
  label: string; value: string | null; unit?: string; subLabel?: string; bgColor?: string;
}) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{
      flex: 1,
      backgroundColor: bgColor ?? colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
    }}>
      <Typography variant="micro" color={colors.textSecondary} weight="600">{label.toUpperCase()}</Typography>
      {value != null ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
          <Typography variant="title3" weight="800">{value}</Typography>
          {unit && <Typography variant="caption" color={colors.textSecondary}>{unit}</Typography>}
        </View>
      ) : (
        <Typography variant="callout" color={colors.textTertiary}>—</Typography>
      )}
      {subLabel && <Typography variant="micro" color={colors.textTertiary}>{subLabel}</Typography>}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MarketScreen() {
  const { colors, spacing } = useTheme();
  const backup = usePortfolioStore((s) => s.backup);

  const [btcFng, setBtcFng]           = useState<SentimentData | null>(null);
  const [usFng, setUsFng]             = useState<SentimentData | null>(null);
  const [indices, setIndices]         = useState<QuoteData[]>([]);
  const [commodities, setCommodities] = useState<CommodityPrice[]>([]);
  const [usdInr, setUsdInr]           = useState<{ rate: number; changePct: number } | null>(null);
  const [liveVix, setLiveVix]         = useState<number | null>(null);
  const [news, setNews]               = useState<NewsItem[]>([]);
  const [loading, setLoading]         = useState(true);

  // ── Macro data from backup ──
  const macro = useMemo(() => {
    const pts = backup?.macro_data_points ?? [];
    const latest = (s: string) => {
      const arr = pts.filter((p) => p.series === s).sort((a, b) => b.period.localeCompare(a.period));
      return arr[0]?.value ?? null;
    };
    const history = (s: string, n = 60) =>
      pts.filter((p) => p.series === s).sort((a, b) => a.period.localeCompare(b.period)).slice(-n);
    return {
      mmiHistory:    history('india_mmi', 60),
      btcFngHistory: history('btc_fng_cmc', 60),
      usFngHistory:  history('us_fng', 60),
      indiaCpi:      latest('india_cpi'),
      niftyPe:       latest('nifty_pe'),
      indiaVix:      latest('india_vix'),
      rbiRate:       latest('rbi_repo_rate'),
    };
  }, [backup]);

  // ── Live fetch on mount ──
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.allSettled([
      fetchBtcFearGreed().then((v) => { if (alive && v) setBtcFng(v); }),
      fetchUsFearGreed().then((v)  => { if (alive && v) setUsFng(v); }),
      fetchMarketIndices().then((v) => { if (alive) setIndices(v); }),
      fetchCommodityPrices().then((v) => { if (alive) setCommodities(v); }),
      fetchUsdInr().then((v) => { if (alive && v) setUsdInr(v); }),
      fetchIndiaVix().then((v) => { if (alive && v != null) setLiveVix(v); }),
      fetchFinancialNews().then((v) => { if (alive) setNews(v); }),
    ]).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // ── Computed India MMI (PortAct fallback: VIX 60% + Nifty PE 40%) ──
  const computedMmi = useMemo(() => {
    const vix = liveVix ?? macro.indiaVix;
    const pe  = macro.niftyPe;
    if (!vix || !pe) return null;
    const vixScore = Math.max(0, Math.min(100, 100 - (vix / 30) * 100)) * 0.6;
    const peScore  = Math.min(100, Math.max(0, (pe - 10) / 20 * 100)) * 0.4;
    return Math.round(vixScore + peScore);
  }, [liveVix, macro.indiaVix, macro.niftyPe]);

  const mmiValue = computedMmi ??
    (macro.mmiHistory.length > 0 ? macro.mmiHistory[macro.mmiHistory.length - 1].value : null);

  // ── Index tiles ──
  const INDEX_COLORS = [
    { label: 'NIFTY 50',  bg: '#1565C018' },
    { label: 'SENSEX',    bg: '#4527A018' },
    { label: 'S&P 500',   bg: '#1B5E2018' },
    { label: 'NASDAQ',    bg: '#00695C18' },
  ];
  const indexTiles: TileData[] = indices.map((q) => {
    const cfg = INDEX_COLORS.find((c) => c.label === q.label) ?? { bg: colors.surface };
    return {
      label: q.label,
      primary: q.currency === 'INR'
        ? formatCompact(q.price)
        : q.price.toLocaleString('en-US', { maximumFractionDigits: 0 }),
      secondary: q.currency === 'USD' ? `$${q.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : undefined,
      changePct: q.changePct,
      bgColor: cfg.bg,
    };
  });

  // ── Commodity tiles ──
  const COMMODITY_COLORS: Record<string, string> = {
    'Bitcoin':     '#E6510018',
    'Brent Crude': '#37474F18',
    'Gold':        '#F57F1718',
    'Silver':      '#78909C18',
  };
  const commodityTiles: TileData[] = commodities.map((c) => ({
    label: c.label,
    sub: c.unit,
    primary: formatCompact(c.priceInr),
    secondary: c.priceUsd != null ? `$${c.priceUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : undefined,
    changePct: c.changePct,
    bgColor: COMMODITY_COLORS[c.label] ?? colors.surface,
  }));

  const vixDisplay = liveVix ?? macro.indiaVix;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, gap: spacing.lg, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="title2" weight="700">Market Insights</Typography>
          {loading && <ActivityIndicator size="small" color={colors.accent} />}
        </View>

        {/* ── Sentiment Gauges ── */}
        <SentimentCard
          title="India Market Mood"
          value={mmiValue}
          zones={MMI_ZONES}
          ticks={MMI_TICKS}
          history={macro.mmiHistory}
          loading={loading}
        />
        <SentimentCard
          title="Bitcoin Fear & Greed"
          value={btcFng?.value ?? null}
          zones={FNG_ZONES}
          ticks={FNG_TICKS}
          history={macro.btcFngHistory}
          loading={loading}
        />
        <SentimentCard
          title="US Fear & Greed"
          value={usFng?.value ?? null}
          zones={FNG_ZONES}
          ticks={FNG_TICKS}
          history={macro.usFngHistory}
          loading={loading}
        />

        {/* ── Market Indices ── */}
        <Card style={{ gap: spacing.md }}>
          <Typography variant="headline">Market Indices</Typography>
          {indexTiles.length > 0
            ? <TileGrid tiles={indexTiles} />
            : loading
            ? <ActivityIndicator color={colors.accent} style={{ alignSelf: 'center' }} />
            : <Typography variant="footnote" color={colors.textSecondary}>Failed to load</Typography>}
        </Card>

        {/* ── Commodity Prices ── */}
        <Card style={{ gap: spacing.md }}>
          <Typography variant="headline">Commodity Prices</Typography>
          {commodityTiles.length > 0
            ? <TileGrid tiles={commodityTiles} />
            : loading
            ? <ActivityIndicator color={colors.accent} style={{ alignSelf: 'center' }} />
            : <Typography variant="footnote" color={colors.textSecondary}>Failed to load</Typography>}
        </Card>

        {/* ── USD / INR ── */}
        <Card style={{ gap: spacing.sm }}>
          <Typography variant="headline">USD / INR</Typography>
          {usdInr ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
                <Typography variant="title1" weight="800">₹{usdInr.rate.toFixed(2)}</Typography>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingBottom: 5 }}>
                  <Ionicons
                    name={usdInr.changePct >= 0 ? 'arrow-up' : 'arrow-down'}
                    size={12}
                    color={usdInr.changePct >= 0 ? colors.loss : colors.gain}
                  />
                  <Typography variant="footnote" weight="600"
                    color={usdInr.changePct >= 0 ? colors.loss : colors.gain}>
                    {Math.abs(usdInr.changePct).toFixed(2)}%
                  </Typography>
                </View>
              </View>
              <Typography variant="micro" color={colors.textTertiary}>
                1 USD = ₹{usdInr.rate.toFixed(4)}
              </Typography>
            </>
          ) : loading
            ? <ActivityIndicator color={colors.accent} style={{ alignSelf: 'center' }} />
            : <Typography variant="footnote" color={colors.textSecondary}>—</Typography>}
        </Card>

        {/* ── India Macro ── */}
        <Card style={{ gap: spacing.md }}>
          <Typography variant="headline">India Macro</Typography>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <MacroTile
              label="CPI Inflation"
              value={macro.indiaCpi != null ? macro.indiaCpi.toFixed(2) : null}
              unit="%" subLabel="YoY"
              bgColor="#FF6B3515"
            />
            <MacroTile
              label="Nifty 50 P/E"
              value={macro.niftyPe != null ? macro.niftyPe.toFixed(2) : null}
              unit="x"
              bgColor="#1565C015"
            />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <MacroTile
              label="India VIX"
              value={vixDisplay != null ? vixDisplay.toFixed(2) : null}
              subLabel="Fear index"
              bgColor="#9C27B015"
            />
            <MacroTile
              label="RBI Repo Rate"
              value={macro.rbiRate != null ? macro.rbiRate.toFixed(2) : null}
              unit="%" subLabel="Current"
              bgColor="#00695C15"
            />
          </View>
        </Card>

        {/* ── Financial News ── */}
        <Card style={{ gap: 0 }}>
          <Typography variant="headline" style={{ marginBottom: spacing.sm }}>Financial News</Typography>
          {news.length === 0 && loading
            ? <ActivityIndicator color={colors.accent} style={{ alignSelf: 'center', marginVertical: spacing.lg }} />
            : news.length === 0
            ? <Typography variant="footnote" color={colors.textSecondary}>No news available</Typography>
            : news.map((item, i) => (
                <NewsCard key={item.link + i} item={item} isLast={i === news.length - 1} />
              ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
