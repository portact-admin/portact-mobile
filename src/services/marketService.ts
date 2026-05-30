/**
 * marketService — live market data for the Market Insights screen.
 * Mirrors PortAct's market API endpoints and data sources.
 */

const YF = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuoteData {
  symbol: string;
  label: string;
  price: number;
  changePct: number;
  currency: string;
}

export interface SentimentData {
  value: number;       // 0–100
  label: string;       // "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed"
}

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description: string;
}

// ─── USD / INR rate ───────────────────────────────────────────────────────────

let _usdInrRate: number | null = null;
let _usdInrTime = 0;

export async function fetchUsdInr(): Promise<{ rate: number; changePct: number } | null> {
  try {
    const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/USDINR=X', { headers: YF });
    if (!res.ok) return null;
    const json = await res.json() as Record<string, unknown>;
    const meta = ((json?.chart as any)?.result?.[0]?.meta) as Record<string, unknown>;
    const rate = meta?.regularMarketPrice as number;
    const prev = (meta?.chartPreviousClose ?? meta?.previousClose) as number | undefined;
    const changePct = rate && prev && prev > 0 ? ((rate - prev) / prev) * 100 : 0;
    if (rate > 0) {
      _usdInrRate = rate;
      _usdInrTime = Date.now();
    }
    return { rate, changePct };
  } catch {
    return null;
  }
}

async function getUsdInr(): Promise<number> {
  if (_usdInrRate && Date.now() - _usdInrTime < 10 * 60_000) return _usdInrRate;
  const res = await fetchUsdInr();
  return res?.rate ?? _usdInrRate ?? 84;
}

// ─── Yahoo Finance quote helper ───────────────────────────────────────────────

async function yfChart(symbol: string): Promise<{ price: number; changePct: number } | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
      { headers: YF },
    );
    if (!res.ok) return null;
    const json = await res.json() as Record<string, unknown>;
    const meta = ((json?.chart as any)?.result?.[0]?.meta) as Record<string, unknown>;
    const price = meta?.regularMarketPrice as number;
    const prev = (meta?.chartPreviousClose ?? meta?.previousClose) as number | undefined;
    if (!price || price <= 0) return null;
    const changePct = prev && prev > 0 ? ((price - prev) / prev) * 100 : 0;
    return { price, changePct };
  } catch {
    return null;
  }
}

// ─── Market Indices ───────────────────────────────────────────────────────────

const INDEX_CONFIG: { symbol: string; label: string; currency: string }[] = [
  { symbol: '^NSEI',  label: 'NIFTY 50', currency: 'INR' },
  { symbol: '^BSESN', label: 'SENSEX',   currency: 'INR' },
  { symbol: '^GSPC',  label: 'S&P 500',  currency: 'USD' },
  { symbol: '^IXIC',  label: 'NASDAQ',   currency: 'USD' },
];

export async function fetchMarketIndices(): Promise<QuoteData[]> {
  const results = await Promise.all(
    INDEX_CONFIG.map(async (cfg) => {
      const q = await yfChart(cfg.symbol);
      if (!q) return null;
      return { symbol: cfg.symbol, label: cfg.label, price: q.price, changePct: q.changePct, currency: cfg.currency } as QuoteData;
    }),
  );
  return results.filter((r): r is QuoteData => r !== null);
}

// ─── Commodity Prices ─────────────────────────────────────────────────────────

export interface CommodityPrice {
  label: string;
  priceInr: number;
  priceUsd: number | null;
  changePct: number;
  unit: string;       // "per 10g", "per kg", "per bbl", "per BTC"
}

const TROY_TO_GRAM = 31.1035;

export async function fetchCommodityPrices(): Promise<CommodityPrice[]> {
  const [usdToInr, btcRes, crudeRes, goldRes, silverRes] = await Promise.all([
    getUsdInr(),
    // Bitcoin via CoinGecko (INR direct)
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=inr,usd&include_24hr_change=true')
      .then((r) => r.json()).catch(() => null) as Promise<any>,
    yfChart('BZ=F'),    // Brent Crude — USD/bbl
    yfChart('GC=F'),    // Gold — USD/troy oz
    yfChart('SI=F'),    // Silver — USD/troy oz
  ]);

  const results: CommodityPrice[] = [];

  // Bitcoin
  if (btcRes?.bitcoin) {
    results.push({
      label: 'Bitcoin',
      priceInr: btcRes.bitcoin.inr,
      priceUsd: btcRes.bitcoin.usd,
      changePct: btcRes.bitcoin.inr_24h_change ?? 0,
      unit: 'per BTC',
    });
  }

  // Brent Crude
  if (crudeRes) {
    results.push({
      label: 'Brent Crude',
      priceInr: crudeRes.price * usdToInr,
      priceUsd: crudeRes.price,
      changePct: crudeRes.changePct,
      unit: 'per bbl',
    });
  }

  // Gold — convert to INR per 10g (Indian standard display)
  if (goldRes) {
    const inrPerGram = (goldRes.price * usdToInr) / TROY_TO_GRAM;
    results.push({
      label: 'Gold',
      priceInr: inrPerGram * 10,
      priceUsd: goldRes.price,
      changePct: goldRes.changePct,
      unit: 'per 10g',
    });
  }

  // Silver — convert to INR per kg
  if (silverRes) {
    const inrPerGram = (silverRes.price * usdToInr) / TROY_TO_GRAM;
    results.push({
      label: 'Silver',
      priceInr: inrPerGram * 1000,
      priceUsd: silverRes.price,
      changePct: silverRes.changePct,
      unit: 'per kg',
    });
  }

  return results;
}

// ─── India VIX (live) ─────────────────────────────────────────────────────────

export async function fetchIndiaVix(): Promise<number | null> {
  const q = await yfChart('^INDIAVIX');
  return q?.price ?? null;
}

// ─── BTC Fear & Greed — Alternative.me (free, no key) ────────────────────────

export async function fetchBtcFearGreed(): Promise<SentimentData | null> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    if (!res.ok) return null;
    const json = await res.json() as Record<string, unknown>;
    const item = (json.data as any[])?.[0];
    if (!item) return null;
    return { value: Number(item.value), label: item.value_classification ?? '' };
  } catch {
    return null;
  }
}

// ─── US Fear & Greed — CNN ────────────────────────────────────────────────────

export async function fetchUsFearGreed(): Promise<SentimentData | null> {
  try {
    const res = await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata');
    if (!res.ok) return null;
    const json = await res.json() as Record<string, unknown>;
    const fg = (json as any).fear_and_greed;
    if (!fg) return null;
    return { value: Number(fg.score), label: fg.rating ?? '' };
  } catch {
    return null;
  }
}

// ─── Financial News — Yahoo Finance RSS ───────────────────────────────────────

function parseRssXml(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRx = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRx.exec(xml)) !== null && items.length < 10) {
    const raw = m[1];
    const title = (raw.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s)?.[1] ?? '').trim();
    const link  = (raw.match(/<link>(.*?)<\/link>/s)?.[1] ?? '').trim();
    const pub   = (raw.match(/<pubDate>(.*?)<\/pubDate>/s)?.[1] ?? '').trim();
    const desc  = (raw.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/s)?.[1] ?? '')
      .replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim().slice(0, 180);
    // Source: extract from link domain
    let source = 'Yahoo Finance';
    try { source = new URL(link).hostname.replace(/^www\./, ''); } catch { /* ok */ }
    if (title) items.push({ title, link, source, pubDate: pub, description: desc });
  }
  return items;
}

export async function fetchFinancialNews(): Promise<NewsItem[]> {
  try {
    const res = await fetch('https://finance.yahoo.com/rss/topstories');
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssXml(xml);
  } catch {
    return [];
  }
}
