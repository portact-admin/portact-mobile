/**
 * Raw shape of the PortAct JSON backup.
 *
 * Only `export_version`, `portfolios`, and `assets` are required — those are
 * validated at parse time. Everything else is optional so the app keeps working
 * as PortAct adds new fields in future export versions without needing mobile
 * app updates.
 */
export interface BackupFile {
  export_version: string;
  exported_at?: string;
  user_profile?: UserProfile;
  portfolios: RawPortfolio[];
  bank_accounts?: RawBankAccount[];
  demat_accounts?: RawDematAccount[];
  crypto_accounts?: RawCryptoAccount[];
  assets: RawAsset[];
  transactions?: RawTransaction[];
  expenses?: RawExpense[];
  expense_categories?: RawExpenseCategory[];
  incomes?: RawIncome[];
  portfolio_snapshots?: RawPortfolioSnapshot[];
  mutual_fund_holdings?: RawMutualFundHolding[];
  macro_data_points?: RawMacroDataPoint[];
  mf_systematic_plans?: RawMFSystematicPlan[];
  mf_ratings?: RawMFRating[];
  statement_passwords?: RawStatementPassword[];
  ff_profile?: RawFFProfile | null;
  ff_income_sources?: RawFFIncomeSource[];
  ff_milestones?: RawFFMilestone[];
  ff_debts?: RawFFDebt[];
  ff_scenarios?: RawFFScenario[];
  fp_profile?: RawFPProfile | null;
  fp_goals?: RawFPGoal[];
  fp_plans?: RawFPPlan[];
  app_settings?: RawAppSetting[];
  master_data?: RawMasterData;
  ref_rates?: RawReferenceRate[];
  [key: string]: unknown;
}

export interface RawMasterData {
  asset_classes?: RawAssetClassMaster[];
  asset_categories?: RawAssetCategoryMaster[];
  asset_types?: RawAssetTypeMaster[];
  banks?: RawBankMaster[];
  brokers?: RawBrokerMaster[];
  crypto_exchanges?: RawCryptoExchangeMaster[];
  institutions?: RawInstitutionMaster[];
  [key: string]: unknown;
}

export interface UserProfile {
  full_name: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  city: string | null;
  state: string | null;
  is_employed: boolean | null;
  basic_salary: number | null;
  preferences: Record<string, unknown> | null;
}

export interface RawPortfolio {
  id: number;
  name: string;
  description: string | null;
  is_default: boolean;
  currency: string;
  created_at: string;
}

export interface RawBankAccount {
  id: number;
  portfolio_id: number | null;
  bank_name: string;
  account_number: string | null;
  account_holder_name: string | null;
  account_type: string | null;
  current_balance: number | null;
  is_active: boolean;
}

export interface RawDematAccount {
  id: number;
  portfolio_id: number | null;
  broker_name: string;
  account_number: string | null;
  account_holder_name: string | null;
  cash_balance: number | null;
  is_active: boolean;
}

export interface RawCryptoAccount {
  id: number;
  portfolio_id: number | null;
  exchange_name: string;
  account_label: string | null;
  cash_balance: number | null;
  is_active: boolean;
}

export interface RawAsset {
  id: number;
  portfolio_id: number | null;
  demat_account_id: number | null;
  asset_type: string;
  name: string;
  symbol: string | null;
  api_symbol: string | null;
  isin: string | null;
  quantity: number | null;
  average_buy_price: number | null;
  current_price: number | null;
  current_value: number | null;
  total_invested: number | null;
  profit_loss: number | null;
  profit_loss_percentage: number | null;
  xirr: number | null;
  currency: string;
  broker_name: string | null;
  account_holder_name: string | null;
  account_id: string | null;
  is_active: boolean;
  details: Record<string, unknown> | null;
  last_price_update: string | null;
  created_at: string;
}

export interface RawTransaction {
  id: number;
  asset_id: number;
  transaction_type: string;
  quantity: number | null;
  price: number | null;
  amount: number | null;
  transaction_date: string;
  notes: string | null;
}

export interface RawExpense {
  id: number;
  category_id: number | null;
  amount: number;
  description: string | null;
  merchant_name: string | null;
  transaction_date: string;
  payment_method: string | null;
  classification: string | null;
  is_amortized_entry: boolean;
}

export interface RawExpenseCategory {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
  is_system: boolean;
}

export interface RawIncome {
  id: number;
  source: string;
  amount: number;
  income_date: string;
  description: string | null;
  frequency: string | null;
}

export interface RawPortfolioSnapshot {
  id: number;
  snapshot_date: string;
  total_current_value: number;
  total_invested: number;
  total_profit_loss: number;
  total_profit_loss_percentage: number | null;
  total_assets_count: number | null;
  asset_snapshots: RawAssetSnapshot[];
}

export interface RawAssetSnapshot {
  asset_id: number | null;
  bank_account_id: number | null;
  demat_account_id: number | null;
  crypto_account_id: number | null;
  snapshot_source: string | null;
  asset_type: string | null;
  asset_name: string | null;
  asset_symbol: string | null;
  current_value: number;
  total_invested: number | null;
  profit_loss: number | null;
  profit_loss_percentage: number | null;
}

export interface RawMutualFundHolding {
  id: number;
  asset_id: number;
  scheme_name: string | null;
  nav: number | null;
  units: number | null;
  current_value: number | null;
}

export interface RawMFSystematicPlan {
  id: number;
  asset_id: number;
  plan_type: string;
  amount: number;
  frequency: string;
  start_date: string | null;
  is_active: boolean;
}

export interface RawMFRating {
  id: number;
  user_id: number;
  asset_id: number;
  fund_name: string | null;
  category: string | null;
  fund_house: string | null;
  rating: number | null;
  rating_breakdown: Record<string, unknown> | null;
  key_metrics: Record<string, unknown> | null;
  peer_comparison: Record<string, unknown> | null;
  best_in_class_name: string | null;
  best_in_class_reason: string | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  justification: string | null;
  investment_recommendation: string | null;
  suitable_for: string | null;
  ai_provider: string | null;
}

export interface RawStatementPassword {
  id: number;
  user_id: number;
  institution_key: string;
  password: string;
}

export interface RawFFProfile {
  current_age: number | null;
  retirement_age: number | null;
  monthly_expenses: number | null;
  expected_inflation: number | null;
  expected_return: number | null;
  fire_number: number | null;
}

export interface RawFFIncomeSource {
  id: number;
  name: string;
  monthly_amount: number;
  is_active: boolean;
}

export interface RawFFMilestone {
  id: number;
  name: string;
  target_amount: number;
  target_date: string | null;
}

export interface RawFFDebt {
  id: number;
  name: string;
  outstanding_amount: number;
  interest_rate: number | null;
}

export interface RawFFScenario {
  id: number;
  name: string;
  monthly_expenses: number;
  retirement_age: number;
}

export interface RawFPProfile {
  id: number;
  risk_profile: string | null;
  investment_horizon: number | null;
}

export interface RawFPGoal {
  id: number;
  name: string;
  goal_type?: string | null;
  target_amount: number;
  target_date: string | null;
  current_savings?: number | null;
  priority: string | null;
  status?: string | null;
  projected_value_at_target_date?: number | null;
  monthly_required?: number | null;
  is_active?: boolean;
}

export interface RawFPActionItem {
  id: number;
  plan_id: number;
  action_key: string;
  title: string;
  description: string | null;
  category: string;
  priority: number;
  estimated_impact: string | null;
  estimated_amount: number | null;
  target_date: string | null;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface RawFPPlan {
  id: number;
  version: number;
  ai_provider: string;
  ai_model: string | null;
  name: string | null;
  description: string | null;
  health_score: number | null;
  plan_json: Record<string, unknown>;
  is_active: boolean;
  accepted_at: string | null;
  generation_time_seconds: number | null;
  created_at: string;
  action_items: RawFPActionItem[];
}

export interface RawAppSetting {
  key: string;
  value: string | null;
  value_type: string;
}

export interface RawAssetClassMaster {
  name: string;
  display_label: string;
  color: string | null;
  default_return_pct: number | null;
  liquidation_priority: number | null;
  sort_order: number;
  is_active: boolean;
}

export interface RawAssetTypeMaster {
  name: string;
  display_name: string;
  category: string;
  is_active: boolean;
}

export interface RawAssetCategoryMaster {
  name: string;
  display_name: string;
  sort_order: number;
}

export interface RawBankMaster {
  name: string;
  display_name: string | null;
  is_active: boolean;
}

export interface RawBrokerMaster {
  name: string;
  display_name: string | null;
  is_active: boolean;
}

export interface RawCryptoExchangeMaster {
  name: string;
  display_name: string | null;
  is_active: boolean;
}

export interface RawInstitutionMaster {
  name: string;
  display_name: string | null;
  institution_type: string | null;
  is_active: boolean;
}

export interface RawReferenceRate {
  rate_type: string;
  rate_value: number;
  effective_date: string;
}

export interface RawMacroDataPoint {
  id: number;
  series: string;
  period: string;
  label: string;
  value: number;
}
