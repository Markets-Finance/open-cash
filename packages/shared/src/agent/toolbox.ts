import type { InfoClient } from "@nktkas/hyperliquid";
import type { MarketSnapshot } from "../analysis/market.js";
import type { Book, Candle, FundingPoint } from "../analysis/types.js";
import { loadDeepBook, loadFeeRates, loadFunding, loadMarketSnapshot, loadOhlc, type HlFeeRates } from "../hl/book.js";
import { listMarkets, type HlMarket } from "../hl/markets.js";
import type { RiskLimits } from "../strategy/types.js";

const marketTtlMs = 30_000;
const snapshotTtlMs = 4_000;
const toolDexes = ["", "xyz"];

type Cached<T> = { at: number; value: T };

export type Toolbox = ReturnType<typeof createToolbox>;

export function resolutionForDays(days: number): number {
  return days <= 7 ? 3600 : 4 * 3600;
}

export function createToolbox(
  info: InfoClient,
  limits: RiskLimits,
  user?: `0x${string}`,
  now: () => number = Date.now,
) {
  let markets: Cached<HlMarket[]> | null = null;
  let fees: HlFeeRates | null = null;
  const snapshots = new Map<string, Cached<{ market: HlMarket; snapshot: MarketSnapshot; book: Book }>>();

  async function getMarkets(): Promise<HlMarket[]> {
    if (markets && now() - markets.at < marketTtlMs) return markets.value;
    const value = (await Promise.all(toolDexes.map((dex) => listMarkets(info, dex)))).flat();
    markets = { at: now(), value };
    return value;
  }

  async function getMarket(symbol: string): Promise<HlMarket> {
    const wanted = symbol.toUpperCase();
    const all = await getMarkets();
    const found =
      all.find((m) => m.name.toUpperCase() === wanted) ??
      all.find((m) => m.name.includes(":") && m.name.split(":")[1].toUpperCase() === wanted);
    if (!found) throw new Error(`Unknown market ${symbol}`);
    return found;
  }

  async function getFees(): Promise<HlFeeRates> {
    fees ??= await loadFeeRates(info, user);
    return fees;
  }

  async function getSnapshot(symbol: string): Promise<{ market: HlMarket; snapshot: MarketSnapshot }> {
    const market = await getMarket(symbol);
    const cached = snapshots.get(market.name);
    if (cached && now() - cached.at < snapshotTtlMs) return cached.value;
    const loaded = await loadMarketSnapshot(info, market, await getFees());
    const value = { market, snapshot: loaded.snapshot, book: loaded.book };
    snapshots.set(market.name, { at: now(), value });
    return value;
  }

  async function getBook(symbol: string): Promise<Book> {
    const market = await getMarket(symbol);
    const cached = snapshots.get(market.name);
    if (cached && now() - cached.at < snapshotTtlMs) return cached.value.book;
    return loadDeepBook(info, market.name);
  }

  async function getFunding(symbol: string, days: number): Promise<FundingPoint[]> {
    const market = await getMarket(symbol);
    return loadFunding(info, market.name, now() - days * 86_400_000);
  }

  async function getCandles(symbol: string, days: number): Promise<{ candles: Candle[]; resolution: number }> {
    const market = await getMarket(symbol);
    const resolution = resolutionForDays(days);
    const candles = await loadOhlc(info, market.name, resolution === 3600 ? "1h" : "4h", now() - days * 86_400_000);
    return { candles, resolution };
  }

  return { info, limits, getMarkets, getMarket, getSnapshot, getBook, getFunding, getCandles };
}
