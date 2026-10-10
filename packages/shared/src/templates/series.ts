import type { InfoClient } from "@nktkas/hyperliquid";
import type { Candle, FundingPoint } from "../analysis/types.js";
import { defaultMakerFeeBps, defaultTakerFeeBps, marketFeeRates, type OhlcInterval } from "../hl/book.js";
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

export const defaultWindowDays = 30;
export const windowChoices = [30, 90, 180, 365] as const;
const maxCandlesPerCall = 4500;
const maxFundingPerCall = 480;
const fundingParallel = 5;
const ttlMs = 60_000;
const intervals: Record<number, OhlcInterval> = {
  300: "5m",
  900: "15m",
  1800: "30m",
  3600: "1h",
  14400: "4h",
  86400: "1d",
};

async function loadCandlesPaged(info: InfoClient, coin: string, interval: OhlcInterval, resolution: number, startTime: number, endTime: number): Promise<Candle[]> {
  const span = resolution * 1000 * maxCandlesPerCall;
  const byTime = new Map<number, Candle>();
  for (let from = startTime; from < endTime; from += span) {
    const rows = await info.candleSnapshot({ coin, interval, startTime: from, endTime: Math.min(endTime, from + span) });
    for (const c of rows) byTime.set(c.t, { time: c.t, open: Number(c.o), high: Number(c.h), low: Number(c.l), close: Number(c.c), volume: Number(c.v) });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

async function loadFundingPaged(info: InfoClient, coin: string, startTime: number, endTime: number): Promise<FundingPoint[]> {
  const span = maxFundingPerCall * 3_600_000;
  const windows: [number, number][] = [];
  for (let from = startTime; from < endTime; from += span) windows.push([from, Math.min(endTime, from + span)]);
  const byTime = new Map<number, FundingPoint>();
  for (let i = 0; i < windows.length; i += fundingParallel) {
    const batch = await Promise.all(windows.slice(i, i + fundingParallel).map(([from, to]) => info.fundingHistory({ coin, startTime: from, endTime: to })));
    for (const rows of batch) for (const p of rows) byTime.set(p.time, { timeMs: p.time, hourlyRate: Number(p.fundingRate) });
  }
  return [...byTime.values()].sort((a, b) => a.timeMs - b.timeMs);
}

export function createSeriesLoader(info: InfoClient, dexes: string[] = ["", "xyz"]) {
  const cache = new Map<string, { at: number; series: Series }>();

  return async function loadSeries(symbol: string, resolution: number, days: number = defaultWindowDays): Promise<Series> {
    const key = `${symbol}:${resolution}:${days}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.series;
    const interval = intervals[resolution];
    if (!interval) throw new Error(`Unsupported resolution ${resolution}s`);
    const markets = (await Promise.all(dexes.map((dex) => listMarkets(info, dex)))).flat();
    const market = markets.find((m) => m.name === symbol);
    if (!market) throw new Error(`Unknown market ${symbol}`);
    const now = Date.now();
    const startTime = now - days * 86_400_000;
    const [raw, funding] = await Promise.all([
      loadCandlesPaged(info, market.name, interval, resolution, startTime, now),
      loadFundingPaged(info, market.name, startTime, now),
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
