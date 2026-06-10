import { BackupFile, RawAsset } from '@models/backup';
import { Asset } from '@models/portfolio';

// Oldest major version the app can meaningfully parse. Bumping this is the only
// breaking change that should ever require an app update.
const MIN_SUPPORTED_MAJOR = 1;

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

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BackupParseError('Backup file has unexpected format.');
  }

  const data = parsed as Record<string, unknown>;

  // Validate version is a recognisable PortAct semver string (e.g. "13.0").
  const versionStr = data.export_version as string | undefined;
  const major = versionStr ? parseInt(versionStr.split('.')[0], 10) : NaN;
  if (!versionStr || isNaN(major) || major < MIN_SUPPORTED_MAJOR) {
    throw new BackupParseError(
      `Unrecognised backup format (version: ${versionStr ?? 'unknown'}). ` +
      'This file may not be a PortAct backup.',
    );
  }

  // Validate the two fields the app absolutely cannot function without.
  if (!Array.isArray(data.portfolios)) {
    throw new BackupParseError('Backup is missing portfolio data — the file may be corrupted.');
  }
  if (!Array.isArray(data.assets)) {
    throw new BackupParseError('Backup is missing asset data — the file may be corrupted.');
  }

  return data as unknown as BackupFile;
}

/**
 * Remove the `asset_snapshots` arrays from a backup JSON *string*, replacing each
 * with `[]`, without first building the whole object graph.
 *
 * Why this exists: the backend export writes one AssetSnapshot per holding **per
 * day, forever** (eod_snapshot_service), so portfolio_snapshots[].asset_snapshots
 * is the only unbounded term in the file. Left alone it eventually grows large
 * enough that the cold-start read + JSON.parse freezes / OOM-crashes the JS
 * thread, which leaves the native splash frozen on every launch until the user
 * clears app data. The app only ever uses snapshot-level totals
 * (total_current_value); asset_snapshots is a rarely-hit fallback in
 * computeSnapshots, so dropping it is behaviour-preserving.
 *
 * Operates on the raw string (not the parsed object) so it stays memory-light
 * enough to rescue a file that's already too big to JSON.parse. Scans for the
 * key, then walks to the matching `]` tracking bracket depth and string state so
 * brackets/quotes inside string values can't fool it.
 */
export function stripAssetSnapshots(raw: string): { json: string; changed: boolean } {
  const KEY = '"asset_snapshots"';
  const isWs = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

  const chunks: string[] = [];
  let cursor = 0;       // copied into output up to here
  let searchFrom = 0;
  let changed = false;

  for (;;) {
    const keyIdx = raw.indexOf(KEY, searchFrom);
    if (keyIdx === -1) break;

    // Expect  "asset_snapshots" <ws>? : <ws>? [   — otherwise it's not the array
    // we want (e.g. the literal string used as a value), so skip past it.
    let i = keyIdx + KEY.length;
    while (i < raw.length && isWs(raw[i])) i++;
    if (raw[i] !== ':') { searchFrom = keyIdx + KEY.length; continue; }
    i++;
    while (i < raw.length && isWs(raw[i])) i++;
    if (raw[i] !== '[') { searchFrom = keyIdx + KEY.length; continue; }

    const arrStart = i;
    let depth = 0;
    let inStr = false;
    let escaped = false;
    let j = arrStart;
    for (; j < raw.length; j++) {
      const ch = raw[j];
      if (inStr) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '[') depth++;
      else if (ch === ']') { depth--; if (depth === 0) { j++; break; } }
    }

    // Already `[]` (e.g. a file we slimmed before) — nothing to strip. Skip it
    // without marking `changed`, so re-reading a slim file is a true no-op and
    // doesn't trigger a redundant rewrite on every launch.
    if (j - arrStart === 2) { searchFrom = j; continue; }

    // Replace raw[arrStart, j) (the whole "[...]") with "[]".
    chunks.push(raw.slice(cursor, arrStart), '[]');
    cursor = j;
    changed = true;
    searchFrom = j;
  }

  if (!changed) return { json: raw, changed: false };
  chunks.push(raw.slice(cursor));
  return { json: chunks.join(''), changed: true };
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
  for (const t of backup.master_data?.asset_types ?? []) {
    map[t.name] = t.display_name;
  }
  return map;
}

export function buildTypeCategoryMap(backup: BackupFile): Record<string, string> {
  const map: Record<string, string> = {};
  for (const t of backup.master_data?.asset_types ?? []) {
    map[t.name] = t.category;
  }
  return map;
}
