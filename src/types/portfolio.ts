/** Derived / normalised domain types used across the app UI. */

export interface Portfolio {
  id: number;
  name: string;
  isDefault: boolean;
  currency: string;
}

export interface Asset {
  id: number;
  portfolioId: number | null;
  dematAccountId: number | null;
  assetType: string;
  assetTypeDisplayName: string;
  category: string;
  name: string;
  symbol: string | null;
  apiSymbol: string | null;
  isin: string | null;
  quantity: number | null;
  avgBuyPrice: number | null;
  currentPrice: number | null;
  previousClose: number | null;
  dayChangePct: number | undefined;
  currentValue: number;
  totalInvested: number;
  profitLoss: number;
  profitLossPercent: number;
  xirr: number | null;
  currency: string;
  brokerName: string | null;
  accountHolderName: string | null;
  isActive: boolean;
  details: Record<string, unknown>;
  lastPriceUpdate: string | null;
}

export interface DematAccount {
  id: number;
  portfolioId: number | null;
  brokerName: string;
  accountNumber: string | null;
  accountHolderName: string | null;
  cashBalance: number;
}

export interface BankAccount {
  id: number;
  portfolioId: number | null;
  bankName: string;
  accountHolderName: string | null;
  balance: number;
}

export interface CryptoAccount {
  id: number;
  portfolioId: number | null;
  exchangeName: string;
  cashBalance: number;
}

export interface PortfolioSnapshot {
  date: string;
  totalValue: number;
  totalInvested: number;
  gainLoss: number;
}

export interface AssetAllocation {
  assetType: string;
  displayName: string;
  currentValue: number;
  totalInvested: number;
  percentage: number;
  color: string;
}

export interface PortfolioSummary {
  totalValue: number;
  totalInvested: number;
  totalGainLoss: number;
  gainLossPercent: number;
  bankBalance: number;
  dematCash: number;
  cryptoCash: number;
  assetCount: number;
  /** Net worth change since the previous market close (₹). 0 until live prices are refreshed. */
  dailyChange: number;
  /** dailyChange as a % of the day's baseline net worth. */
  dailyChangePercent: number;
}

/**
 * Snapshot of the day's baseline net worth — the value derived from each asset's
 * previous market close. Captured once per IST day and overwritten when a new
 * backup for that day is loaded. "Daily Change" is measured against this.
 */
export interface DailyBaseline {
  date: string;     // YYYY-MM-DD in IST
  netWorth: number; // previous-close net worth for the day (₹)
}

/**
 * Persisted NAV observation for one mutual fund (keyed by ISIN).
 * AMFI only ever publishes the current NAV, so to derive a day change we
 * remember the latest NAV we saw and the one before it (the "previous close").
 * `curDate` / `prevDate` are AMFI's own NAV dates (YYYY-MM-DD) — the previous
 * NAV is promoted to "current" only when AMFI publishes a newer NAV date.
 */
export interface MfNavPoint {
  curNav: number;
  curDate: string;
  prevNav: number | null;
  prevDate: string | null;
}

export interface MonthlyExpense {
  month: string;
  total: number;
  categories: Record<string, number>;
}

export interface IncomeVsExpense {
  month: string;
  income: number;
  expense: number;
}

export interface FFSummary {
  currentAge: number | null;
  retirementAge: number | null;
  fireNumber: number | null;
  monthlyExpenses: number | null;
  yearsToFire: number | null;
}

export type SortField = 'name' | 'currentValue' | 'profitLoss' | 'profitLossPercent' | 'xirr';
export type SortDirection = 'asc' | 'desc';

export interface AssetFilter {
  portfolioId: number | null;
  assetType: string | null;
  searchQuery: string;
  sortField: SortField;
  sortDirection: SortDirection;
}
