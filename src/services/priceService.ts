/**
 * Price refresh service — mirrors PortAct's price_updater.py logic.
 * Key sources of truth:
 *   NSE stocks/ETFs   → Yahoo Finance chart API  (.NS suffix)
 *   Indian MFs        → AMFI NAVAll.txt          (ISIN lookup)
 *   US stocks/ETFs    → Yahoo Finance chart API  (raw ticker, USD → INR)
 *   Crypto            → CoinGecko simple/price   (details.coin_id, INR direct)
 *   Physical gold/silver → Yahoo futures GC=F / SI=F (USD → INR per gram)
 */
import { Asset } from '@models/portfolio';

export interface LivePrice {
  price: number;          // always in INR
  dayChangePct: number | undefined;
  fetchedAt: string;
}

const YF_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

// ─── Symbol normalisation (matches PortAct's _strip_nse_series / _normalize_nse_symbol) ─────

/** Strip broker series suffixes: JIOFIN-BL → JIOFIN, ITC-EQ → ITC */
function stripNseSeries(sym: string): string {
  return sym.replace(/-[A-Z]{1,3}$/i, '');
}

/** Normalise to Yahoo Finance NSE format (.NS suffix). */
function normalizeNseSymbol(sym: string): string {
  if (!sym) return sym;
  const up = sym.toUpperCase();
  if (up.endsWith('.BSE')) return stripNseSeries(sym.slice(0, -4)) + '.NS';
  if (up.endsWith('.NS') || up.endsWith('.BO')) return sym;
  return stripNseSeries(sym) + '.NS';
}

// ─── USD / INR rate ────────────────────────────────────────────────────────────

let _usdInrCache: { rate: number; time: number } | null = null;

async function getUsdToInr(): Promise<number> {
  if (_usdInrCache && Date.now() - _usdInrCache.time < 10 * 60_000) {
    return _usdInrCache.rate;
  }
  try {
    const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/USDINR=X', { headers: YF_HEADERS });
    if (res.ok) {
      const json = await res.json() as Record<string, unknown>;
      const meta = ((json?.chart as any)?.result?.[0]?.meta) as Record<string, unknown> | undefined;
      const rate = meta?.regularMarketPrice as number | undefined;
      if (rate && rate > 0) {
        _usdInrCache = { rate, time: Date.now() };
        return rate;
      }
    }
  } catch { /* silent */ }
  return _usdInrCache?.rate ?? 84;
}

// ─── Yahoo Finance — single chart call ────────────────────────────────────────

async function fetchYahooChart(symbol: string): Promise<{ price: number; prevClose: number | null } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
    const res = await fetch(url, { headers: YF_HEADERS });
    if (!res.ok) return null;
    const json = await res.json() as Record<string, unknown>;
    const meta = ((json?.chart as any)?.result?.[0]?.meta) as Record<string, unknown> | undefined;
    if (!meta) return null;
    const price = meta.regularMarketPrice as number | undefined;
    if (!price || price <= 0) return null;
    const prev = (meta.chartPreviousClose ?? meta.previousClose) as number | undefined;
    return { price, prevClose: prev && prev > 0 ? prev : null };
  } catch {
    return null;
  }
}

// ─── Yahoo Finance — spark batch (matches PortAct's _batch_fetch_yahoo_spark_prices) ─────
// Fetches up to 20 symbols per call, 5-day history; derives price + previousClose.

async function fetchYahooSparkBatch(
  symbols: string[],
): Promise<Map<string, { price: number; prevClose: number | null }>> {
  const result = new Map<string, { price: number; prevClose: number | null }>();
  if (!symbols.length) return result;

  const CHUNK = 20;
  for (let i = 0; i < symbols.length; i += CHUNK) {
    const chunk = symbols.slice(i, i + CHUNK);
    try {
      const symsStr = chunk.join(',');
      const url = `https://query2.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(symsStr)}&range=5d&interval=1d`;
      const res = await fetch(url, { headers: YF_HEADERS });
      if (!res.ok) continue;
      const json = await res.json() as Record<string, unknown>;
      for (const [sym, info] of Object.entries(json)) {
        if (!info || typeof info !== 'object') continue;
        const closes: (number | null)[] = (info as any).close ?? [];
        const valid = closes.filter((c): c is number => c != null && c > 0);
        if (!valid.length) continue;
        result.set(sym, {
          price: valid[valid.length - 1],
          prevClose: valid.length >= 2 ? valid[valid.length - 2] : null,
        });
      }
    } catch { /* continue to next chunk */ }

    if (i + CHUNK < symbols.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return result;
}

// ─── AMFI (Mutual Funds) — singleton fetch, ISIN lookup ───────────────────────

let _amfiCache: Map<string, number> | null = null;
let _amfiCacheTime = 0;
let _amfiFetchPromise: Promise<Map<string, number>> | null = null;
const AMFI_TTL = 4 * 60 * 60_000;

// ETF symbol → display-name mapping (matches PortAct's name_mappings)
const ETF_NAME_MAP: Record<string, string> = {
  GOLDBEES: 'GOLD BEES',
  SILVERBEES: 'SILVER BEES',
  NIFTYBEES: 'NIFTY BEES',
  BANKBEES: 'BANK BEES',
  JUNIORBEES: 'JUNIOR BEES',
};

async function loadAmfi(): Promise<Map<string, number>> {
  const res = await fetch('https://www.amfiindia.com/spages/NAVAll.txt');
  if (!res.ok) throw new Error('AMFI fetch failed');
  const text = await res.text();
  const map = new Map<string, number>();
  for (const line of text.split('\n')) {
    const parts = line.split(';');
    if (parts.length < 5) continue;
    const isin1 = parts[1]?.trim();
    const isin2 = parts[2]?.trim();
    const nav = parseFloat(parts[4]?.trim() ?? '');
    if (!isNaN(nav) && nav > 0) {
      if (isin1 && isin1 !== '-' && isin1 !== 'N.A.') map.set(isin1, nav);
      if (isin2 && isin2 !== '-' && isin2 !== 'N.A.') map.set(isin2, nav);
    }
  }
  return map;
}

// Singleton: no matter how many MF requests run in parallel, exactly ONE fetch goes to AMFI.
async function getAmfiCache(): Promise<Map<string, number>> {
  if (_amfiCache && Date.now() - _amfiCacheTime < AMFI_TTL) return _amfiCache;
  if (!_amfiFetchPromise) {
    _amfiFetchPromise = loadAmfi()
      .then((map) => { _amfiCache = map; _amfiCacheTime = Date.now(); return map; })
      .catch(() => _amfiCache ?? new Map())
      .finally(() => { _amfiFetchPromise = null; });
  }
  return _amfiFetchPromise;
}

async function fetchMfNav(isin: string): Promise<number | null> {
  const cache = await getAmfiCache();
  const nav = cache.get(isin);
  return nav ?? null;
}

// ─── Physical gold / silver via Yahoo futures ──────────────────────────────────

let _metalCache: { gold: number | null; silver: number | null; time: number } | null = null;

async function getMetalPricesInrPerGram(): Promise<{ gold: number | null; silver: number | null }> {
  if (_metalCache && Date.now() - _metalCache.time < 5 * 60_000) {
    return { gold: _metalCache.gold, silver: _metalCache.silver };
  }
  const [usdToInr, goldRes, silverRes] = await Promise.all([
    getUsdToInr(),
    fetchYahooChart('GC=F'),   // Gold futures USD/troy oz
    fetchYahooChart('SI=F'),   // Silver futures USD/troy oz
  ]);
  const TROY_OZ_TO_GRAM = 31.1035;
  const gold = goldRes ? (goldRes.price * usdToInr) / TROY_OZ_TO_GRAM : null;
  const silver = silverRes ? (silverRes.price * usdToInr) / TROY_OZ_TO_GRAM : null;
  _metalCache = { gold, silver, time: Date.now() };
  return { gold, silver };
}

// ─── CoinGecko (Crypto) ────────────────────────────────────────────────────────

async function fetchCoinGeckoBatch(
  coinIds: string[],
): Promise<Map<string, { priceInr: number; change24h: number | undefined }>> {
  const result = new Map<string, { priceInr: number; change24h: number | undefined }>();
  if (!coinIds.length) return result;
  try {
    const ids = coinIds.join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=inr&include_24hr_change=true`;
    const res = await fetch(url);
    if (!res.ok) return result;
    const json = await res.json() as Record<string, Record<string, number>>;
    for (const [id, data] of Object.entries(json)) {
      if (data.inr > 0) {
        result.set(id, { priceInr: data.inr, change24h: data.inr_24h_change ?? undefined });
      }
    }
  } catch { /* silent */ }
  return result;
}

// ─── Asset-type classification helpers ────────────────────────────────────────

const MF_TYPES = new Set(['equity_mutual_fund', 'hybrid_mutual_fund', 'debt_mutual_fund']);
const NSE_STOCK_TYPES = new Set(['stock', 'esop', 'rsu', 'reit', 'invit']);
const COMMODITY_TYPE = 'commodity';
const US_STOCK_TYPE = 'us_stock';
const CRYPTO_TYPE = 'crypto';
const PHYSICAL_GOLD_TYPE = 'physical_gold';
const PHYSICAL_SILVER_TYPE = 'physical_silver';

/** True when an asset is held via the Vested brokerage (US-listed). */
function isVested(asset: Asset): boolean {
  return asset.brokerName?.toLowerCase() === 'vested';
}

/** True when a commodity ETF has an Indian ISIN (INF/INE prefix → NSE-listed). */
function hasIndianIsin(asset: Asset): boolean {
  return !!(asset.isin && (asset.isin.startsWith('INF') || asset.isin.startsWith('INE')));
}

/** Resolve the best lookup symbol: api_symbol → strip series → raw symbol. */
function resolveSymbol(asset: Asset): string | null {
  return asset.apiSymbol ?? asset.symbol ?? null;
}

// ─── countRefreshable ─────────────────────────────────────────────────────────

export function countRefreshable(assets: Asset[]): number {
  return assets.filter((a) => {
    if (MF_TYPES.has(a.assetType)) return !!a.isin;
    if (NSE_STOCK_TYPES.has(a.assetType)) return !!resolveSymbol(a);
    if (a.assetType === US_STOCK_TYPE) return !!resolveSymbol(a);
    if (a.assetType === COMMODITY_TYPE) return !!resolveSymbol(a);
    if (a.assetType === CRYPTO_TYPE) {
      return !!(a.details?.coin_id || a.symbol);
    }
    if (a.assetType === PHYSICAL_GOLD_TYPE || a.assetType === PHYSICAL_SILVER_TYPE) {
      // Only refreshable if weight metadata exists
      return !!(a.details?.weight_per_unit);
    }
    return false;
  }).length;
}

// ─── Main refresh ─────────────────────────────────────────────────────────────

export async function refreshPrices(assets: Asset[]): Promise<Map<number, LivePrice>> {
  const updates = new Map<number, LivePrice>();
  const now = new Date().toISOString();

  const mfAssets        = assets.filter((a) => MF_TYPES.has(a.assetType) && !!a.isin);
  const nseStockAssets  = assets.filter((a) => NSE_STOCK_TYPES.has(a.assetType) && !!resolveSymbol(a));
  const usStockAssets   = assets.filter((a) => a.assetType === US_STOCK_TYPE && !!resolveSymbol(a));
  const cryptoAssets    = assets.filter((a) => a.assetType === CRYPTO_TYPE);
  const commodityAssets = assets.filter((a) => a.assetType === COMMODITY_TYPE && !!resolveSymbol(a));
  const physGoldAssets  = assets.filter((a) => a.assetType === PHYSICAL_GOLD_TYPE && !!(a.details?.weight_per_unit));
  const physSilvAssets  = assets.filter((a) => a.assetType === PHYSICAL_SILVER_TYPE && !!(a.details?.weight_per_unit));

  // ── Phase 1: parallel warm-up ─────────────────────────────────────────────
  // Kick off AMFI fetch + USD/INR rate + metal prices simultaneously.
  // These are shared resources; running them in parallel cuts wall time.
  const [usdToInr, metalPrices] = await Promise.all([
    getUsdToInr(),
    (physGoldAssets.length || physSilvAssets.length) ? getMetalPricesInrPerGram() : Promise.resolve({ gold: null, silver: null }),
    getAmfiCache(), // warm the singleton so MF lookups are instant
  ]);

  // ── Phase 2: batch fetch NSE + US via Yahoo spark ─────────────────────────
  // Build NSE symbol list: stocks + NSE commodity ETFs (have Indian ISIN)
  const nseSymbolMap = new Map<string, number[]>(); // nseSym → [assetId, ...]
  for (const a of [...nseStockAssets, ...commodityAssets.filter(hasIndianIsin)]) {
    const raw = resolveSymbol(a)!;
    const nseSym = normalizeNseSymbol(raw);
    if (!nseSymbolMap.has(nseSym)) nseSymbolMap.set(nseSym, []);
    nseSymbolMap.get(nseSym)!.push(a.id);
  }

  // US symbol list: US stocks + Vested commodities (no Indian ISIN)
  const usSymbolMap = new Map<string, number[]>();
  for (const a of [...usStockAssets, ...commodityAssets.filter((a) => !hasIndianIsin(a))]) {
    const sym = resolveSymbol(a)!;
    if (!usSymbolMap.has(sym)) usSymbolMap.set(sym, []);
    usSymbolMap.get(sym)!.push(a.id);
  }

  // Crypto coin IDs
  const cryptoCoinMap = new Map<string, number[]>();
  for (const a of cryptoAssets) {
    const coinId = (a.details?.coin_id as string | undefined) ?? a.symbol?.toLowerCase();
    if (!coinId) continue;
    if (!cryptoCoinMap.has(coinId)) cryptoCoinMap.set(coinId, []);
    cryptoCoinMap.get(coinId)!.push(a.id);
  }

  // Run NSE batch, US batch, and CoinGecko batch in parallel
  const [nseSparkPrices, usSparkPrices, cryptoPrices] = await Promise.all([
    fetchYahooSparkBatch([...nseSymbolMap.keys()]),
    fetchYahooSparkBatch([...usSymbolMap.keys()]),
    fetchCoinGeckoBatch([...cryptoCoinMap.keys()]),
  ]);

  // ── Phase 3: Apply batch results ──────────────────────────────────────────

  // NSE assets (stocks + Indian commodity ETFs)
  for (const [nseSym, ids] of nseSymbolMap) {
    const hit = nseSparkPrices.get(nseSym);
    if (!hit) continue;
    const dayChangePct = hit.prevClose && hit.prevClose > 0
      ? ((hit.price - hit.prevClose) / hit.prevClose) * 100
      : undefined;
    for (const id of ids) updates.set(id, { price: hit.price, dayChangePct, fetchedAt: now });
  }

  // US assets (US stocks + Vested commodity ETFs) — convert USD → INR
  for (const [sym, ids] of usSymbolMap) {
    const hit = usSparkPrices.get(sym);
    if (!hit) continue;
    const priceInr = hit.price * usdToInr;
    const prevInr = hit.prevClose ? hit.prevClose * usdToInr : null;
    const dayChangePct = prevInr && prevInr > 0
      ? ((priceInr - prevInr) / prevInr) * 100
      : undefined;
    for (const id of ids) updates.set(id, { price: priceInr, dayChangePct, fetchedAt: now });
  }

  // Crypto (CoinGecko returns INR directly)
  for (const [coinId, ids] of cryptoCoinMap) {
    const hit = cryptoPrices.get(coinId);
    if (!hit) continue;
    for (const id of ids) {
      updates.set(id, { price: hit.priceInr, dayChangePct: hit.change24h, fetchedAt: now });
    }
  }

  // Physical gold / silver
  for (const a of physGoldAssets) {
    if (!metalPrices.gold) continue;
    const weightPerUnit = a.details?.weight_per_unit as number;
    const purityKarat = (a.details?.purity_karat as number) ?? 24;
    const price = weightPerUnit * (purityKarat / 24) * metalPrices.gold;
    updates.set(a.id, { price, dayChangePct: undefined, fetchedAt: now });
  }
  for (const a of physSilvAssets) {
    if (!metalPrices.silver) continue;
    const weightPerUnit = a.details?.weight_per_unit as number;
    const purityStd = (a.details?.purity_standard as number) ?? 999;
    const price = weightPerUnit * (purityStd / 1000) * metalPrices.silver;
    updates.set(a.id, { price, dayChangePct: undefined, fetchedAt: now });
  }

  // ── Phase 4: MF prices via AMFI (cache is warm; all lookups are in-memory) ─
  await Promise.all(mfAssets.map(async (a) => {
    if (updates.has(a.id)) return; // already got a price
    const nav = await fetchMfNav(a.isin!);
    if (nav) updates.set(a.id, { price: nav, dayChangePct: undefined, fetchedAt: now });
  }));

  // ── Phase 5: Individual chart-API fallback for batch misses ───────────────
  // Any asset that didn't get a price from spark gets one more chance via
  // the chart endpoint (handles stale spark data, newly listed symbols, etc.)
  const needsFallback = [
    ...nseStockAssets,
    ...commodityAssets.filter(hasIndianIsin),
    ...usStockAssets,
    ...commodityAssets.filter((a) => !hasIndianIsin(a)),
  ].filter((a) => !updates.has(a.id));

  // Sequential to stay under rate limits
  const FALLBACK_CHUNK = 5;
  for (let i = 0; i < needsFallback.length; i += FALLBACK_CHUNK) {
    await Promise.all(
      needsFallback.slice(i, i + FALLBACK_CHUNK).map(async (a) => {
        const raw = resolveSymbol(a)!;
        const isNse = NSE_STOCK_TYPES.has(a.assetType) || hasIndianIsin(a);
        const sym = isNse ? normalizeNseSymbol(raw) : raw;
        const hit = await fetchYahooChart(sym);
        if (!hit) return;

        let priceInr = hit.price;
        let prevInr = hit.prevClose;
        if (!isNse) {
          // US asset — convert USD → INR
          priceInr = hit.price * usdToInr;
          prevInr = hit.prevClose ? hit.prevClose * usdToInr : null;
        }
        const dayChangePct = prevInr && prevInr > 0
          ? ((priceInr - prevInr) / prevInr) * 100
          : undefined;
        updates.set(a.id, { price: priceInr, dayChangePct, fetchedAt: now });
      }),
    );
    if (i + FALLBACK_CHUNK < needsFallback.length) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  return updates;
}
