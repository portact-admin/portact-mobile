import React, { useMemo, useState } from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@hooks/useTheme';
import { usePortfolioStore } from '@store/usePortfolioStore';
import { RawFPPlan, RawFPActionItem } from '@models/backup';
import { Typography } from '@components/ui/Typography';
import { Card } from '@components/ui/Card';
import { EmptyState } from '@components/ui/EmptyState';
import { Button } from '@components/ui/Button';
import { formatCompact, formatDate } from '@utils/formatters';
import { palette } from '@theme/colors';
import { useRouter } from 'expo-router';

// ── helpers ──────────────────────────────────────────────────────────────────

interface HealthZone { min: number; max: number; label: string; color: string }

const HEALTH_ZONES: HealthZone[] = [
  { min: 0,  max: 55,  label: 'Grade D', color: palette.red500 },
  { min: 55, max: 70,  label: 'Grade C', color: palette.amber500 },
  { min: 70, max: 85,  label: 'Grade B', color: palette.blue500 },
  { min: 85, max: 100, label: 'Grade A', color: palette.green500 },
];

const HEALTH_TICKS = [
  { v: 27.5, lbl: 'D', color: palette.red500 },
  { v: 62.5, lbl: 'C', color: palette.amber500 },
  { v: 77.5, lbl: 'B', color: palette.blue500 },
  { v: 92.5, lbl: 'A', color: palette.green500 },
];

function scoreGrade(score: number): { grade: string; color: string } {
  const z = HEALTH_ZONES.find((hz) => score >= hz.min && score <= hz.max) ?? HEALTH_ZONES[HEALTH_ZONES.length - 1];
  return { grade: z.label.replace('Grade ', ''), color: z.color };
}

const ACTION_CATEGORIES: Record<string, { label: string; color: string; icon: string }> = {
  INVEST:          { label: 'Invest',          color: palette.blue500,   icon: '📈' },
  REDUCE_EXPENSE:  { label: 'Reduce Expense',  color: palette.red400,    icon: '✂️' },
  INSURANCE:       { label: 'Insurance',       color: palette.purple500, icon: '🛡️' },
  TAX:             { label: 'Tax',             color: palette.green500,  icon: '🧾' },
  REBALANCE:       { label: 'Rebalance',       color: palette.amber500,  icon: '⚖️' },
  EMERGENCY_FUND:  { label: 'Emergency Fund',  color: '#00B4D8',         icon: '🏦' },
  GOAL:            { label: 'Goal',            color: palette.purple400, icon: '🎯' },
};

const GOAL_STATUS_COLORS: Record<string, string> = {
  ON_TRACK:  palette.green500,
  AT_RISK:   palette.amber500,
  OFF_TRACK: palette.red500,
  ACHIEVED:  palette.purple500,
};

// ── sub-components ────────────────────────────────────────────────────────────

function HealthGauge({ score }: { score: number }) {
  const { isDark } = useTheme();
  const [W, setW] = useState(300);
  const clamped = Math.max(0, Math.min(100, score));
  const zone = HEALTH_ZONES.find((z) => clamped >= z.min && clamped <= z.max) ?? HEALTH_ZONES[HEALTH_ZONES.length - 1];

  const H  = W * 0.52;
  const cx = W / 2;
  const cy = H - 8;
  const R  = W * 0.36;
  const r  = R * 0.60;

  function segPath(vStart: number, vEnd: number): string {
    const a1 = (1 - vStart / 100) * Math.PI;
    const a2 = (1 - vEnd   / 100) * Math.PI;
    const lg = 0; // semicircle segments never exceed 180°
    const x1 = cx + R * Math.cos(a1), y1 = cy - R * Math.sin(a1);
    const x2 = cx + R * Math.cos(a2), y2 = cy - R * Math.sin(a2);
    const xi1 = cx + r * Math.cos(a1), yi1 = cy - r * Math.sin(a1);
    const xi2 = cx + r * Math.cos(a2), yi2 = cy - r * Math.sin(a2);
    return `M ${x1} ${y1} A ${R} ${R} 0 ${lg} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${r} ${r} 0 ${lg} 0 ${xi1} ${yi1} Z`;
  }

  const nA   = (1 - clamped / 100) * Math.PI;
  const nR   = r - 4;
  const tipX = cx + nR * Math.cos(nA), tipY = cy - nR * Math.sin(nA);
  const perp = nA + Math.PI / 2;
  const bh   = 4.5;
  const n1x  = cx + bh * Math.cos(perp), n1y = cy - bh * Math.sin(perp);
  const n2x  = cx - bh * Math.cos(perp), n2y = cy + bh * Math.sin(perp);

  const tickItems = HEALTH_TICKS.map((t) => {
    const a = (1 - t.v / 100) * Math.PI;
    const lr = R + 11;
    const tx = cx + lr * Math.cos(a);
    const ty = cy - lr * Math.sin(a);
    const anchor: 'start' | 'middle' | 'end' = tx < cx - 15 ? 'end' : tx > cx + 15 ? 'start' : 'middle';
    return { ...t, tx, ty: ty + 3, anchor };
  });

  const hubColor = zone.color;
  const bgColor  = isDark ? '#333' : '#e0e0e0';

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ width: '100%' }}>
      <Svg width={W} height={H + 10}>
        <Path d={segPath(0, 100)} fill={bgColor} opacity={0.35} />
        {HEALTH_ZONES.map((z) => (
          <Path key={z.label} d={segPath(z.min, z.max)} fill={z.color} />
        ))}
        {HEALTH_ZONES.slice(0, -1).map((z) => {
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
        {tickItems.map((t) => (
          <SvgText key={t.lbl} x={t.tx} y={t.ty} fontSize={W * 0.035} fill={t.color} textAnchor={t.anchor} fontWeight="700">
            {t.lbl}
          </SvgText>
        ))}
        <Path d={`M ${tipX} ${tipY} L ${n1x} ${n1y} L ${n2x} ${n2y} Z`} fill={hubColor} />
        <Circle cx={cx} cy={cy} r={8} fill={hubColor} />
        <Circle cx={cx} cy={cy} r={4} fill={isDark ? '#1a1a1a' : '#fff'} />
      </Svg>
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

interface SectionHeaderProps {
  title: string;
}
function SectionHeader({ title }: SectionHeaderProps) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
      <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: colors.accent }} />
      <Typography variant="headline" weight="700">{title}</Typography>
    </View>
  );
}

interface ChipProps {
  label: string;
  color: string;
}
function Chip({ label, color }: ChipProps) {
  const { radius, spacing } = useTheme();
  return (
    <View style={{
      backgroundColor: `${color}22`,
      borderRadius: radius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    }}>
      <Typography variant="micro" color={color} weight="700">{label}</Typography>
    </View>
  );
}

interface ProgressBarProps {
  progress: number; // 0-1
  color: string;
}
function ProgressBar({ progress, color }: ProgressBarProps) {
  const { colors, radius } = useTheme();
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <View style={{ height: 6, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${clamped * 100}%`, backgroundColor: color, borderRadius: radius.full }} />
    </View>
  );
}

function GoalCard({ goal }: { goal: Record<string, unknown> }) {
  const { colors, spacing, radius } = useTheme();
  const name = ((goal.goal_name as string | undefined) ?? (goal.name as string | undefined)) ?? 'Goal';
  const goalType = (goal.goal_type as string | null) ?? null;
  const status = (goal.status as string | null) ?? null;
  const targetAmount = (goal.target_amount as number) ?? 0;
  const currentSavings = (goal.current_savings as number) ?? 0;
  const targetDate = (goal.target_date as string | null) ?? null;
  const monthlyRequired =
    ((goal.monthly_sip_required as number | null | undefined) ??
     (goal.monthly_required as number | null | undefined)) ?? null;

  const progress = targetAmount > 0 ? currentSavings / targetAmount : 0;
  const statusColor = status ? (GOAL_STATUS_COLORS[status] ?? colors.textSecondary) : colors.textSecondary;

  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Typography variant="callout" weight="700">{name}</Typography>
          {goalType && (
            <Typography variant="caption" color={colors.textSecondary}>
              {goalType.replace(/_/g, ' ')}
            </Typography>
          )}
        </View>
        {status && <Chip label={status.replace(/_/g, ' ')} color={statusColor} />}
      </View>

      <ProgressBar progress={progress} color={statusColor} />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View>
          <Typography variant="micro" color={colors.textSecondary} weight="600">SAVED</Typography>
          <Typography variant="footnote" weight="700">{formatCompact(currentSavings)}</Typography>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Typography variant="micro" color={colors.textSecondary} weight="600">TARGET</Typography>
          <Typography variant="footnote" weight="700">{formatCompact(targetAmount)}</Typography>
        </View>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xs }}>
        {targetDate && (
          <View>
            <Typography variant="micro" color={colors.textSecondary} weight="600">TARGET DATE</Typography>
            <Typography variant="caption" weight="600">{formatDate(targetDate, 'MMM YYYY')}</Typography>
          </View>
        )}
        {monthlyRequired != null && (
          <View style={{ alignItems: 'flex-end' }}>
            <Typography variant="micro" color={colors.textSecondary} weight="600">MONTHLY NEEDED</Typography>
            <Typography variant="caption" color={colors.accent} weight="700">{formatCompact(monthlyRequired)}/mo</Typography>
          </View>
        )}
      </View>
    </Card>
  );
}

interface RebalancingStep {
  step: number;
  action: string;
  instrument: string;
  amount_inr?: number;
  mode?: string;
  asset_class?: string;
  rationale?: string;
}

function stepColor(action: string, gain: string, warning: string, accent: string): string {
  if (action === 'sell') return '#EF4444';
  if (action === 'buy' || action === 'sip') return gain;
  return accent;
}

function ExecutionSteps({ steps }: { steps: RebalancingStep[] }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
      <Typography variant="micro" color={colors.textSecondary} weight="700">EXECUTION STEPS</Typography>
      {steps.map((s, i) => {
        const sc = stepColor(s.action, colors.gain, colors.warning, colors.accent);
        return (
          <View
            key={i}
            style={{
              backgroundColor: `${sc}0D`,
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: `${sc}30`,
              padding: spacing.xs,
              gap: 2,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
              <View style={{ backgroundColor: `${sc}22`, borderRadius: radius.xs, paddingHorizontal: 5, paddingVertical: 2 }}>
                <Typography variant="micro" color={sc} weight="800">
                  {s.step}. {s.action.toUpperCase()}
                </Typography>
              </View>
              {s.asset_class && (
                <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.xs, paddingHorizontal: 5, paddingVertical: 2 }}>
                  <Typography variant="micro" color={colors.textSecondary} weight="600">{s.asset_class}</Typography>
                </View>
              )}
            </View>
            <Typography variant="caption" weight="600">{s.instrument}</Typography>
            {(s.amount_inr != null || s.mode) && (
              <Typography variant="micro" color={colors.textSecondary}>
                {s.amount_inr != null ? formatCompact(s.amount_inr) : ''}
                {s.amount_inr != null && s.mode ? ' · ' : ''}
                {s.mode ?? ''}
              </Typography>
            )}
            {s.rationale ? (
              <Typography variant="micro" color={colors.textSecondary} style={{ lineHeight: 16 }}>
                {s.rationale}
              </Typography>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function ActionItemCard({ item, rebalancingSteps }: { item: RawFPActionItem; rebalancingSteps?: RebalancingStep[] }) {
  const { colors, spacing, radius } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const meta = ACTION_CATEGORIES[item.category] ?? { label: item.category, color: colors.textSecondary, icon: '•' };
  const hasSteps = (rebalancingSteps?.length ?? 0) > 0;

  return (
    <Pressable onPress={() => setExpanded((v) => !v)}>
      <View style={{
        backgroundColor: colors.surfaceSecondary,
        borderRadius: radius.md,
        padding: spacing.sm,
        borderLeftWidth: 3,
        borderLeftColor: meta.color,
        gap: spacing.xs,
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm }}>
          <Typography variant="footnote" weight="700" style={{ flex: 1 }}>
            {item.is_completed ? '✓ ' : ''}{item.title}
          </Typography>
          <View style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 1.5,
            borderColor: item.is_completed ? meta.color : colors.border,
            backgroundColor: item.is_completed ? `${meta.color}22` : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {item.is_completed && (
              <Typography variant="micro" color={meta.color} weight="800">✓</Typography>
            )}
          </View>
        </View>

        {expanded && item.description ? (
          <Typography variant="caption" color={colors.textSecondary} style={{ lineHeight: 18 }}>
            {item.description}
          </Typography>
        ) : null}

        {expanded && item.estimated_impact ? (
          <Typography variant="caption" color={colors.accent} weight="600">
            Impact: {item.estimated_impact}
          </Typography>
        ) : null}

        {expanded && hasSteps && (
          <ExecutionSteps steps={rebalancingSteps!} />
        )}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
            <View style={{
              backgroundColor: `${meta.color}18`,
              borderRadius: radius.xs,
              paddingHorizontal: 5,
              paddingVertical: 2,
            }}>
              <Typography variant="micro" color={meta.color} weight="700">{meta.label}</Typography>
            </View>
            {item.priority <= 2 && (
              <View style={{ backgroundColor: `${palette.red500}18`, borderRadius: radius.xs, paddingHorizontal: 5, paddingVertical: 2 }}>
                <Typography variant="micro" color={palette.red500} weight="700">HIGH</Typography>
              </View>
            )}
            {hasSteps && !expanded && (
              <View style={{ backgroundColor: `${meta.color}18`, borderRadius: radius.xs, paddingHorizontal: 5, paddingVertical: 2 }}>
                <Typography variant="micro" color={meta.color} weight="600">
                  {rebalancingSteps!.length} step{rebalancingSteps!.length !== 1 ? 's' : ''}
                </Typography>
              </View>
            )}
          </View>
          {item.target_date && (
            <Typography variant="micro" color={colors.textTertiary}>
              by {formatDate(item.target_date, 'MMM YYYY')}
            </Typography>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function ActionItemsSection({
  items,
  planJsonItems,
}: {
  items: RawFPActionItem[];
  planJsonItems?: Array<Record<string, unknown>>;
}) {
  const { colors, spacing } = useTheme();

  // Build action_key → rebalancing_steps from plan_json.action_items
  const stepsMap = useMemo(() => {
    const m: Record<string, RebalancingStep[]> = {};
    for (const a of planJsonItems ?? []) {
      const key = a.action_key as string | undefined;
      if (key) m[key] = (a.rebalancing_steps as RebalancingStep[] | undefined) ?? [];
    }
    return m;
  }, [planJsonItems]);

  const byCategory = useMemo(() => {
    const map: Record<string, RawFPActionItem[]> = {};
    for (const item of items) {
      (map[item.category] ??= []).push(item);
    }
    return map;
  }, [items]);

  const completed = items.filter((i) => i.is_completed).length;

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionHeader title="Action Plan" />
        <Chip label={`${completed}/${items.length} done`} color={completed === items.length ? palette.green500 : palette.amber500} />
      </View>

      {Object.entries(byCategory)
        .sort(([a], [b]) => {
          const order = ['INVEST', 'REBALANCE', 'EMERGENCY_FUND', 'GOAL', 'TAX', 'INSURANCE', 'REDUCE_EXPENSE'];
          return order.indexOf(a) - order.indexOf(b);
        })
        .map(([cat, catItems]) => {
          const meta = ACTION_CATEGORIES[cat] ?? { label: cat, color: colors.textSecondary, icon: '•' };
          const catDone = catItems.filter((i) => i.is_completed).length;
          return (
            <View key={cat} style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Typography variant="footnote">{meta.icon}</Typography>
                <Typography variant="footnote" color={meta.color} weight="700">{meta.label.toUpperCase()}</Typography>
                <Typography variant="micro" color={colors.textTertiary}>({catDone}/{catItems.length})</Typography>
              </View>
              {catItems.map((item) => (
                <ActionItemCard
                  key={item.id}
                  item={item}
                  rebalancingSteps={stepsMap[item.action_key]}
                />
              ))}
            </View>
          );
        })}
    </View>
  );
}

function AllocationRow({ label, current, recommended, color }: {
  label: string; current?: number; recommended?: number; color: string;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Typography variant="footnote" style={{ flex: 1 }}>{label}</Typography>
      <Typography variant="footnote" color={colors.textSecondary} weight="600" style={{ width: 48, textAlign: 'right' }}>
        {current != null ? `${current.toFixed(0)}%` : '—'}
      </Typography>
      <Typography variant="footnote" color={color} weight="700" style={{ width: 48, textAlign: 'right' }}>
        {recommended != null ? `${recommended.toFixed(0)}%` : '—'}
      </Typography>
    </View>
  );
}

const ALLOCATION_ASSET_CLASSES: Array<{ key: string; label: string; color: string }> = [
  { key: 'equity',      label: 'Equity',      color: palette.blue500 },
  { key: 'debt',        label: 'Debt',        color: palette.green500 },
  { key: 'gold',        label: 'Gold',        color: palette.amber500 },
  { key: 'real_estate', label: 'Real Estate', color: '#E76F51' },
  { key: 'crypto',      label: 'Crypto',      color: palette.amber400 },
  { key: 'cash',        label: 'Cash',        color: palette.neutral400 },
];

// ── main screen ───────────────────────────────────────────────────────────────

export default function PlanScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const backup = usePortfolioStore((s) => s.backup);
  const status = usePortfolioStore((s) => s.status);

  const plans: RawFPPlan[] = useMemo(() => {
    const raw = backup?.fp_plans ?? [];
    return raw
      .filter((p) => p.accepted_at != null)
      .sort((a, b) => new Date(b.accepted_at!).getTime() - new Date(a.accepted_at!).getTime());
  }, [backup]);

  const [selectedId, setSelectedId] = useState<number | null>(null);

  const activePlan = useMemo(() => {
    if (plans.length === 0) return null;
    return plans.find((p) => p.id === selectedId) ?? plans[0];
  }, [plans, selectedId]);

  if (status === 'idle' || status === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <EmptyState
            title="No Data"
            subtitle="Import your PortAct backup to view your financial plan."
            action={<Button label="Import Backup" variant="primary" onPress={() => router.replace('/onboarding')} />}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (plans.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ padding: spacing.md, paddingTop: spacing.xl }}>
          <Typography variant="title2" weight="700">Financial Plan</Typography>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <EmptyState
            title="No Plan Yet"
            subtitle="Generate and accept a financial plan in the PortAct app, then re-import your backup."
          />
        </View>
      </SafeAreaView>
    );
  }

  const pj = activePlan!.plan_json as Record<string, unknown>;
  const hsObj = pj.health_score as Record<string, unknown> | number | null | undefined;
  const healthScore: number = typeof hsObj === 'number'
    ? hsObj
    : typeof hsObj === 'object' && hsObj != null
    ? ((hsObj.overall ?? hsObj.score ?? hsObj.value) as number | null | undefined) ?? activePlan!.health_score ?? 0
    : activePlan!.health_score ?? 0;
  const executiveSummary = pj.executive_summary as string | undefined;
  const assetAlloc = pj.asset_allocation as Record<string, unknown> | undefined;
  const goalPlans: Array<Record<string, unknown>> = (pj.goal_plans as Array<Record<string, unknown>>) ?? [];
  const taxOpt = pj.tax_optimization as Record<string, unknown> | undefined;
  const insGaps = pj.insurance_gaps as Record<string, unknown> | undefined;
  const expReduction: Array<Record<string, unknown>> = (pj.expense_reduction as Array<Record<string, unknown>>) ?? [];
  const rip = pj.retirement_income_plan as Record<string, unknown> | undefined;

  const { grade, color: gradeColor } = scoreGrade(healthScore);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xxxl }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Page title ── */}
        <View>
          <Typography variant="title2" weight="700">Financial Plan</Typography>
          <Typography variant="caption" color={colors.textSecondary}>AI-powered recommendations for your portfolio</Typography>
        </View>

        {/* ── Plan picker (if multiple plans) ── */}
        {plans.length > 1 && (
          <View style={{ gap: spacing.xs }}>
            <Typography variant="caption" color={colors.textSecondary} weight="600">SELECT PLAN VERSION</Typography>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {plans.map((p) => {
                const isActive = (activePlan?.id ?? plans[0].id) === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setSelectedId(p.id)}
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                      borderRadius: radius.full,
                      backgroundColor: isActive ? colors.accent : colors.surface,
                      borderWidth: 1,
                      borderColor: isActive ? colors.accent : colors.border,
                    }}
                  >
                    <Typography variant="footnote" color={isActive ? '#fff' : colors.textPrimary} weight="600">
                      {p.name ?? `v${p.version}`}
                    </Typography>
                    <Typography variant="micro" color={isActive ? '#ffffffaa' : colors.textSecondary}>
                      {formatDate(p.accepted_at ?? p.created_at, 'DD MMM YYYY')}
                    </Typography>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Plan header card ── */}
        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Typography variant="headline" weight="700">
                {activePlan!.name ?? `Financial Plan v${activePlan!.version}`}
              </Typography>
              {activePlan!.description ? (
                <Typography variant="caption" color={colors.textSecondary}>{activePlan!.description}</Typography>
              ) : null}
            </View>
            <View style={{
              backgroundColor: `${gradeColor}22`,
              borderRadius: radius.md,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xs,
              alignItems: 'center',
            }}>
              <Typography variant="title3" color={gradeColor} weight="800">{grade}</Typography>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }}>
            <View>
              <Typography variant="micro" color={colors.textSecondary} weight="600">
                {activePlan!.accepted_at ? 'ACCEPTED' : 'GENERATED'}
              </Typography>
              <Typography variant="caption" weight="600">{formatDate(activePlan!.accepted_at ?? activePlan!.created_at)}</Typography>
            </View>
            <View>
              <Typography variant="micro" color={colors.textSecondary} weight="600">VERSION</Typography>
              <Typography variant="caption" weight="600">v{activePlan!.version}</Typography>
            </View>
            <View>
              <Typography variant="micro" color={colors.textSecondary} weight="600">AI</Typography>
              <Typography variant="caption" weight="600">{activePlan!.ai_provider}</Typography>
            </View>
          </View>
        </Card>

        {/* ── Health Score ── */}
        <Card style={{ alignItems: 'center', gap: spacing.sm }}>
          <SectionHeader title="Financial Health Score" />
          <HealthGauge score={healthScore} />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            {[
              { range: '85–100', grade: 'A', color: palette.green500 },
              { range: '70–84',  grade: 'B', color: palette.blue500 },
              { range: '55–69',  grade: 'C', color: palette.amber500 },
              { range: '0–54',   grade: 'D', color: palette.red500 },
            ].map((g) => (
              <View key={g.grade} style={{ alignItems: 'center', gap: 2 }}>
                <Typography variant="caption" color={g.color} weight="700">{g.grade}</Typography>
                <Typography variant="micro" color={colors.textTertiary}>{g.range}</Typography>
              </View>
            ))}
          </View>
        </Card>

        {/* ── Executive Summary ── */}
        {executiveSummary ? (
          <Card style={{ gap: spacing.sm }}>
            <SectionHeader title="Executive Summary" />
            <Typography variant="body" color={colors.textSecondary} style={{ lineHeight: 22 }}>
              {executiveSummary}
            </Typography>
          </Card>
        ) : null}

        {/* ── Goals ── */}
        {goalPlans.length > 0 && (
          <View style={{ gap: spacing.md }}>
            <SectionHeader title="Goal Plans" />
            {goalPlans.map((goal, idx) => (
              <GoalCard key={(goal.id as number | undefined) ?? idx} goal={goal} />
            ))}
          </View>
        )}

        {/* ── Asset Allocation ── */}
        {assetAlloc && (
          <Card style={{ gap: spacing.sm }}>
            <SectionHeader title="Asset Allocation" />
            <View style={{ flexDirection: 'row', paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Typography variant="micro" color={colors.textTertiary} style={{ flex: 1, paddingLeft: 18 }}>CLASS</Typography>
              <Typography variant="micro" color={colors.textTertiary} style={{ width: 48, textAlign: 'right' }}>CURRENT</Typography>
              <Typography variant="micro" color={colors.textTertiary} style={{ width: 48, textAlign: 'right' }}>TARGET</Typography>
            </View>
            {ALLOCATION_ASSET_CLASSES.map(({ key, label, color }) => {
              const aa = assetAlloc as Record<string, unknown>;
              // Support both nested {current:{equity_pct:N}} and flat {current_equity_pct:N} formats
              const current =
                (aa.current as Record<string, number> | undefined)?.[`${key}_pct`] ??
                (aa[`current_${key}_pct`] as number | undefined);
              const recommended =
                (aa.recommended as Record<string, number> | undefined)?.[`${key}_pct`] ??
                (aa[`recommended_${key}_pct`] as number | undefined) ??
                (aa[`target_${key}_pct`] as number | undefined);
              if (current == null && recommended == null) return null;
              return (
                <AllocationRow key={key} label={label} current={current} recommended={recommended} color={color} />
              );
            })}
            {(() => {
              const aa = assetAlloc as Record<string, unknown>;
              const note = (aa.rationale ?? aa.rebalancing_summary) as string | undefined;
              return note ? (
                <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.xs }}>
                  <Typography variant="caption" color={colors.accent}>{note}</Typography>
                </View>
              ) : null;
            })()}
          </Card>
        )}

        {/* ── Retirement Income Plan ── */}
        {rip && (rip.applicable as boolean) !== false && (
          <Card style={{ gap: spacing.sm }}>
            <SectionHeader title="Retirement Plan" />
            <View style={{ flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' }}>
              {[
                { label: 'Retirement Age', value: rip.retirement_age != null ? String(rip.retirement_age) : '—' },
                { label: 'Years Away', value: rip.years_to_retirement != null ? `${rip.years_to_retirement}y` : '—' },
                { label: 'Corpus Needed', value: rip.corpus_required != null ? formatCompact(rip.corpus_required as number) : '—' },
                { label: 'Corpus Available', value: rip.corpus_available != null ? formatCompact(rip.corpus_available as number) : '—' },
              ].map((item) => (
                <View key={item.label} style={{ minWidth: '45%', gap: 2 }}>
                  <Typography variant="micro" color={colors.textSecondary} weight="600">{item.label.toUpperCase()}</Typography>
                  <Typography variant="callout" weight="700">{item.value}</Typography>
                </View>
              ))}
            </View>
            {rip.corpus_surplus_or_deficit != null && (
              <View style={{
                backgroundColor: (rip.corpus_surplus_or_deficit as number) >= 0 ? colors.gainSoft : colors.lossSoft,
                borderRadius: radius.sm,
                padding: spacing.sm,
              }}>
                <Typography
                  variant="footnote"
                  color={(rip.corpus_surplus_or_deficit as number) >= 0 ? colors.gain : colors.loss}
                  weight="700"
                >
                  {(rip.corpus_surplus_or_deficit as number) >= 0 ? 'Surplus: ' : 'Deficit: '}
                  {formatCompact(Math.abs(rip.corpus_surplus_or_deficit as number))}
                </Typography>
              </View>
            )}
            {rip.notes ? (
              <Typography variant="caption" color={colors.textSecondary} style={{ lineHeight: 18 }}>
                {rip.notes as string}
              </Typography>
            ) : null}
          </Card>
        )}

        {/* ── Tax Optimization ── */}
        {taxOpt && (
          <Card style={{ gap: spacing.sm }}>
            <SectionHeader title="Tax Optimization" />
            {(taxOpt.recommendations as Array<unknown> | undefined)?.map((r, i) => {
              if (typeof r === 'string') {
                // Old format: plain string recommendation
                return (
                  <View key={i} style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Typography variant="caption" color={palette.green500} weight="700">✓</Typography>
                    <Typography variant="body" color={colors.textSecondary} style={{ flex: 1, lineHeight: 20 }}>{r}</Typography>
                  </View>
                );
              }
              // New format: object with instrument / tax_saving / recommended_amount / notes
              const rec = r as Record<string, unknown>;
              return (
                <View key={i} style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, padding: spacing.sm, gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="footnote" weight="700" style={{ flex: 1 }}>{rec.instrument as string}</Typography>
                    {rec.tax_saving != null && (
                      <Typography variant="footnote" color={colors.gain} weight="700">
                        Save {formatCompact(rec.tax_saving as number)}
                      </Typography>
                    )}
                  </View>
                  {rec.recommended_amount != null && (
                    <Typography variant="caption" color={colors.textSecondary}>
                      Invest {formatCompact(rec.recommended_amount as number)}/yr
                    </Typography>
                  )}
                  {rec.notes ? (
                    <Typography variant="caption" color={colors.textSecondary} style={{ lineHeight: 18 }}>
                      {rec.notes as string}
                    </Typography>
                  ) : null}
                </View>
              );
            })}
            {/* Old format: summary + estimated_savings */}
            {typeof taxOpt.summary === 'string' && (
              <Typography variant="body" color={colors.textSecondary} style={{ lineHeight: 20 }}>{taxOpt.summary}</Typography>
            )}
            {taxOpt.estimated_savings != null && (
              <View style={{ backgroundColor: colors.gainSoft, borderRadius: radius.sm, padding: spacing.sm }}>
                <Typography variant="footnote" color={colors.gain} weight="700">
                  Estimated Tax Savings: {formatCompact(taxOpt.estimated_savings as number)}/yr
                </Typography>
              </View>
            )}
            {/* New format: NPS / 80D specific benefits */}
            {(taxOpt.nps_tier1_benefit != null || taxOpt['80d_health_premium_benefit'] != null) && (
              <View style={{ backgroundColor: colors.gainSoft, borderRadius: radius.sm, padding: spacing.sm, gap: 2 }}>
                {taxOpt.nps_tier1_benefit != null && (
                  <Typography variant="caption" color={colors.gain} weight="700">
                    NPS 80CCD(1B): Save {formatCompact(taxOpt.nps_tier1_benefit as number)}/yr
                  </Typography>
                )}
                {taxOpt['80d_health_premium_benefit'] != null && (
                  <Typography variant="caption" color={colors.gain} weight="700">
                    Health Insurance 80D: Save {formatCompact(taxOpt['80d_health_premium_benefit'] as number)}/yr
                  </Typography>
                )}
              </View>
            )}
          </Card>
        )}

        {/* ── Insurance Gaps ── */}
        {insGaps && (() => {
          const ig = insGaps as Record<string, unknown>;
          // Old format: { gaps: string[], recommendations: string[], summary: string }
          if (Array.isArray(ig.gaps) || Array.isArray(ig.recommendations)) {
            const gaps = ig.gaps as string[] | undefined;
            const recs = ig.recommendations as string[] | undefined;
            if (!gaps?.length && !recs?.length) return null;
            return (
              <Card style={{ gap: spacing.sm }}>
                <SectionHeader title="Insurance Gaps" />
                {gaps?.map((g, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Typography variant="caption" color={palette.red400} weight="700">!</Typography>
                    <Typography variant="body" color={colors.textSecondary} style={{ flex: 1, lineHeight: 20 }}>{g}</Typography>
                  </View>
                ))}
                {recs?.map((r, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Typography variant="caption" color={palette.purple500} weight="700">→</Typography>
                    <Typography variant="body" color={colors.textSecondary} style={{ flex: 1, lineHeight: 20 }}>{r}</Typography>
                  </View>
                ))}
                {typeof ig.summary === 'string' && (
                  <Typography variant="body" color={colors.textSecondary} style={{ lineHeight: 20 }}>{ig.summary}</Typography>
                )}
              </Card>
            );
          }
          // New format: each key is an insurance type object with { adequate, gap, ... }
          const inadequateEntries = Object.entries(ig).filter(([, detail]) => {
            if (typeof detail !== 'object' || detail == null) return false;
            return (detail as Record<string, unknown>).adequate !== true;
          });
          if (inadequateEntries.length === 0) return null;
          return (
            <Card style={{ gap: spacing.sm }}>
              <SectionHeader title="Insurance Gaps" />
              {inadequateEntries.map(([type, detail]) => {
                const d = detail as Record<string, unknown>;
                return (
                  <View key={type} style={{ backgroundColor: colors.lossSoft, borderRadius: radius.sm, padding: spacing.sm, gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="footnote" weight="700" color={colors.loss}>
                        {type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </Typography>
                      {d.gap != null && (
                        <Chip label={`Gap: ${formatCompact(d.gap as number)}`} color={colors.loss} />
                      )}
                    </View>
                    {d.current_coverage != null && d.recommended_coverage != null && (
                      <Typography variant="caption" color={colors.textSecondary}>
                        Current: {formatCompact(d.current_coverage as number)} → Recommended: {formatCompact(d.recommended_coverage as number)}
                      </Typography>
                    )}
                    {d.reasoning ? (
                      <Typography variant="caption" color={colors.textSecondary} style={{ lineHeight: 18 }}>
                        {d.reasoning as string}
                      </Typography>
                    ) : null}
                    {d.annual_premium_estimate != null && (
                      <Typography variant="caption" color={colors.warning} weight="600">
                        Est. premium: {formatCompact(d.annual_premium_estimate as number)}/yr
                      </Typography>
                    )}
                  </View>
                );
              })}
            </Card>
          );
        })()}

        {/* ── Expense Reduction ── */}
        {expReduction.length > 0 && (
          <Card style={{ gap: spacing.sm }}>
            <SectionHeader title="Expense Reduction" />
            {expReduction.map((item, i) => {
              const cat = item.category as string | undefined;
              const tip = (item.tip ?? item.suggestion) as string | undefined;
              const saving = (item.saving ?? item.potential_savings) as number | null | undefined;
              const currentMonthly = item.current_monthly as number | undefined;
              const recommendedMonthly = item.recommended_monthly as number | undefined;
              return (
                <View key={i} style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, padding: spacing.sm, gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    {cat ? (
                      <Typography variant="caption" color={colors.accent} weight="700" style={{ flex: 1 }}>
                        {cat.replace(/_/g, ' ').toUpperCase()}
                      </Typography>
                    ) : null}
                    {saving != null && (
                      <Typography variant="caption" color={colors.gain} weight="700">
                        Save {formatCompact(saving)}/mo
                      </Typography>
                    )}
                  </View>
                  {currentMonthly != null && recommendedMonthly != null && (
                    <Typography variant="caption" color={colors.textSecondary}>
                      {formatCompact(currentMonthly)} → {formatCompact(recommendedMonthly)}/mo
                    </Typography>
                  )}
                  {tip ? (
                    <Typography variant="caption" color={colors.textSecondary} style={{ lineHeight: 18 }}>{tip}</Typography>
                  ) : null}
                </View>
              );
            })}
          </Card>
        )}

        {/* ── Action Items ── */}
        {activePlan!.action_items.length > 0 && (
          <ActionItemsSection
            items={activePlan!.action_items}
            planJsonItems={pj.action_items as Array<Record<string, unknown>> | undefined}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
