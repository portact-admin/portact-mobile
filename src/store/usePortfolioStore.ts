import { create } from 'zustand';
import { BackupFile, RawMFRating, RawStockRating } from '@models/backup';
import { Asset, Portfolio, AssetAllocation, PortfolioSnapshot, PortfolioSummary, AssetFilter, DailyBaseline, MfNavPoint } from '@models/portfolio';
import {
  parseBackupJson,
  normaliseAsset,
  buildTypeDisplayMap,
  buildTypeCategoryMap,
  stripAssetSnapshots,
  BackupParseError,
} from '@services/backupParser';
import { storage, BackupMeta } from '@services/storage';
import { refreshPrices, countRefreshable, LivePrice, MF_TYPES } from '@services/priceService';
import {
  computePortfolioSummary,
  computeAllocations,
  computeSnapshots,
} from '@utils/calculations';

type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface PortfolioStore {
  // state
  status: LoadStatus;
  error: string | null;
  backup: BackupFile | null;
  backupMeta: BackupMeta | null;

  // derived (computed once on load)
  portfolios: Portfolio[];
  assets: Asset[];
  allocations: AssetAllocation[];
  snapshots: PortfolioSnapshot[];
  summary: PortfolioSummary | null;
  typeDisplayMap: Record<string, string>;

  // MF ratings — indexed by asset id (primary) and fund name (fallback)
  mfRatingsByAssetId: MFRatingLookup;
  // Stock ratings — indexed by asset id (primary) and ticker symbol (fallback)
  stockRatingsByAssetId: StockRatingLookup;

  // live price overlay (applied on top of backup prices)
  livePrices: Map<number, LivePrice>;
  lastPriceRefresh: Date | null;
  priceRefreshing: boolean;

  // persisted per-ISIN MF NAV history — the only source of MF day change,
  // since AMFI publishes the current NAV alone (no previous close)
  mfNavHistory: Map<string, MfNavPoint>;

  // daily-change tracking: baseline = previous-close net worth for the IST day
  dailyBaseline: DailyBaseline | null;
  // IST date the morning (6 AM) auto-refresh has already run for, so it fires once a day
  lastDailyRefreshDate: string | null;

  // ui state
  filter: AssetFilter;
  selectedPortfolioId: number | null;

  // actions
  loadFromString(json: string, meta: BackupMeta): Promise<void>;
  loadFromStorage(): Promise<void>;
  refreshLivePrices(): Promise<{ refreshed: number; total: number }>;
  /** Foreground-gated daily refresh: runs once per IST day, only at/after 6 AM IST. */
  maybeRunDailyRefresh(): void;
  setSelectedPortfolio(id: number | null): void;
  setFilter(patch: Partial<AssetFilter>): void;
  clearData(): Promise<void>;
}

function normaliseFundName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

// MF NAV history is persisted as a JSON object but used as a Map at runtime.
function recordToMap(rec: Record<string, MfNavPoint>): Map<string, MfNavPoint> {
  return new Map(Object.entries(rec));
}
function mapToRecord(map: Map<string, MfNavPoint>): Record<string, MfNavPoint> {
  return Object.fromEntries(map);
}

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

/** Current date (YYYY-MM-DD) and hour in India Standard Time (UTC+5:30). */
function istNow(d = new Date()): { date: string; hour: number } {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return { date: ist.toISOString().slice(0, 10), hour: ist.getUTCHours() };
}

/**
 * Net worth derived from each asset's previous market close.
 * prevClose is reconstructed from the live price and its day-change %; assets
 * with no intraday day-change (MFs, physical metals, unrefreshed) contribute
 * their current value unchanged, so they add nothing to the daily change.
 */
function computePrevCloseNetWorth(
  assets: Asset[],
  updates: Map<number, LivePrice>,
  cash: number,
): number {
  const assetsTotal = assets.reduce((sum, a) => {
    const live = updates.get(a.id);
    if (live != null && a.quantity != null) {
      // MFs publish a single NAV per day (not intraday), so their day-change
      // reflects the *previous* settled session, not movement against this frozen
      // daily baseline. Reconstructing prevClose from it would mis-attribute that
      // move to today, so MFs use their live price as the baseline (net 0 daily
      // change), matching liveTotal — the behaviour before MF day-change existed.
      const pct = MF_TYPES.has(a.assetType) ? undefined : live.dayChangePct;
      const prevPrice = pct != null && isFinite(pct) && pct > -100
        ? live.price / (1 + pct / 100)
        : live.price;
      return sum + prevPrice * a.quantity;
    }
    return sum + a.currentValue;
  }, 0);
  return assetsTotal + cash;
}

export interface MFRatingLookup {
  byAssetId: Map<number, RawMFRating>;
  byFundName: Map<string, RawMFRating>;
}

function buildMFRatingsMap(backup: BackupFile): MFRatingLookup {
  const byAssetId = new Map<number, RawMFRating>();
  const byFundName = new Map<string, RawMFRating>();
  for (const r of backup.mf_ratings ?? []) {
    byAssetId.set(r.asset_id, r);
    if (r.fund_name) byFundName.set(normaliseFundName(r.fund_name), r);
  }
  return { byAssetId, byFundName };
}

export function lookupMFRating(
  assetId: number,
  assetName: string,
  lookup: MFRatingLookup,
): RawMFRating | undefined {
  return lookup.byAssetId.get(assetId)
    ?? lookup.byFundName.get(normaliseFundName(assetName));
}

export interface StockRatingLookup {
  byAssetId: Map<number, RawStockRating>;
  byTicker: Map<string, RawStockRating>;
}

function buildStockRatingsMap(backup: BackupFile): StockRatingLookup {
  const byAssetId = new Map<number, RawStockRating>();
  const byTicker = new Map<string, RawStockRating>();
  for (const r of backup.stock_ratings ?? []) {
    byAssetId.set(r.asset_id, r);
    if (r.ticker) byTicker.set(r.ticker.toLowerCase(), r);
  }
  return { byAssetId, byTicker };
}

export function lookupStockRating(
  assetId: number,
  ticker: string | null | undefined,
  lookup: StockRatingLookup,
): RawStockRating | undefined {
  return lookup.byAssetId.get(assetId)
    ?? (ticker ? lookup.byTicker.get(ticker.toLowerCase()) : undefined);
}

function deriveState(backup: BackupFile): Pick<
  PortfolioStore,
  'portfolios' | 'assets' | 'allocations' | 'snapshots' | 'summary' | 'typeDisplayMap'
> {
  const typeDisplayMap = buildTypeDisplayMap(backup);
  const categoryMap = buildTypeCategoryMap(backup);

  const portfolios: Portfolio[] = (backup.portfolios ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    isDefault: p.is_default,
    currency: p.currency ?? 'INR',
  }));

  const assets: Asset[] = (backup.assets ?? [])
    .filter((a) => a.is_active)
    .map((a) => normaliseAsset(a, typeDisplayMap, categoryMap));

  const bankBalance = (backup.bank_accounts ?? [])
    .filter((b) => b.is_active)
    .reduce((s, b) => s + (b.current_balance ?? 0), 0);
  const dematCash = (backup.demat_accounts ?? []).reduce((s, d) => s + (d.cash_balance ?? 0), 0);
  const cryptoCash = (backup.crypto_accounts ?? []).reduce((s, c) => s + (c.cash_balance ?? 0), 0);

  const summary = computePortfolioSummary(backup.assets ?? [], bankBalance, dematCash, cryptoCash);
  const allocations = computeAllocations(backup.assets ?? [], typeDisplayMap);
  const baseSnapshots = computeSnapshots(backup.portfolio_snapshots ?? []);

  // Always end the chart at today's computed value so it matches the Net Worth card exactly.
  const today = new Date().toISOString().slice(0, 10);
  const todayPoint = {
    date: today,
    totalValue: summary.totalValue,
    totalInvested: summary.totalInvested,
    gainLoss: summary.totalGainLoss,
  };
  const lastDate = baseSnapshots[baseSnapshots.length - 1]?.date ?? '';
  const snapshots = lastDate === today
    ? [...baseSnapshots.slice(0, -1), todayPoint]
    : [...baseSnapshots, todayPoint];

  return { portfolios, assets, allocations, snapshots, summary, typeDisplayMap };
}

export const usePortfolioStore = create<PortfolioStore>((set, get) => ({
  status: 'idle',
  error: null,
  backup: null,
  backupMeta: null,
  portfolios: [],
  assets: [],
  allocations: [],
  snapshots: [],
  summary: null,
  typeDisplayMap: {},
  mfRatingsByAssetId: { byAssetId: new Map(), byFundName: new Map() },
  stockRatingsByAssetId: { byAssetId: new Map(), byTicker: new Map() },
  livePrices: new Map(),
  lastPriceRefresh: null,
  priceRefreshing: false,
  mfNavHistory: new Map(),
  dailyBaseline: null,
  lastDailyRefreshDate: null,
  filter: {
    portfolioId: null,
    assetType: null,
    searchQuery: '',
    sortField: 'currentValue',
    sortDirection: 'desc',
  },
  selectedPortfolioId: null,

  async loadFromString(json, meta) {
    set({ status: 'loading', error: null });
    try {
      // Drop the unbounded asset_snapshots before parsing — a freshly downloaded
      // backup can carry hundreds of thousands of them, and parsing the full blob
      // is what froze/OOM'd the JS thread. We only use snapshot-level totals.
      const slim = stripAssetSnapshots(json).json;
      const backup = parseBackupJson(slim);
      await storage.saveBackup(slim, { ...meta, exportVersion: backup.export_version });
      const derived = deriveState(backup);
      const defaultPortfolio = derived.portfolios.find((p) => p.isDefault) ?? derived.portfolios[0] ?? null;
      // A fresh backup invalidates the day's baseline — drop it so the next
      // refresh recaptures the previous-close net worth from the new data.
      storage.clearDailyBaseline().catch(() => { /* silent */ });
      // MF NAV history is keyed by ISIN and outlives any single backup, so it's
      // preserved (not cleared) — that accumulated history is what makes MF day
      // change accurate. Load it in case this is the first load of the session.
      const mfNavHistory = recordToMap(await storage.loadMfNavHistory());
      set({
        status: 'loaded',
        backup,
        backupMeta: meta,
        ...derived,
        mfRatingsByAssetId: buildMFRatingsMap(backup),
        stockRatingsByAssetId: buildStockRatingsMap(backup),
        selectedPortfolioId: defaultPortfolio?.id ?? null,
        dailyBaseline: null,
        mfNavHistory,
      });

      // Recompute live prices (and the baseline) for the new backup in the
      // background so Daily Change reflects the imported data without a manual pull.
      get().refreshLivePrices().catch(() => { /* silent */ });
    } catch (err) {
      const msg = err instanceof BackupParseError ? err.message : 'Failed to load backup.';
      set({ status: 'error', error: msg });
      throw err;
    }
  },

  async loadFromStorage() {
    set({ status: 'loading', error: null });
    try {
      const [json, meta] = await Promise.all([
        storage.loadBackupJson(),
        storage.loadBackupMeta(),
      ]);
      if (!json) {
        set({ status: 'idle' });
        return;
      }
      const backup = parseBackupJson(json);
      const derived = deriveState(backup);
      const defaultPortfolio = derived.portfolios.find((p) => p.isDefault) ?? derived.portfolios[0] ?? null;
      const [storedBaseline, storedMfNav] = await Promise.all([
        storage.loadDailyBaseline(),
        storage.loadMfNavHistory(),
      ]);
      // A baseline only applies to the IST day it was captured on.
      const { date: todayIst, hour: istHour } = istNow();
      const dailyBaseline = storedBaseline && storedBaseline.date === todayIst ? storedBaseline : null;
      set({
        status: 'loaded',
        backup,
        backupMeta: meta,
        ...derived,
        mfRatingsByAssetId: buildMFRatingsMap(backup),
        stockRatingsByAssetId: buildStockRatingsMap(backup),
        selectedPortfolioId: defaultPortfolio?.id ?? null,
        dailyBaseline,
        mfNavHistory: recordToMap(storedMfNav),
        // This load-time refresh counts as today's morning refresh once past 6 AM,
        // so the foreground trigger doesn't fire a redundant one right after.
        lastDailyRefreshDate: istHour >= 6 ? todayIst : null,
      });

      // Auto-refresh prices in the background — don't await so the UI is
      // never blocked. The store will update summary + livePrices when done.
      get().refreshLivePrices().catch(() => { /* silent */ });
    } catch (err) {
      const msg = err instanceof BackupParseError ? err.message : 'Failed to restore saved data.';
      set({ status: 'error', error: msg });
    }
  },

  async refreshLivePrices() {
    const { assets, priceRefreshing, summary, mfNavHistory } = get();
    const total = countRefreshable(assets);
    if (priceRefreshing || assets.length === 0) return { refreshed: 0, total };
    set({ priceRefreshing: true });
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('price refresh timeout')), 30_000),
      );
      // Work on a copy so refreshPrices' in-place updates don't mutate live state.
      const workingMfNav = new Map(mfNavHistory);
      const updates = await Promise.race([refreshPrices(assets, workingMfNav), timeout]);
      // refreshPrices folded each fund's new NAV into workingMfNav — persist it so
      // MF day change survives restarts (AMFI never returns a previous close).
      storage.saveMfNavHistory(mapToRecord(workingMfNav)).catch(() => { /* silent */ });
      if (updates.size > 0 && summary) {
        // Recompute totalValue using live prices so Net Worth reflects the refresh.
        // For each asset: use live price × quantity when available, else keep backup value.
        const liveAssetsTotal = assets.reduce((sum, a) => {
          const live = updates.get(a.id);
          const val = live != null && a.quantity != null
            ? live.price * a.quantity
            : a.currentValue;
          return sum + val;
        }, 0);
        const cash = summary.bankBalance + summary.dematCash + summary.cryptoCash;
        const liveTotal = liveAssetsTotal + cash;
        // Cash is value = invested → 0 gain. P&L only from asset investments (matches web app).
        const liveGainLoss = liveAssetsTotal - summary.totalInvested;
        const liveGainPct = summary.totalInvested > 0
          ? (liveGainLoss / summary.totalInvested) * 100
          : 0;

        // ── Daily Change (since previous market close) ──
        // Baseline = previous-close net worth, captured once per IST day. prevClose
        // is constant through a trading day, so keeping an existing same-day baseline
        // (and persisting it) gives a stable anchor across refreshes and restarts.
        const todayIst = istNow().date;
        const existingBaseline = get().dailyBaseline;
        const baseline: DailyBaseline = existingBaseline && existingBaseline.date === todayIst
          ? existingBaseline
          : { date: todayIst, netWorth: computePrevCloseNetWorth(assets, updates, cash) };
        if (baseline !== existingBaseline) {
          storage.saveDailyBaseline(baseline).catch(() => { /* silent */ });
        }
        const dailyChange = liveTotal - baseline.netWorth;
        const dailyChangePercent = baseline.netWorth > 0
          ? (dailyChange / baseline.netWorth) * 100
          : 0;

        set({
          livePrices: updates,
          lastPriceRefresh: new Date(),
          dailyBaseline: baseline,
          mfNavHistory: workingMfNav,
          summary: {
            ...summary,
            totalValue: liveTotal,
            totalGainLoss: liveGainLoss,
            gainLossPercent: liveGainPct,
            dailyChange,
            dailyChangePercent,
          },
        });
      }
      return { refreshed: updates.size, total };
    } catch {
      return { refreshed: 0, total };
    } finally {
      set({ priceRefreshing: false });
    }
  },

  maybeRunDailyRefresh() {
    const { status, priceRefreshing, lastDailyRefreshDate } = get();
    if (status !== 'loaded' || priceRefreshing) return;
    const { date, hour } = istNow();
    // Only the morning schedule: at/after 6 AM IST, once per day.
    if (hour < 6 || lastDailyRefreshDate === date) return;
    set({ lastDailyRefreshDate: date });
    get().refreshLivePrices().catch(() => { /* silent */ });
  },

  setSelectedPortfolio(id) {
    set({ selectedPortfolioId: id });
  },

  setFilter(patch) {
    set((s) => ({ filter: { ...s.filter, ...patch } }));
  },

  async clearData() {
    await storage.clearAll();
    set({
      status: 'idle',
      error: null,
      backup: null,
      backupMeta: null,
      portfolios: [],
      assets: [],
      allocations: [],
      snapshots: [],
      summary: null,
      typeDisplayMap: {},
      mfRatingsByAssetId: { byAssetId: new Map(), byFundName: new Map() },
      stockRatingsByAssetId: { byAssetId: new Map(), byTicker: new Map() },
      selectedPortfolioId: null,
      livePrices: new Map(),
      lastPriceRefresh: null,
      mfNavHistory: new Map(),
      dailyBaseline: null,
      lastDailyRefreshDate: null,
    });
  },
}));

/** Selector: assets filtered & sorted by current filter state */
export function useFilteredAssets(): Asset[] {
  const { assets, filter, selectedPortfolioId } = usePortfolioStore();
  let result = assets;

  const pid = filter.portfolioId ?? selectedPortfolioId;
  if (pid != null) result = result.filter((a) => a.portfolioId === pid);
  if (filter.assetType) result = result.filter((a) => a.assetType === filter.assetType);
  if (filter.searchQuery.trim()) {
    const q = filter.searchQuery.toLowerCase();
    result = result.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.symbol ?? '').toLowerCase().includes(q) ||
        (a.brokerName ?? '').toLowerCase().includes(q),
    );
  }

  const { sortField, sortDirection } = filter;
  result = [...result].sort((a, b) => {
    let av: number | string = 0;
    let bv: number | string = 0;
    switch (sortField) {
      case 'name': av = a.name; bv = b.name; break;
      case 'currentValue': av = a.currentValue; bv = b.currentValue; break;
      case 'profitLoss': av = a.profitLoss; bv = b.profitLoss; break;
      case 'profitLossPercent': av = a.profitLossPercent; bv = b.profitLossPercent; break;
      case 'xirr': av = a.xirr ?? 0; bv = b.xirr ?? 0; break;
    }
    if (typeof av === 'string') {
      return sortDirection === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
    }
    return sortDirection === 'asc' ? (av - (bv as number)) : ((bv as number) - av);
  });

  return result;
}
