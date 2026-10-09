import {
  hlDexes,
  listMarkets,
  loadFeeRates,
  loadMarketSnapshot,
  type Book,
  type DepthSummary,
  type HlFeeRates,
  type HlMarket,
  type HlPosition,
  type MarketSnapshot,
} from "shared";
import { info } from "../hl";
import { getDesk } from "./desk";
import { session } from "./state";

export type MarketData = { markets: Map<string, HlMarket> };
export type MarketView = { snapshot: MarketSnapshot; book: Book; depth: DepthSummary };

const viewTtlMs = 10_000;
let marketData: Promise<MarketData> | null = null;
let fees: Promise<HlFeeRates> | null = null;
const views = new Map<string, { at: number; value: Promise<MarketView> }>();

export function displaySymbol(coin: string): string {
  return coin.split(":").pop() ?? coin;
}

export function getMarketData(force = false): Promise<MarketData> {
  if (force || marketData === null) {
    marketData = Promise.all(hlDexes.map((dex) => listMarkets(info, dex))).then((lists) => ({
      markets: new Map(lists.flat().filter((m) => m.markPx > 0).map((m) => [m.name, m])),
    }));
  }
  return marketData;
}

export async function getMarketView(coin: string): Promise<MarketView> {
  const cached = views.get(coin);
  if (cached && Date.now() - cached.at < viewTtlMs) return cached.value;
  const { markets } = await getMarketData();
  const market = markets.get(coin);
  if (!market) throw new Error(`${coin} is not listed.`);
  fees ??= loadFeeRates(info, session.trader?.address);
  const value = loadMarketSnapshot(info, market, await fees);
  views.set(coin, { at: Date.now(), value });
  value.catch(() => views.delete(coin));
  return value;
}

export async function getPositions(force = false): Promise<HlPosition[]> {
  if (!session.trader) return [];
  return (await getDesk(force)).positions;
}
