import {
  chartRanges,
  hlDexes,
  listMarkets,
  loadDesk,
  loadFeeRates,
  loadMarketSnapshot,
  type Book,
  type Candle,
  type ChartRangeKey,
  type DepthSummary,
  type HlDesk,
  type HlFeeRates,
  type HlMarket,
  type MarketSnapshot,
  type TradingAccount,
} from "shared";
import { info } from "./hl";

export type MarketData = { markets: Map<string, HlMarket> };
export type MarketView = { snapshot: MarketSnapshot; book: Book; depth: DepthSummary };

const viewTtlMs = 10_000;
const deskTtlMs = 5_000;
let marketData: Promise<MarketData> | null = null;
let fees: Promise<HlFeeRates> | null = null;
let feeUser: string | undefined;
const views = new Map<string, { at: number; value: Promise<MarketView> }>();
const desks = new Map<string, { at: number; value: Promise<HlDesk> }>();

export function displaySymbol(coin: string): string {
  return coin.split(":").pop() ?? coin;
}

export function loadMarkets(force = false): Promise<MarketData> {
  if (force || marketData === null) {
    marketData = Promise.all(hlDexes.map((dex) => listMarkets(info, dex))).then((lists) => ({
      markets: new Map(lists.flat().filter((m) => m.markPx > 0).map((m) => [m.name, m])),
    }));
  }
  return marketData;
}

export async function loadMarketView(coin: string, user?: string): Promise<MarketView> {
  const cached = views.get(coin);
  if (cached && Date.now() - cached.at < viewTtlMs) return cached.value;
  const { markets } = await loadMarkets();
  const market = markets.get(coin);
  if (!market) throw new Error(`${coin} is not listed.`);
  if (fees === null || feeUser !== user) {
    feeUser = user;
    fees = loadFeeRates(info, user as `0x${string}` | undefined);
  }
  const value = loadMarketSnapshot(info, market, await fees);
  views.set(coin, { at: Date.now(), value });
  value.catch(() => views.delete(coin));
  return value;
}

export function loadAccountDesk(user: string, force = false): Promise<HlDesk> {
  const cached = desks.get(user);
  if (!force && cached && Date.now() - cached.at < deskTtlMs) return cached.value;
  const value = loadDesk(info, user as `0x${string}`);
  desks.set(user, { at: Date.now(), value });
  value.catch(() => desks.delete(user));
  return value;
}

export async function loadSummary(trader: Pick<TradingAccount, "address">) {
  const desk = await loadAccountDesk(trader.address, true);
  return {
    total: desk.equity,
    unrealizedPnl: desk.positions.reduce((sum, p) => sum + p.unrealizedPnl, 0),
    symbols: desk.positions.map((p) => p.coin),
  };
}

export async function loadCandles(coin: string, range: ChartRangeKey): Promise<Candle[]> {
  const { interval, spanMs } = chartRanges[range];
  const rows = await info.candleSnapshot({ coin, interval, startTime: Date.now() - spanMs });
  return rows.map((c) => ({ time: c.t, open: Number(c.o), high: Number(c.h), low: Number(c.l), close: Number(c.c), volume: Number(c.v) }));
}
