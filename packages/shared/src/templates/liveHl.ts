import type { ExchangeClient, InfoClient } from "@nktkas/hyperliquid";
import { loadOhlc } from "../hl/book.js";
import { listMarkets, type HlMarket } from "../hl/markets.js";
import { cancelOrder, formatSize, placeLimitOrders, setLeverage, type HlBuilder, type LimitOrderInput } from "../hl/orders.js";
import { getAccount, type HlPosition } from "../hl/positions.js";
import { placeTrigger } from "../hl/triggers.js";
import type { LiveDeps, LiveLimitInput, LivePosition } from "./live.js";
import { ohlcIntervalFor } from "./series.js";

export type HlLiveDepsConfig = {
  info: InfoClient;
  exchange: ExchangeClient;
  user: `0x${string}`;
  builder?: HlBuilder;
  slippage?: number;
  now?: () => number;
  guard?: (maxLossUsd: number | null) => Promise<{ allowed: boolean; reason: string }>;
};

type OrderStatus = { resting?: { oid: number }; filled?: { oid: number; totalSz: string; avgPx: string }; error?: string } | "waitingForFill" | "waitingForTrigger";

function newCloid(): `0x${string}` {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `0x${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function detail(status: OrderStatus | undefined) {
  return typeof status === "object" ? status : undefined;
}

const noCap = Number.MAX_SAFE_INTEGER;
const goneOrder = /cancel|filled|never placed|not found/i;

function dexOf(symbol: string): string {
  return symbol.includes(":") ? symbol.split(":")[0]! : "";
}

async function statusesOf(run: () => Promise<{ response: { data: { statuses: unknown[] } } }>): Promise<OrderStatus[]> {
  try {
    return (await run()).response.data.statuses as OrderStatus[];
  } catch (error) {
    const partial = (error as { response?: { response?: { data?: { statuses?: OrderStatus[] } } } }).response?.response?.data?.statuses;
    if (!partial) throw error;
    return partial;
  }
}

export function createHlLiveDeps(config: HlLiveDepsConfig): LiveDeps {
  const { info, exchange, user } = config;
  const slippage = config.slippage ?? 0.01;

  async function market(symbol: string): Promise<HlMarket> {
    const found = (await listMarkets(info, dexOf(symbol))).find((m) => m.name === symbol);
    if (!found) throw new Error(`Unknown market ${symbol}`);
    return found;
  }

  async function heldPosition(symbol: string): Promise<HlPosition | null> {
    const account = await getAccount(info, user, dexOf(symbol));
    return account.positions.find((p) => p.coin === symbol && p.size !== 0) ?? null;
  }

  async function position(symbol: string): Promise<LivePosition> {
    const held = await heldPosition(symbol);
    return held ? { qty: held.size, avgPx: held.entryPx } : { qty: 0, avgPx: 0 };
  }

  function sizeFor(usd: number, price: number, szDecimals: number, roundUp: boolean): number {
    const step = 10 ** szDecimals;
    const units = ((Math.abs(usd) * (roundUp ? 1.002 : 1)) / price) * step;
    return (roundUp ? Math.ceil(units) : Math.floor(units)) / step;
  }

  async function ensureLeverage(m: HlMarket, symbol: string, leverage: number) {
    if ((await position(symbol)).qty === 0) await setLeverage(exchange, m.assetId, leverage, false);
  }

  return {
    now: config.now ?? Date.now,
    candles: (symbol, resolution, since) => loadOhlc(info, symbol, ohlcIntervalFor(resolution), since),
    position,
    guard: config.guard ?? (async () => ({ allowed: true, reason: "" })),

    async enter(symbol, usd, { leverage, reduceOnly }) {
      const m = await market(symbol);
      if (!reduceOnly) await ensureLeverage(m, symbol, leverage);
      const isBuy = usd > 0;
      const price = m.markPx * (isBuy ? 1 + slippage : 1 - slippage);
      const size = sizeFor(usd, price, m.szDecimals, !reduceOnly);
      const order: LimitOrderInput = { assetId: m.assetId, isBuy, price, size, szDecimals: m.szDecimals, kind: "perp", tif: "Ioc", reduceOnly, maxNotionalUsd: noCap };
      const [status] = await statusesOf(() => placeLimitOrders(exchange, [order], config.builder));
      const filled = detail(status)?.filled;
      if (!filled || Number(filled.totalSz) <= 0) throw new Error(`Order not filled: ${detail(status)?.error ?? "no match"}`);
    },

    async exit(symbol) {
      const held = await heldPosition(symbol);
      if (!held) return;
      const m = await market(symbol);
      const isBuy = held.size < 0;
      const price = m.markPx * (isBuy ? 1 + slippage : 1 - slippage);
      const size = Math.abs(held.size);
      const order: LimitOrderInput = { assetId: m.assetId, isBuy, price, size, szDecimals: m.szDecimals, kind: "perp", tif: "Ioc", reduceOnly: true, maxNotionalUsd: noCap };
      const [status] = await statusesOf(() => placeLimitOrders(exchange, [order], config.builder));
      const filled = Number(detail(status)?.filled?.totalSz ?? 0);
      if (filled < Number(formatSize(size, m.szDecimals))) throw new Error(`Close incomplete: ${detail(status)?.error ?? `filled ${filled} of ${size}`}`);
    },

    async placeStop(symbol, triggerPx) {
      const held = await heldPosition(symbol);
      if (!held) throw new Error("No position to protect");
      const m = await market(symbol);
      const cloid = newCloid();
      const result = await placeTrigger(exchange, { assetId: m.assetId, szDecimals: m.szDecimals, position: held, markPx: m.markPx, kind: "sl", triggerPx, maxNotionalUsd: noCap, cloid });
      const status = result.response.data.statuses[0] as OrderStatus | undefined;
      const direct = detail(status)?.resting?.oid ?? detail(status)?.filled?.oid;
      if (direct !== undefined) return direct;
      if (status !== "waitingForTrigger" && status !== "waitingForFill") throw new Error(detail(status)?.error ?? "Stop was not accepted");
      const dex = dexOf(symbol);
      const open = await info.frontendOpenOrders(dex ? { user, dex } : { user });
      const placed = open.find((o) => o.cloid === cloid);
      if (!placed) throw new Error("Stop was accepted but could not be found among open orders");
      return placed.oid;
    },

    async cancel(symbol, oids) {
      if (oids.length === 0) return;
      const m = await market(symbol);
      for (const oid of oids) {
        try {
          await cancelOrder(exchange, m.assetId, oid);
        } catch (error) {
          if (!goneOrder.test(error instanceof Error ? error.message : String(error))) throw error;
        }
      }
    },

    async placeLimits(symbol, orders: LiveLimitInput[], leverage) {
      const m = await market(symbol);
      if (orders.some((o) => !o.reduceOnly)) await ensureLeverage(m, symbol, leverage);
      const all: LimitOrderInput[] = orders.map((o) => ({
        assetId: m.assetId,
        isBuy: o.usd > 0,
        price: o.px,
        size: sizeFor(o.usd, o.px, m.szDecimals, !o.reduceOnly),
        szDecimals: m.szDecimals,
        kind: "perp",
        tif: "Gtc",
        reduceOnly: o.reduceOnly,
        maxNotionalUsd: noCap,
      }));
      const sendable = all.map((input, i) => ({ input, i })).filter(({ input }) => Number(formatSize(input.size, input.szDecimals)) > 0);
      const oids: (number | null)[] = orders.map(() => null);
      if (sendable.length === 0) return oids;
      const statuses = await statusesOf(() => placeLimitOrders(exchange, sendable.map((s) => s.input), config.builder));
      sendable.forEach(({ i }, k) => (oids[i] = detail(statuses[k])?.resting?.oid ?? detail(statuses[k])?.filled?.oid ?? null));
      return oids;
    },

    async orderFills(_symbol, oids, since) {
      const wanted = new Set(oids);
      const fills = await info.userFillsByTime({ user, startTime: Math.max(0, since) });
      return fills.filter((f) => wanted.has(f.oid)).map((f) => ({ oid: f.oid, size: Number(f.sz), time: f.time }));
    },
  };
}
