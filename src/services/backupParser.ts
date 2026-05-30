import { BackupFile, RawAsset } from '@models/backup';
import { Asset } from '@models/portfolio';

const SUPPORTED_VERSIONS = new Set([
  '1.0','2.0','3.0','4.0','5.0','6.0','7.0','8.0','9.0','10.0','11.0',
]);

export class BackupParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupParseError';
  }
}

export function parseBackupJson(raw: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BackupParseError('Invalid JSON — file could not be parsed.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new BackupParseError('Backup file has unexpected format.');
  }

  const data = parsed as Record<string, unknown>;

  if (!data.export_version || !SUPPORTED_VERSIONS.has(data.export_version as string)) {
    throw new BackupParseError(
      `Unsupported backup version: ${data.export_version ?? 'unknown'}. Please export a fresh backup from PortAct.`,
    );
  }

  return data as unknown as BackupFile;
}

export function normaliseAsset(
  raw: RawAsset,
  typeDisplayMap: Record<string, string>,
  categoryMap: Record<string, string>,
): Asset {
  const currentValue = raw.current_value ?? 0;
  const totalInvested = raw.total_invested ?? 0;
  const profitLoss = raw.profit_loss ?? currentValue - totalInvested;
  const profitLossPercent =
    raw.profit_loss_percentage ??
    (totalInvested > 0 ? (profitLoss / totalInvested) * 100 : 0);

  return {
    id: raw.id,
    portfolioId: raw.portfolio_id,
    dematAccountId: raw.demat_account_id,
    assetType: raw.asset_type,
    assetTypeDisplayName: typeDisplayMap[raw.asset_type] ?? raw.asset_type,
    category: categoryMap[raw.asset_type] ?? 'other',
    name: raw.name,
    symbol: raw.symbol,
    apiSymbol: raw.api_symbol,
    isin: raw.isin,
    quantity: raw.quantity,
    avgBuyPrice: raw.average_buy_price,
    currentPrice: raw.current_price,
    previousClose: typeof raw.details?.previous_close === 'number' ? raw.details.previous_close : null,
    dayChangePct: typeof raw.details?.day_change_pct === 'number' ? raw.details.day_change_pct : undefined,
    currentValue,
    totalInvested,
    profitLoss,
    profitLossPercent,
    xirr: raw.xirr,
    currency: raw.currency ?? 'INR',
    brokerName: raw.broker_name,
    accountHolderName: raw.account_holder_name,
    isActive: raw.is_active,
    details: raw.details ?? {},
    lastPriceUpdate: raw.last_price_update,
  };
}

export function buildTypeDisplayMap(backup: BackupFile): Record<string, string> {
  const map: Record<string, string> = {};
  for (const t of backup.master_asset_types ?? []) {
    map[t.name] = t.display_name;
  }
  return map;
}

export function buildTypeCategoryMap(backup: BackupFile): Record<string, string> {
  const map: Record<string, string> = {};
  for (const t of backup.master_asset_types ?? []) {
    map[t.name] = t.category;
  }
  return map;
}
