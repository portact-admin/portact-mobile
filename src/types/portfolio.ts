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
