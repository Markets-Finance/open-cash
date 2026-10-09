import type { InfoClient } from "@nktkas/hyperliquid";
import type { Candle, FundingPoint } from "../analysis/types.js";
import { defaultMakerFeeBps, defaultTakerFeeBps, loadFunding, loadOhlc, marketFeeRates, type OhlcInterval } from "../hl/book.js";
import { listMarkets, type HlMarket } from "../hl/markets.js";
import { clampParams } from "./registry.js";
import { simulate } from "./simulate.js";
import { defaultSimOptions, type Params, type SimOptions, type SimResult, type Template } from "./types.js";

export type Series = {
  market: HlMarket;
  resolution: number;
  candles: Candle[];
  funding: FundingPoint[];
};

const windowMs = 30 * 86_400_000;
const ttlMs = 60_000;
const intervals: Record<number, OhlcInterval> = {
  300: "5m",
  900: "15m",
  1800: "30m",
  3600: "1h",
  14400: "4h",
  86400: "1d",
};

export function createSeriesLoader(info: InfoClient, dexes: string[] = ["", "xyz"]) {
  const cache = new Map<string, { at: number; series: Series }>();

  return async function loadSeries(symbol: string, resolution: number): Promise<Series> {
    const key = `${symbol}:${resolution}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.series;
    const interval = intervals[resolution];
    if (!interval) throw new Error(`Unsupported resolution ${resolution}s`);
    const markets = (await Promise.all(dexes.map((dex) => listMarkets(info, dex)))).flat();
    const market = markets.find((m) => m.name === symbol);
    if (!market) throw new Error(`Unknown market ${symbol}`);
    const now = Date.now();
    const [raw, funding] = await Promise.all([
      loadOhlc(info, market.name, interval, now - windowMs),
      loadFunding(info, market.name, now - windowMs),
    ]);
    const candles = raw.filter((c) => c.time + resolution * 1000 <= now);
    const series = { market, resolution, candles, funding };
    cache.set(key, { at: now, series });
    return series;
  };
}

export function simOptions(series: Series, allocationUsd: number): SimOptions {
  const fees = marketFeeRates(series.market, { takerFeeBps: defaultTakerFeeBps, makerFeeBps: defaultMakerFeeBps });
  return {
    ...defaultSimOptions,
    allocationUsd,
    makerFeeBps: fees.makerFeeBps,
    takerFeeBps: fees.takerFeeBps,
    funding: series.funding,
  };
}

export function runTemplate(template: Template, params: Params, series: Series, allocationUsd: number): SimResult {
  return simulate(template.create(clampParams(template, params)), series.candles, simOptions(series, allocationUsd));
}
