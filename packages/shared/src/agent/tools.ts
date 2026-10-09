import { priceStats, summarizeDepth, slippageBps, summarizeFunding } from "../analysis/market.js";
import { analyzePair } from "../analysis/pair.js";
import { hasBlockingIssue, previewStrategy, type MarketContext } from "../analysis/risk.js";
import type { StrategyCard } from "../strategy/types.js";
import { resolutionForDays, type Toolbox } from "./toolbox.js";

type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
};

export type AgentTool = {
  name: string;
  description: string;
  parameters: JsonSchema;
  run: (args: Record<string, unknown>, toolbox: Toolbox) => Promise<unknown>;
};

export type ToolSpec = {
  type: "function";
  function: { name: string; description: string; parameters: JsonSchema };
};

export type ToolOutcome =
  | { ok: true; tool: string; args: Record<string, unknown>; result: unknown; ms: number }
  | { ok: false; tool: string; args: Record<string, unknown>; error: string; ms: number };

const symbolProp = { type: "string", description: "Hyperliquid market such as BTC, ETH, NVDA or xyz:GOLD" };
const daysProp = { type: "number", description: "Lookback in days, 1 to 30", minimum: 1, maximum: 30 };

function str(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value === "") throw new Error(`Missing argument ${key}`);
  return value;
}

function num(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function contextsFor(card: StrategyCard, toolbox: Toolbox): Promise<Map<string, MarketContext>> {
  const contexts = new Map<string, MarketContext>();
  for (const symbol of new Set(card.legs.map((leg) => leg.symbol))) {
    try {
      const { market, snapshot } = await toolbox.getSnapshot(symbol);
      contexts.set(symbol, { market, snapshot, book: await toolbox.getBook(symbol) });
    } catch {
      continue;
    }
  }
  return contexts;
}

export const tools: AgentTool[] = [
  {
    name: "list_markets",
    description:
      "Every Hyperliquid perp market (crypto and xyz stocks/commodities) with mark price, 24h change, 24h volume, open interest, max leverage and current funding APR.",
    parameters: { type: "object", properties: {}, required: [] },
    async run(_args, toolbox) {
      const markets = await toolbox.getMarkets();
      return markets.map((m) => ({
        symbol: m.name,
        mark: m.markPx,
        change24hPct: m.prevDayPx > 0 ? ((m.markPx - m.prevDayPx) / m.prevDayPx) * 100 : 0,
        volume24hUsd: m.dayNtlVlm,
        openInterestUsd: m.openInterest * m.markPx,
        maxLeverage: m.maxLeverage,
        fundingAprPct: m.funding * 24 * 365 * 100,
      }));
    },
  },
  {
    name: "market_snapshot",
    description: "Price, spread, volume, open interest, fees and 7 day funding for one market.",
    parameters: { type: "object", properties: { symbol: symbolProp }, required: ["symbol"] },
    async run(args, toolbox) {
      return (await toolbox.getSnapshot(str(args, "symbol"))).snapshot;
    },
  },
  {
    name: "funding_history",
    description: "Funding rate history for a market, annualised. Positive means longs pay shorts.",
    parameters: { type: "object", properties: { symbol: symbolProp, days: daysProp }, required: ["symbol"] },
    async run(args, toolbox) {
      const market = await toolbox.getMarket(str(args, "symbol"));
      const days = num(args, "days", 7);
      const points = await toolbox.getFunding(market.name, days);
      return { symbol: market.name, intervalSec: 3600, summary: summarizeFunding(points) };
    },
  },
  {
    name: "price_stats",
    description: "Return, high, low, annualised volatility and max drawdown over a lookback.",
    parameters: { type: "object", properties: { symbol: symbolProp, days: daysProp }, required: ["symbol"] },
    async run(args, toolbox) {
      const days = num(args, "days", 7);
      const { candles, resolution } = await toolbox.getCandles(str(args, "symbol"), days);
      return { symbol: (await toolbox.getMarket(str(args, "symbol"))).name, days, ...priceStats(candles, resolution) };
    },
  },
  {
    name: "order_book",
    description: "Resting depth within 10, 25 and 50 bps of mid, plus slippage for an order of a given USD size.",
    parameters: {
      type: "object",
      properties: { symbol: symbolProp, notionalUsd: { type: "number", description: "Order size in USD" } },
      required: ["symbol"],
    },
    async run(args, toolbox) {
      const { snapshot } = await toolbox.getSnapshot(str(args, "symbol"));
      const book = await toolbox.getBook(str(args, "symbol"));
      const notional = num(args, "notionalUsd", 0);
      return {
        symbol: snapshot.symbol,
        mid: snapshot.mark,
        spreadBps: snapshot.spreadBps,
        depth: summarizeDepth(book, snapshot.mark),
        buySlippageBps: notional > 0 ? slippageBps(book, "buy", notional, snapshot.mark) : null,
        sellSlippageBps: notional > 0 ? slippageBps(book, "sell", notional, snapshot.mark) : null,
      };
    },
  },
  {
    name: "compare_pair",
    description:
      "Long one market against another: correlation, beta, ratio z-score, funding carry in APR, fees and break-even days.",
    parameters: {
      type: "object",
      properties: { long: symbolProp, short: symbolProp, days: daysProp },
      required: ["long", "short"],
    },
    async run(args, toolbox) {
      const days = num(args, "days", 7);
      const [a, b] = await Promise.all([
        toolbox.getSnapshot(str(args, "long")),
        toolbox.getSnapshot(str(args, "short")),
      ]);
      const [ca, cb] = await Promise.all([
        toolbox.getCandles(str(args, "long"), days),
        toolbox.getCandles(str(args, "short"), days),
      ]);
      return analyzePair(a.snapshot, b.snapshot, ca.candles, cb.candles, resolutionForDays(days));
    },
  },
  {
    name: "preview_strategy",
    description: "Sizing, liquidation prices, slippage, fees, max loss at the stop and every rule the strategy breaks.",
    parameters: { type: "object", properties: { strategy: { type: "object" } }, required: ["strategy"] },
    async run(args, toolbox) {
      const card = args.strategy as StrategyCard;
      const preview = previewStrategy(card, await contextsFor(card, toolbox), toolbox.limits);
      return { ...preview, approvable: !hasBlockingIssue(preview) };
    },
  },
];

export function toolSpecs(): ToolSpec[] {
  return tools.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  toolbox: Toolbox,
): Promise<ToolOutcome> {
  const started = Date.now();
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { ok: false, tool: name, args, error: `Unknown tool ${name}`, ms: 0 };
  try {
    return { ok: true, tool: name, args, result: await tool.run(args, toolbox), ms: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      tool: name,
      args,
      error: error instanceof Error ? error.message : String(error),
      ms: Date.now() - started,
    };
  }
}
