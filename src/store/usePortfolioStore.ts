import { create } from 'zustand';
import { BackupFile, RawMFRating } from '@models/backup';
import { Asset, Portfolio, AssetAllocation, PortfolioSnapshot, PortfolioSummary, AssetFilter } from '@models/portfolio';
import {
  parseBackupJson,
  normaliseAsset,
  buildTypeDisplayMap,
  buildTypeCategoryMap,
  BackupParseError,
} from '@services/backupParser';
import { storage, BackupMeta } from '@services/storage';
import { refreshPrices, countRefreshable, LivePrice } from '@services/priceService';
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

  // MF ratings keyed by asset id
  mfRatingsByAssetId: Map<number, RawMFRating>;

  // live price overlay (applied on top of backup prices)
  livePrices: Map<number, LivePrice>;
  lastPriceRefresh: Date | null;
  priceRefreshing: boolean;

  // ui state
  filter: AssetFilter;
  selectedPortfolioId: number | null;

  // actions
  loadFromString(json: string, meta: BackupMeta): Promise<void>;
  loadFromStorage(): Promise<void>;
  refreshLivePrices(): Promise<{ refreshed: number; total: number }>;
  setSelectedPortfolio(id: number | null): void;
  setFilter(patch: Partial<AssetFilter>): void;
  clearData(): Promise<void>;
}

function buildMFRatingsMap(backup: BackupFile): Map<number, RawMFRating> {
  const map = new Map<number, RawMFRating>();
  for (const r of backup.mf_ratings ?? []) {
    map.set(r.asset_id, r);
  }
  return map;
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
  mfRatingsByAssetId: new Map(),
  livePrices: new Map(),
  lastPriceRefresh: null,
  priceRefreshing: false,
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
      const backup = parseBackupJson(json);
      await storage.saveBackup(json, { ...meta, exportVersion: backup.export_version });
      const derived = deriveState(backup);
      const defaultPortfolio = derived.portfolios.find((p) => p.isDefault) ?? derived.portfolios[0] ?? null;
      set({
        status: 'loaded',
        backup,
        backupMeta: meta,
        ...derived,
        mfRatingsByAssetId: buildMFRatingsMap(backup),
        selectedPortfolioId: defaultPortfolio?.id ?? null,
      });
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
      set({
        status: 'loaded',
        backup,
        backupMeta: meta,
        ...derived,
        mfRatingsByAssetId: buildMFRatingsMap(backup),
        selectedPortfolioId: defaultPortfolio?.id ?? null,
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
    const { assets, priceRefreshing, summary } = get();
    const total = countRefreshable(assets);
    if (priceRefreshing || assets.length === 0) return { refreshed: 0, total };
    set({ priceRefreshing: true });
    try {
      const updates = await refreshPrices(assets);
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
        const liveTotal = liveAssetsTotal + summary.bankBalance + summary.dematCash + summary.cryptoCash;
        const liveGainLoss = liveTotal - summary.totalInvested;
        const liveGainPct = summary.totalInvested > 0
          ? (liveGainLoss / summary.totalInvested) * 100
          : 0;

        set({
          livePrices: updates,
          lastPriceRefresh: new Date(),
          summary: {
            ...summary,
            totalValue: liveTotal,
            totalGainLoss: liveGainLoss,
            gainLossPercent: liveGainPct,
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
      mfRatingsByAssetId: new Map(),
      selectedPortfolioId: null,
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
