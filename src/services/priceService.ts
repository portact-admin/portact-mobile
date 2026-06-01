/**
 * Price refresh service — mirrors PortAct's price_updater.py logic.
 *
 * Sources (same priority as backend):
 *   NSE stocks/ETFs/REITs/InvITs → Yahoo Finance spark batch → chart API fallback
 *   Indian MFs                   → AMFI NAVAll.txt (ISIN lookup)
 *   US stocks / USD commodities  → Yahoo Finance spark batch → chart API fallback
 *   Crypto                       → CoinGecko simple/price (INR direct, batch)
 *   Physical gold / silver       → Yahoo futures GC=F / SI=F (USD → INR per gram)
 */
import { Asset } from '@models/portfolio';

export interface LivePrice {
  price: number;          // always in INR
  dayChangePct: number | undefined;
  fetchedAt: string;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

const YF_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

// Per-request timeout matching backend's timeout=5; AMFI gets 20 s (large file).
function fetchWithTimeout(url: string, options: RequestInit = {}, ms = 5_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ─── Symbol normalisation (mirrors _strip_nse_series / _normalize_nse_symbol) ─

function isIsin(sym: string): boolean {
  return sym.length === 12 && /^[A-Za-z]{2}/.test(sym) && /^[A-Za-z0-9]+$/.test(sym.slice(2));
}

function stripNseSeries(sym: string): string {
  return sym.replace(/-[A-Z]{1,3}$/i, '');
}

/**
 * Normalize to Yahoo Finance NSE format.
 * Mirrors backend _normalize_nse_symbol exactly:
 *   - ISINs → returned unchanged (spark API doesn't support them; individual fallbacks handle them)
 *   - .BSE suffix → strip series + .NS
 *   - No dot → strip series + .NS
 *   - Any other dot-suffix → leave as-is (.NS, .BO, etc.)
 */
function normalizeNseSymbol(sym: string): string {
  if (!sym) return sym;
  if (isIsin(sym)) return sym;
  const up = sym.toUpperCase();
  if (up.endsWith('.BSE')) return stripNseSeries(sym.slice(0, -4)) + '.NS';
  if (!sym.includes('.')) return stripNseSeries(sym) + '.NS';
  return sym;
}

// ─── USD / INR rate ────────────────────────────────────────────────────────────

let _usdInrCache: { rate: number; time: number } | null = null;

async function getUsdToInr(): Promise<number> {
  if (_usdInrCache && Date.now() - _usdInrCache.time < 10 * 60_000) {
    return _usdInrCache.rate;
  }
  try {
    const res = await fetchWithTimeout(
      'https://query1.finance.yahoo.com/v8/finance/chart/USDINR=X',
      { headers: YF_HEADERS },
    );
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

// ─── Yahoo Finance chart API (single symbol) ───────────────────────────────────

async function fetchYahooChart(
  symbol: string,
): Promise<{ price: number; prevClose: number | null } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
    const res = await fetchWithTimeout(url, { headers: YF_HEADERS });
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

// ─── Yahoo Finance spark batch ─────────────────────────────────────────────────
// Mirrors _batch_fetch_yahoo_spark_prices exactly, including stale detection.

interface SparkEntry {
  price: number;
  prevClose: number | null;
  stale: boolean; // true when last data point is >1 calendar day old (post-holiday morning)
}

async function fetchYahooSparkBatch(symbols: string[]): Promise<Map<string, SparkEntry>> {
  const result = new Map<string, SparkEntry>();
  if (!symbols.length) return result;

  const CHUNK = 20;
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);

  for (let i = 0; i < symbols.length; i += CHUNK) {
    const chunk = symbols.slice(i, i + CHUNK);
    try {
      const symsStr = chunk.join(',');
      const url = `https://query2.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(symsStr)}&range=5d&interval=1d`;
      const res = await fetchWithTimeout(url, { headers: YF_HEADERS });
      if (!res.ok) continue;
      const json = await res.json() as Record<string, unknown>;
      for (const [sym, info] of Object.entries(json)) {
        if (!info || typeof info !== 'object') continue;
        const closes: (number | null)[] = (info as any).close ?? [];
        const timestamps: number[] = (info as any).timestamp ?? [];

        // Pair closes with their timestamps and filter out nulls/zeros (matches backend)
        const paired = timestamps
          .map((ts, idx) => [ts, closes[idx]] as [number, number | null])
          .filter((p): p is [number, number] => p[1] != null && p[1] > 0);

        if (!paired.length) continue;

        const [lastTs, current] = paired[paired.length - 1];
        const prevClose = paired.length >= 2 ? paired[paired.length - 2][1] : null;

        // Stale when the most-recent data point is >1 calendar day old.
        // Covers post-holiday mornings where the pipeline hasn't published that day's close.
        const lastDate = new Date(lastTs * 1000);
        lastDate.setUTCHours(0, 0, 0, 0);
        const daysDiff = Math.round((todayUtc.getTime() - lastDate.getTime()) / 86_400_000);
        const stale = daysDiff > 1;

        result.set(sym, { price: current, prevClose, stale });
      }
    } catch { /* continue to next chunk */ }

    if (i + CHUNK < symbols.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return result;
}

/**
 * Extract (price, prevClose) from a spark entry.
 * Mirrors _extract_batch_price: stale entries return null price so the
 * individual chart-API fallback fires, but prevClose is preserved for day-change calc.
 */
function extractSparkPrice(
  entry: SparkEntry | undefined,
): { price: number | null; prevClose: number | null } {
  if (!entry) return { price: null, prevClose: null };
  if (entry.stale) return { price: null, prevClose: entry.prevClose };
  return { price: entry.price, prevClose: entry.prevClose };
}

// ─── AMFI (Mutual Funds) ───────────────────────────────────────────────────────

let _amfiCache: Map<string, number> | null = null;
let _amfiCacheTime = 0;
let _amfiFetchPromise: Promise<Map<string, number>> | null = null;
const AMFI_TTL = 4 * 60 * 60_000;

async function loadAmfi(): Promise<Map<string, number>> {
  const res = await fetchWithTimeout('https://www.amfiindia.com/spages/NAVAll.txt', {}, 20_000);
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
  return cache.get(isin) ?? null;
}

// ─── Physical gold / silver via Yahoo futures ──────────────────────────────────
// Mirrors _ensure_metal_cache: preserves stale values on API failure.

let _metalCache: { gold: number | null; silver: number | null; time: number } | null = null;

async function getMetalPricesInrPerGram(): Promise<{ gold: number | null; silver: number | null }> {
  if (_metalCache && Date.now() - _metalCache.time < 5 * 60_000) {
    return { gold: _metalCache.gold, silver: _metalCache.silver };
  }
  const TROY_OZ_TO_GRAM = 31.1035;
  const usdToInr = await getUsdToInr();
  const [goldRes, silverRes] = await Promise.all([
    fetchYahooChart('GC=F'),
    fetchYahooChart('SI=F'),
  ]);
  // Preserve stale values on failure — mirrors backend _ensure_metal_cache pattern
  const prevGold = _metalCache?.gold ?? null;
  const prevSilver = _metalCache?.silver ?? null;
  const gold = goldRes ? (goldRes.price * usdToInr) / TROY_OZ_TO_GRAM : prevGold;
  const silver = silverRes ? (silverRes.price * usdToInr) / TROY_OZ_TO_GRAM : prevSilver;
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
    const res = await fetchWithTimeout(url);
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

// ─── Asset-type classification ─────────────────────────────────────────────────

const MF_TYPES = new Set(['equity_mutual_fund', 'hybrid_mutual_fund', 'debt_mutual_fund']);
const NSE_STOCK_TYPES = new Set(['stock', 'esop', 'rsu', 'reit', 'invit']);
const CRYPTO_TYPE = 'crypto';
const US_STOCK_TYPE = 'us_stock';
const PHYSICAL_GOLD_TYPE = 'physical_gold';
const PHYSICAL_SILVER_TYPE = 'physical_silver';
const SGB_TYPE = 'sovereign_gold_bond';

function isVestedOrUsdCommodity(asset: Asset): boolean {
  return asset.brokerName?.toLowerCase() === 'vested'
    || (asset.details as any)?.currency === 'USD'
    || (asset.details as any)?.exchange === 'US';
}

function hasIndianIsin(asset: Asset): boolean {
  return !!(asset.isin && (asset.isin.startsWith('INF') || asset.isin.startsWith('INE')));
}

function resolveSymbol(asset: Asset): string | null {
  return asset.apiSymbol ?? asset.symbol ?? null;
}

// ─── countRefreshable ─────────────────────────────────────────────────────────

export function countRefreshable(assets: Asset[]): number {
  return assets.filter((a) => {
    if (MF_TYPES.has(a.assetType))           return !!a.isin;
    if (NSE_STOCK_TYPES.has(a.assetType))    return !!resolveSymbol(a);
    if (a.assetType === US_STOCK_TYPE)        return !!resolveSymbol(a);
    if (a.assetType === 'commodity')          return !!resolveSymbol(a);
    if (a.assetType === CRYPTO_TYPE)          return !!(a.details?.coin_id || a.symbol);
    if (a.assetType === PHYSICAL_GOLD_TYPE)   return !!(a.details?.weight_per_unit);
    if (a.assetType === PHYSICAL_SILVER_TYPE) return !!(a.details?.weight_per_unit);
    return false;
  }).length;
}

// ─── Main refresh — mirrors update_all_prices / _build_price_cache ────────────

export async function refreshPrices(assets: Asset[]): Promise<Map<number, LivePrice>> {
  const updates = new Map<number, LivePrice>();
  // Stale spark entries contribute prevClose even when price must come from chart fallback
  const savedPrevClose = new Map<number, number>();
  const now = new Date().toISOString();

  // Classify assets (mirrors _build_price_cache + update_all_prices separation)
  const mfAssets = assets.filter((a) => MF_TYPES.has(a.assetType) && !!a.isin);

  // NSE: stocks, REITs, InvITs, Indian commodity ETFs (INF/INE ISINs), INR ESOPs/RSUs
  const nseSymbolMap = new Map<string, number[]>();
  for (const a of assets) {
    const isNseType = NSE_STOCK_TYPES.has(a.assetType);
    const isInrEsopRsu = (a.assetType === 'esop' || a.assetType === 'rsu')
      && (a.details as any)?.currency !== 'USD';
    const isIndianCommodity = a.assetType === 'commodity' && hasIndianIsin(a);
    if (!isNseType && !isInrEsopRsu && !isIndianCommodity) continue;
    const sym = resolveSymbol(a);
    if (!sym) continue;
    const nseSym = normalizeNseSymbol(sym);
    if (isIsin(nseSym)) continue; // ISINs not supported by spark; handled individually
    if (!nseSymbolMap.has(nseSym)) nseSymbolMap.set(nseSym, []);
    nseSymbolMap.get(nseSym)!.push(a.id);
  }

  // US: US stocks, USD ESOPs/RSUs, non-Indian commodities (Vested/USD)
  const usSymbolMap = new Map<string, number[]>();
  for (const a of assets) {
    const isUsStock = a.assetType === US_STOCK_TYPE;
    const isUsdEsopRsu = (a.assetType === 'esop' || a.assetType === 'rsu')
      && (a.details as any)?.currency === 'USD';
    const isUsCommodity = a.assetType === 'commodity' && !hasIndianIsin(a);
    if (!isUsStock && !isUsdEsopRsu && !isUsCommodity) continue;
    const sym = resolveSymbol(a);
    if (!sym) continue;
    if (!usSymbolMap.has(sym)) usSymbolMap.set(sym, []);
    usSymbolMap.get(sym)!.push(a.id);
  }

  // Crypto
  const cryptoCoinMap = new Map<string, number[]>();
  for (const a of assets.filter((a) => a.assetType === CRYPTO_TYPE)) {
    const coinId = (a.details?.coin_id as string | undefined) ?? a.symbol?.toLowerCase();
    if (!coinId) continue;
    if (!cryptoCoinMap.has(coinId)) cryptoCoinMap.set(coinId, []);
    cryptoCoinMap.get(coinId)!.push(a.id);
  }

  const physGoldAssets = assets.filter(
    (a) => a.assetType === PHYSICAL_GOLD_TYPE && !!(a.details?.weight_per_unit),
  );
  const physSilvAssets = assets.filter(
    (a) => a.assetType === PHYSICAL_SILVER_TYPE && !!(a.details?.weight_per_unit),
  );

  // ── Phase 1: parallel warm-up ─────────────────────────────────────────────
  // Kick off all batch fetches in parallel (mirrors backend ThreadPoolExecutor).
  //
  // AMFI is fired as a fire-and-forget background warm-up — NOT awaited here.
  // NAVAll.txt is a multi-MB file that takes 15-20 s on mobile; blocking the
  // entire Promise.all on it would delay US stocks, NSE stocks, and crypto
  // (which all finish in ~2-3 s) and reliably trigger the 30-second timeout.
  // By Phase 3 (MF lookups) the download will be done or nearly done anyway.
  if (mfAssets.length) getAmfiCache().catch(() => {});

  const [
    usdToInr,
    metalPrices,
    nseSparkPrices,
    usSparkPrices,
    cryptoPrices,
  ] = await Promise.all([
    getUsdToInr(),
    (physGoldAssets.length || physSilvAssets.length)
      ? getMetalPricesInrPerGram()
      : Promise.resolve({ gold: null, silver: null }),
    nseSymbolMap.size ? fetchYahooSparkBatch([...nseSymbolMap.keys()]) : Promise.resolve(new Map<string, SparkEntry>()),
    usSymbolMap.size  ? fetchYahooSparkBatch([...usSymbolMap.keys()])  : Promise.resolve(new Map<string, SparkEntry>()),
    cryptoCoinMap.size ? fetchCoinGeckoBatch([...cryptoCoinMap.keys()]) : Promise.resolve(new Map<string, { priceInr: number; change24h: number | undefined }>()),
  ]);

  // ── Phase 2: Apply batch results ──────────────────────────────────────────

  // NSE assets
  for (const [nseSym, ids] of nseSymbolMap) {
    const { price, prevClose } = extractSparkPrice(nseSparkPrices.get(nseSym));
    if (price && price > 0) {
      const dayChangePct = prevClose && prevClose > 0
        ? ((price - prevClose) / prevClose) * 100
        : undefined;
      for (const id of ids) updates.set(id, { price, dayChangePct, fetchedAt: now });
    } else if (prevClose) {
      // Stale entry: save prevClose so the chart-API fallback can derive day change
      for (const id of ids) savedPrevClose.set(id, prevClose);
    }
  }

  // US assets
  for (const [sym, ids] of usSymbolMap) {
    const { price: priceUsd, prevClose: prevUsd } = extractSparkPrice(usSparkPrices.get(sym));
    if (priceUsd && priceUsd > 0) {
      const priceInr = priceUsd * usdToInr;
      const prevInr = prevUsd ? prevUsd * usdToInr : null;
      const dayChangePct = prevInr && prevInr > 0
        ? ((priceInr - prevInr) / prevInr) * 100
        : undefined;
      for (const id of ids) updates.set(id, { price: priceInr, dayChangePct, fetchedAt: now });
    } else if (prevUsd) {
      for (const id of ids) savedPrevClose.set(id, prevUsd * usdToInr);
    }
  }

  // Crypto
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
    updates.set(a.id, {
      price: weightPerUnit * (purityKarat / 24) * metalPrices.gold,
      dayChangePct: undefined,
      fetchedAt: now,
    });
  }
  for (const a of physSilvAssets) {
    if (!metalPrices.silver) continue;
    const weightPerUnit = a.details?.weight_per_unit as number;
    const purityStd = (a.details?.purity_standard as number) ?? 999;
    updates.set(a.id, {
      price: weightPerUnit * (purityStd / 1000) * metalPrices.silver,
      dayChangePct: undefined,
      fetchedAt: now,
    });
  }

  // ── Phase 3: MF prices via AMFI (cache is warm; all lookups are in-memory) ─
  await Promise.all(mfAssets.map(async (a) => {
    if (updates.has(a.id)) return;
    const nav = await fetchMfNav(a.isin!);
    if (nav) updates.set(a.id, { price: nav, dayChangePct: undefined, fetchedAt: now });
  }));

  // ── Phase 4: Individual chart-API fallback ────────────────────────────────
  // Covers two cases (mirrors backend's individual fallback loop):
  //   a) Batch miss — no spark entry at all
  //   b) Stale spark entry — price is null but prevClose may be in savedPrevClose
  const needsFallback = [
    ...assets.filter((a) => NSE_STOCK_TYPES.has(a.assetType) && !!resolveSymbol(a)),
    ...assets.filter((a) => a.assetType === 'commodity' && hasIndianIsin(a) && !!resolveSymbol(a)),
    ...assets.filter((a) => a.assetType === US_STOCK_TYPE && !!resolveSymbol(a)),
    ...assets.filter((a) => a.assetType === 'commodity' && !hasIndianIsin(a) && !!resolveSymbol(a)),
    ...assets.filter((a) =>
      (a.assetType === 'esop' || a.assetType === 'rsu') && !!resolveSymbol(a)
    ),
  ].filter((a) => !updates.has(a.id));

  const FALLBACK_CHUNK = 5;
  for (let i = 0; i < needsFallback.length; i += FALLBACK_CHUNK) {
    await Promise.all(
      needsFallback.slice(i, i + FALLBACK_CHUNK).map(async (a) => {
        const raw = resolveSymbol(a)!;
        const isNse = NSE_STOCK_TYPES.has(a.assetType)
          || hasIndianIsin(a)
          || (a.assetType === 'esop' || a.assetType === 'rsu')
            && (a.details as any)?.currency !== 'USD';
        const sym = isNse ? normalizeNseSymbol(raw) : raw;
        const hit = await fetchYahooChart(sym);
        if (!hit) return;

        let priceInr = hit.price;
        let chartPrevInr = hit.prevClose;
        if (!isNse) {
          priceInr = hit.price * usdToInr;
          chartPrevInr = hit.prevClose ? hit.prevClose * usdToInr : null;
        }

        // Prefer chart's own prevClose; fall back to stale spark prevClose (mirrors backend)
        const effectivePrev = chartPrevInr ?? savedPrevClose.get(a.id) ?? null;
        const dayChangePct = effectivePrev && effectivePrev > 0
          ? ((priceInr - effectivePrev) / effectivePrev) * 100
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
