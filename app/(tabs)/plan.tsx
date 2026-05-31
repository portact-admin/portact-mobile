import React, { useMemo, useState } from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
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

function scoreGrade(score: number): { grade: string; color: string } {
  if (score >= 70) return { grade: 'A', color: palette.green500 };
  if (score >= 50) return { grade: 'B', color: palette.blue500 };
  if (score >= 30) return { grade: 'C', color: palette.amber500 };
  return { grade: 'D', color: palette.red500 };
}

/** Polar to cartesian for SVG arc */
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Semicircle arc path for the gauge (–180° to 0°, left to right) */
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const s = polarToCartesian(cx, cy, r, startDeg);
  const e = polarToCartesian(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
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
  const SIZE = 140;
  const cx = SIZE / 2;
  const cy = SIZE / 2 + 10;
  const R = 50;
  const strokeW = 10;

  const clampedScore = Math.min(100, Math.max(0, score));
  const startDeg = 180;
  const endDeg = 180 + (clampedScore / 100) * 180;
  const { grade, color } = scoreGrade(clampedScore);

  return (
    <Svg width={SIZE} height={SIZE / 2 + 20}>
      {/* track */}
      <Path
        d={arcPath(cx, cy, R, 180, 360)}
        stroke={palette.neutral200}
        strokeWidth={strokeW}
        fill="none"
        strokeLinecap="round"
      />
      {/* fill */}
      {clampedScore > 0 && (
        <Path
          d={arcPath(cx, cy, R, startDeg, endDeg)}
          stroke={color}
          strokeWidth={strokeW}
          fill="none"
          strokeLinecap="round"
        />
      )}
      {/* score label */}
      <SvgText
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        fontSize={26}
        fontWeight="800"
        fill={color}
      >
        {Math.round(clampedScore)}
      </SvgText>
      {/* grade label */}
      <SvgText
        x={cx}
        y={cy + 16}
        textAnchor="middle"
        fontSize={13}
        fontWeight="600"
        fill={color}
        letterSpacing={2}
      >
        GRADE {grade}
      </SvgText>
    </Svg>
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
  const name = (goal.name as string) ?? 'Goal';
  const goalType = (goal.goal_type as string | null) ?? null;
  const status = (goal.status as string | null) ?? null;
  const targetAmount = (goal.target_amount as number) ?? 0;
  const currentSavings = (goal.current_savings as number) ?? 0;
  const targetDate = (goal.target_date as string | null) ?? null;
  const monthlyRequired = (goal.monthly_required as number | null) ?? null;

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

function ActionItemCard({ item }: { item: RawFPActionItem }) {
  const { colors, spacing, radius } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const meta = ACTION_CATEGORIES[item.category] ?? { label: item.category, color: colors.textSecondary, icon: '•' };

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

function ActionItemsSection({ items }: { items: RawFPActionItem[] }) {
  const { colors, spacing } = useTheme();
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
                <ActionItemCard key={item.id} item={item} />
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

// ── main screen ───────────────────────────────────────────────────────────────

export default function PlanScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const backup = usePortfolioStore((s) => s.backup);
  const status = usePortfolioStore((s) => s.status);

  const plans: RawFPPlan[] = useMemo(() => {
    const raw = backup?.fp_plans ?? [];
    return raw
      .filter((p) => p.accepted_at != null && p.is_active)
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
            subtitle="Your PortAct backup does not include any accepted financial plan. Generate and accept a plan in the PortAct app to see it here."
          />
        </View>
      </SafeAreaView>
    );
  }

  const pj = activePlan!.plan_json as Record<string, unknown>;
  const healthScore = (pj.health_score as number | null) ?? activePlan!.health_score ?? 0;
  const executiveSummary = pj.executive_summary as string | undefined;
  const assetAlloc = pj.asset_allocation as Record<string, unknown> | undefined;
  const goalPlans: Array<Record<string, unknown>> = (pj.goal_plans as Array<Record<string, unknown>>) ?? [];
  const taxOpt = pj.tax_optimization as Record<string, unknown> | undefined;
  const insGaps = pj.insurance_gaps as Record<string, unknown> | undefined;
  const expReduction: Array<Record<string, unknown>> = (pj.expense_reduction as Array<Record<string, unknown>>) ?? [];
  const rip = pj.retirement_income_plan as Record<string, unknown> | undefined;

  const allocationAssetClasses: Array<{ key: string; label: string; color: string }> = [
    { key: 'equity', label: 'Equity', color: palette.blue500 },
    { key: 'debt', label: 'Debt', color: palette.green500 },
    { key: 'gold', label: 'Gold', color: palette.amber500 },
    { key: 'real_estate', label: 'Real Estate', color: '#E76F51' },
    { key: 'crypto', label: 'Crypto', color: palette.amber400 },
    { key: 'cash', label: 'Cash', color: palette.neutral400 },
  ];

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
                      {formatDate(p.accepted_at!, 'DD MMM YYYY')}
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
              <Typography variant="micro" color={colors.textSecondary} weight="600">ACCEPTED</Typography>
              <Typography variant="caption" weight="600">{formatDate(activePlan!.accepted_at!)}</Typography>
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
              { range: '70–100', grade: 'A', color: palette.green500 },
              { range: '50–69', grade: 'B', color: palette.blue500 },
              { range: '30–49', grade: 'C', color: palette.amber500 },
              { range: '0–29',  grade: 'D', color: palette.red500 },
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
            {allocationAssetClasses.map(({ key, label, color }) => {
              const curr = (assetAlloc as Record<string, unknown>);
              const current = (curr[`current_${key}_pct`] ?? curr[`${key}_pct`]) as number | undefined;
              const recommended = (curr[`recommended_${key}_pct`] ?? curr[`target_${key}_pct`]) as number | undefined;
              if (current == null && recommended == null) return null;
              return (
                <AllocationRow key={key} label={label} current={current} recommended={recommended} color={color} />
              );
            })}
            {(assetAlloc as Record<string, unknown>).rebalancing_summary ? (
              <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.xs }}>
                <Typography variant="caption" color={colors.accent}>
                  {(assetAlloc as Record<string, unknown>).rebalancing_summary as string}
                </Typography>
              </View>
            ) : null}
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
            {(taxOpt.recommendations as string[] | undefined)?.map((r, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Typography variant="caption" color={palette.green500} weight="700">✓</Typography>
                <Typography variant="body" color={colors.textSecondary} style={{ flex: 1, lineHeight: 20 }}>{r}</Typography>
              </View>
            ))}
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
          </Card>
        )}

        {/* ── Insurance Gaps ── */}
        {insGaps && (
          <Card style={{ gap: spacing.sm }}>
            <SectionHeader title="Insurance Gaps" />
            {(insGaps.gaps as string[] | undefined)?.map((g, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Typography variant="caption" color={palette.red400} weight="700">!</Typography>
                <Typography variant="body" color={colors.textSecondary} style={{ flex: 1, lineHeight: 20 }}>{g}</Typography>
              </View>
            ))}
            {(insGaps.recommendations as string[] | undefined)?.map((r, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Typography variant="caption" color={palette.purple500} weight="700">→</Typography>
                <Typography variant="body" color={colors.textSecondary} style={{ flex: 1, lineHeight: 20 }}>{r}</Typography>
              </View>
            ))}
            {typeof insGaps.summary === 'string' && (
              <Typography variant="body" color={colors.textSecondary} style={{ lineHeight: 20 }}>{insGaps.summary}</Typography>
            )}
          </Card>
        )}

        {/* ── Expense Reduction ── */}
        {expReduction.length > 0 && (
          <Card style={{ gap: spacing.sm }}>
            <SectionHeader title="Expense Reduction" />
            {expReduction.map((item, i) => {
              const cat = item.category as string | undefined;
              const suggestion = item.suggestion as string | undefined;
              const savings = item.potential_savings as number | null | undefined;
              return (
                <View key={i} style={{
                  backgroundColor: colors.surfaceSecondary,
                  borderRadius: radius.sm,
                  padding: spacing.sm,
                  gap: 4,
                }}>
                  {cat ? (
                    <Typography variant="caption" color={colors.accent} weight="700">
                      {cat.replace(/_/g, ' ').toUpperCase()}
                    </Typography>
                  ) : null}
                  {suggestion ? (
                    <Typography variant="body" color={colors.textSecondary} style={{ lineHeight: 20 }}>
                      {suggestion}
                    </Typography>
                  ) : null}
                  {savings != null && (
                    <Typography variant="footnote" color={colors.gain} weight="700">
                      Save {formatCompact(savings)}/mo
                    </Typography>
                  )}
                </View>
              );
            })}
          </Card>
        )}

        {/* ── Action Items ── */}
        {activePlan!.action_items.length > 0 && (
          <ActionItemsSection items={activePlan!.action_items} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
