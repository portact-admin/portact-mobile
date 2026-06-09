import { RawAsset, RawPortfolioSnapshot, RawExpense, RawIncome } from '@models/backup';
import { AssetAllocation, PortfolioSummary, PortfolioSnapshot, MonthlyExpense, IncomeVsExpense } from '@models/portfolio';
import { assetTypeColors, palette } from '@theme/colors';
import dayjs from 'dayjs';

export function computePortfolioSummary(
  assets: RawAsset[],
  bankBalance: number,
  dematCash: number,
  cryptoCash: number,
): PortfolioSummary {
  const activeAssets = assets.filter((a) => a.is_active);
  const assetsValue = activeAssets.reduce((s, a) => s + (a.current_value ?? 0), 0);
  // Cash (bank / demat / crypto accounts) is treated as invested = value → 0 gain/loss.
  // This matches the web app: Dashboard.tsx sets invested = value for all cash entries
  // so they don't inflate the portfolio P&L figure.
  const totalValue = assetsValue + bankBalance + dematCash + cryptoCash;
  const totalInvested = activeAssets.reduce((s, a) => s + (a.total_invested ?? 0), 0);
  const totalGainLoss = assetsValue - totalInvested;
  const gainLossPercent = totalInvested > 0
    ? (totalGainLoss / totalInvested) * 100
    : 0;

  return {
    totalValue,
    totalInvested,
    totalGainLoss,
    gainLossPercent,
    bankBalance,
    dematCash,
    cryptoCash,
    assetCount: activeAssets.length,
    // Populated by refreshLivePrices once live prices (and prev-close) are known.
    dailyChange: 0,
    dailyChangePercent: 0,
  };
}

export function computeAllocations(
  assets: RawAsset[],
  typeDisplayMap: Record<string, string>,
): AssetAllocation[] {
  const byType: Record<string, { value: number; invested: number }> = {};

  for (const a of assets) {
    if (!a.is_active) continue;
    const v = a.current_value ?? 0;
    const i = a.total_invested ?? 0;
    if (!byType[a.asset_type]) byType[a.asset_type] = { value: 0, invested: 0 };
    byType[a.asset_type].value += v;
    byType[a.asset_type].invested += i;
  }

  const total = Object.values(byType).reduce((s, b) => s + b.value, 0);
  if (total === 0) return [];

  return Object.entries(byType)
    .map(([type, data]) => ({
      assetType: type,
      displayName: typeDisplayMap[type] ?? type,
      currentValue: data.value,
      totalInvested: data.invested,
      percentage: (data.value / total) * 100,
      color: assetTypeColors[type] ?? palette.neutral400,
    }))
    .sort((a, b) => b.currentValue - a.currentValue);
}

export function computeSnapshots(raw: RawPortfolioSnapshot[]): PortfolioSnapshot[] {
  return raw
    .filter((s) => !!s.snapshot_date)
    .map((s) => {
      // Correct field names from the backup JSON export:
      //   total_current_value  (NOT total_value — that was a wrong mapping)
      //   total_profit_loss    (NOT total_gain_loss)
      const storedValue = s.total_current_value;
      const assetSum = (s.asset_snapshots ?? [])
        .reduce((sum, a) => sum + (a.current_value || 0), 0);

      const totalValue = (storedValue != null && isFinite(storedValue) && storedValue > 0)
        ? storedValue
        : assetSum;

      const totalInvested = s.total_invested || 0;
      const gainLoss = (s.total_profit_loss != null && isFinite(s.total_profit_loss))
        ? s.total_profit_loss
        : totalValue - totalInvested;

      return { date: s.snapshot_date, totalValue, totalInvested, gainLoss };
    })
    .filter((s) => isFinite(s.totalValue))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function computeMonthlyExpenses(
  expenses: RawExpense[],
  categoryMap: Record<number, string>,
): MonthlyExpense[] {
  const byMonth: Record<string, MonthlyExpense> = {};

  for (const e of expenses) {
    if (e.is_amortized_entry) continue;
    if (e.classification !== 'expense') continue;
    const month = (e.transaction_date ?? '').slice(0, 7);
    if (!month) continue;
    if (!byMonth[month]) byMonth[month] = { month, total: 0, categories: {} };
    byMonth[month].total += e.amount;
    const cat = e.category_id ? (categoryMap[e.category_id] ?? 'Other') : 'Other';
    byMonth[month].categories[cat] = (byMonth[month].categories[cat] ?? 0) + e.amount;
  }

  return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
}

export function computeIncomeVsExpense(
  expenses: RawExpense[],
  incomes: RawIncome[],
): IncomeVsExpense[] {
  const data: Record<string, IncomeVsExpense> = {};

  for (const e of expenses) {
    if (e.is_amortized_entry) continue;
    if (e.classification !== 'expense') continue;
    const month = (e.transaction_date ?? '').slice(0, 7);
    if (!month) continue;
    if (!data[month]) data[month] = { month, income: 0, expense: 0 };
    data[month].expense += e.amount;
  }
  for (const i of incomes) {
    const month = dayjs(i.income_date).format('YYYY-MM');
    if (!data[month]) data[month] = { month, income: 0, expense: 0 };
    data[month].income += i.amount;
  }

  return Object.values(data)
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12);
}

export function topHoldings(assets: RawAsset[], limit = 5): RawAsset[] {
  return [...assets]
    .filter((a) => a.is_active)
    .sort((a, b) => (b.current_value ?? 0) - (a.current_value ?? 0))
    .slice(0, limit);
}

export function topGainers(assets: RawAsset[], limit = 5): RawAsset[] {
  return [...assets]
    .filter((a) => a.is_active && a.profit_loss_percentage != null)
    .sort((a, b) => (b.profit_loss_percentage ?? 0) - (a.profit_loss_percentage ?? 0))
    .slice(0, limit);
}

export function topLosers(assets: RawAsset[], limit = 5): RawAsset[] {
  return [...assets]
    .filter((a) => a.is_active && a.profit_loss_percentage != null)
    .sort((a, b) => (a.profit_loss_percentage ?? 0) - (b.profit_loss_percentage ?? 0))
    .slice(0, limit);
}
