import React, { useMemo } from 'react';
import { View, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { PortfolioSnapshot } from '@models/portfolio';
import { Typography } from '@components/ui/Typography';
import { useTheme } from '@hooks/useTheme';
import { formatCompact } from '@utils/formatters';
import dayjs from 'dayjs';

interface PortfolioLineChartProps {
  snapshots: PortfolioSnapshot[];
  period?: '1M' | '3M' | '6M' | '1Y' | 'ALL';
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function PortfolioLineChart({ snapshots, period = 'ALL' }: PortfolioLineChartProps) {
  const { colors, spacing } = useTheme();

  const filtered = useMemo(() => {
    if (snapshots.length === 0) return [];
    // Drop snapshots that would produce NaN in SVG paths
    const valid = snapshots.filter(
      (s) => s.totalValue != null && isFinite(s.totalValue),
    );
    if (valid.length === 0) return [];
    const now = dayjs();
    const cutoffs: Record<string, dayjs.Dayjs> = {
      '1M': now.subtract(1, 'month'),
      '3M': now.subtract(3, 'month'),
      '6M': now.subtract(6, 'month'),
      '1Y': now.subtract(1, 'year'),
      'ALL': dayjs('2000-01-01'),
    };
    const from = cutoffs[period] ?? cutoffs['ALL'];
    const inRange = valid.filter((s) => dayjs(s.date).isAfter(from));
    return inRange.length >= 2 ? inRange : valid;
  }, [snapshots, period]);

  if (filtered.length < 2) {
    return (
      <View style={{ height: 160, alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="footnote" color={colors.textSecondary}>
          No snapshot data available
        </Typography>
      </View>
    );
  }

  const values = filtered.map((s) => s.totalValue);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || maxVal * 0.05;

  // Shift all values so the minimum sits just above 0.
  // This is the only reliable way to "zoom in" on a value range in
  // react-native-gifted-charts without yAxisOffset breaking the scaling.
  const floor = Math.max(0, minVal - range * 0.15);
  const shiftedMax = (maxVal - floor) * 1.1;

  const isGain = (filtered[filtered.length - 1]?.totalValue ?? 0) >= (filtered[0]?.totalValue ?? 0);
  const lineColor = isGain ? colors.gain : colors.loss;

  const chartWidth = SCREEN_WIDTH - 32 - spacing.md * 2;

  // Distribute all data points evenly across the available width so nothing is clipped.
  // Without an explicit spacing, gifted-charts uses a large default (~40-50px) which
  // cuts off data when there are many points.
  const INITIAL_END_SPACING = 8;
  const pointSpacing = Math.max(
    2,
    Math.floor((chartWidth - INITIAL_END_SPACING * 2) / Math.max(filtered.length - 1, 1)),
  );

  const labelStep = Math.max(1, Math.ceil(filtered.length / 6));

  const chartData = filtered.map((s, i) => ({
    value: s.totalValue - floor,
    // Skip index 0 label to avoid left-edge clipping; use 'D MMM' (e.g. "1 Mar") so
    // it can't be mistaken for a year-suffixed format like "Mar 26".
    label: i > 0 && i % labelStep === 0 ? dayjs(s.date).format('D MMM') : '',
    dataPointText: '',
    originalValue: s.totalValue,
    originalDate: s.date,
  }));

  return (
    <View>
      <LineChart
        data={chartData}
        width={chartWidth}
        height={160}
        maxValue={shiftedMax}
        // Line
        color={lineColor}
        thickness={2}
        // Area fill
        areaChart
        startFillColor={`${lineColor}30`}
        endFillColor="transparent"
        startOpacity={1}
        endOpacity={0}
        // Curve
        curved
        curvature={0.2}
        // Data points
        hideDataPoints
        // Y axis — hidden since values are shifted
        hideYAxisText
        yAxisColor="transparent"
        // X axis
        xAxisColor={colors.border}
        xAxisLabelTextStyle={{ color: colors.textTertiary, fontSize: 9 }}
        // Grid
        rulesColor={`${colors.border}60`}
        rulesType="solid"
        noOfSections={3}
        // Spacing — computed so all points fit exactly in chartWidth
        spacing={pointSpacing}
        initialSpacing={INITIAL_END_SPACING}
        endSpacing={INITIAL_END_SPACING}
        disableScroll
        // Touch tooltip — show REAL value, not shifted
        pointerConfig={{
          pointerStripColor: colors.textSecondary,
          pointerStripWidth: 1,
          pointerColor: lineColor,
          radius: 4,
          pointerLabelWidth: 110,
          pointerLabelHeight: 52,
          autoAdjustPointerLabelPosition: true,
          pointerLabelComponent: (items: { value: number; label: string; originalValue?: number; originalDate?: string }[]) => {
            const item = items[0];
            if (!item) return null;
            const dateLabel = item.originalDate
              ? dayjs(item.originalDate).format('D MMM YYYY')
              : item.label;
            return (
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 8,
                  padding: spacing.sm,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Typography variant="micro" color={colors.textSecondary}>{dateLabel}</Typography>
                <Typography variant="footnote" weight="700">
                  {formatCompact(item.originalValue ?? (item.value + floor))}
                </Typography>
              </View>
            );
          },
        }}
      />
    </View>
  );
}
