import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { utf8 } from "@scure/base";
import type { Candle } from "../analysis/types.js";
import { clampParams, templateById } from "./registry.js";
import type { Fill, Params, StepOutput, TemplateId } from "./types.js";

export const liveTemplates: TemplateId[] = ["donchian", "dca", "grid", "trail"];
export const liveResolutions = [300, 900, 1800, 3600, 14400, 86400];
export const minLiveAllocationUsd = 10;
export const maxLiveJournal = 4500;
export const maxLiveLeverage = 5;
export const minLiveOrderUsd = 10;

const maxErrors = 3;
const maxLog = 60;
const stopTolerance = 0.0005;
const warmupCandles = 200;

export type LiveStatus = "idle" | "watching" | "open" | "halted";
export type LiveLogEntry = { at: number; level: "info" | "action" | "error"; message: string };
export type LiveJournalEntry = { time: number; qty: number; avgPx: number; fills?: Fill[] };
export type LiveStop = { oid: number; px: number; size: number };
export type LiveResting = { oid: number; px: number; usd: number };

export type LiveSpec = {
  templateId: TemplateId;
  symbol: string;
  resolution: number;
  params: Params;
  allocationUsd: number;
  leverage: number;
};

export type LiveBot = LiveSpec & {
  id: string;
  name: string;
  enabled: boolean;
  status: LiveStatus;
  createdAt: number;
  startedAt: number | null;
  lastCandleTime: number | null;
  declaredStop: number | null;
  stop: LiveStop | null;
  resting: LiveResting[];
  orders: number;
  journal: LiveJournalEntry[];
  errorStreak: number;
  lastCheck: { at: number; message: string } | null;
  log: LiveLogEntry[];
};

export type LivePosition = { qty: number; avgPx: number };
export type LiveLimitInput = { px: number; usd: number; reduceOnly: boolean };
export type LiveOrderFill = { oid: number; size: number; time: number };

export type LiveDeps = {
  now: () => number;
  candles: (symbol: string, resolution: number, since: number) => Promise<Candle[]>;
  position: (symbol: string) => Promise<LivePosition>;
  guard: (maxLossUsd: number | null) => Promise<{ allowed: boolean; reason: string }>;
  enter: (symbol: string, usd: number, options: { leverage: number; reduceOnly: boolean }) => Promise<void>;
  exit: (symbol: string) => Promise<void>;
  placeStop: (symbol: string, triggerPx: number) => Promise<number>;
  cancel: (symbol: string, oids: number[]) => Promise<void>;
  placeLimits: (symbol: string, orders: LiveLimitInput[], leverage: number) => Promise<(number | null)[]>;
  orderFills: (symbol: string, oids: number[], since: number) => Promise<LiveOrderFill[]>;
};

export function liveDigest(spec: LiveSpec): string {
  const params = Object.keys(spec.params)
    .sort()
    .map((key) => [key, spec.params[key]]);
  const body = { kind: "live", template: spec.templateId, symbol: spec.symbol, resolution: spec.resolution, params, allocationUsd: spec.allocationUsd, leverage: spec.leverage };
  return bytesToHex(sha256(utf8.decode(JSON.stringify(body))));
}

export function liveIssues(spec: LiveSpec, marketMaxLeverage: number = maxLiveLeverage): string[] {
  const issues: string[] = [];
  if (!liveTemplates.includes(spec.templateId)) issues.push(`${spec.templateId} cannot run live.`);
  if (!spec.symbol) issues.push("Choose a market.");
  if (!liveResolutions.includes(spec.resolution)) issues.push(`Candle size must be one of ${liveResolutions.join(", ")} seconds.`);
  if (!Number.isFinite(spec.allocationUsd) || spec.allocationUsd < minLiveAllocationUsd) issues.push(`Allocation must be at least $${minLiveAllocationUsd}.`);
  const cap = Math.min(maxLiveLeverage, marketMaxLeverage);
  if (!Number.isInteger(spec.leverage) || spec.leverage < 1 || spec.leverage > cap) issues.push(`Leverage must be a whole number from 1 to ${cap}.`);
  return issues;
}

export function createLiveBot(spec: LiveSpec, now: number): LiveBot {
  const template = templateById(spec.templateId);
  return {
    ...spec,
    params: clampParams(template, spec.params),
    id: `live-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: `${template.name} ${spec.symbol.split(":").pop()}`,
    enabled: false,
    status: "idle",
    createdAt: now,
    startedAt: null,
    lastCandleTime: null,
    declaredStop: null,
    stop: null,
    resting: [],
    orders: 0,
    journal: [],
    errorStreak: 0,
    lastCheck: null,
    log: [],
  };
}

function withLog(bot: LiveBot, level: LiveLogEntry["level"], message: string, at: number): LiveBot {
  return { ...bot, log: [{ at, level, message }, ...bot.log].slice(0, maxLog) };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failure(bot: LiveBot, error: unknown, now: number): LiveBot {
  const streak = bot.errorStreak + 1;
  const logged = withLog({ ...bot, errorStreak: streak }, "error", messageOf(error), now);
  if (streak < maxErrors) return logged;
  const note = bot.stop ? "Halted after repeated errors. The exchange stop stays in place." : `Halted after ${streak} errors in a row`;
  return withLog({ ...logged, status: "halted", enabled: false }, "error", note, now);
}

function clipUsd(delta: number, position: LivePosition, price: number, capUsd: number): number {
  const current = position.qty * price;
  const next = current + delta;
  if (Math.abs(next) <= capUsd) return delta;
  if (Math.abs(current) >= capUsd && Math.sign(delta) === Math.sign(current)) return 0;
  return Math.sign(next) * capUsd - current;
}

async function reconcileStop(bot: LiveBot, position: LivePosition, deps: LiveDeps, now: number): Promise<LiveBot> {
  const size = Math.abs(position.qty);
  const current = bot.stop;
  const cancel = async () => {
    if (current) await deps.cancel(bot.symbol, [current.oid]).catch(() => undefined);
  };
  if (size === 0) {
    await cancel();
    return { ...bot, stop: null, status: "watching" };
  }
  const wanted = bot.declaredStop;
  if (wanted === null) {
    await cancel();
    return { ...bot, stop: null, status: "open" };
  }
  const settled = current !== null && Math.abs(current.px - wanted) / wanted <= stopTolerance && Math.abs(current.size - size) <= size * 1e-6;
  if (settled) return { ...bot, status: "open" };
  let oid: number;
  try {
    oid = await deps.placeStop(bot.symbol, wanted);
  } catch (error) {
    await deps.exit(bot.symbol);
    await cancel();
    return withLog({ ...bot, stop: null, status: "watching", orders: bot.orders + 1 }, "error", `Could not place the stop (${messageOf(error)}). Closed the position to stay protected.`, now);
  }
  await cancel();
  return { ...bot, stop: { oid, px: wanted, size }, status: "open", orders: bot.orders + 1 };
}

async function placeLimits(bot: LiveBot, limits: StepOutput["limits"], position: LivePosition, price: number, deps: LiveDeps, now: number): Promise<LiveBot> {
  if (!limits || limits.length === 0) return bot;
  let room = Math.max(0, bot.allocationUsd * bot.leverage - Math.abs(position.qty * price));
  const chosen: { order: { price: number; usd: number }; input: LiveLimitInput }[] = [];
  let skipped = 0;
  for (const order of limits) {
    const reduceOnly = position.qty !== 0 && Math.sign(order.usd) !== Math.sign(position.qty);
    if (!reduceOnly && (Math.abs(order.usd) < minLiveOrderUsd || Math.abs(order.usd) > room)) {
      skipped += 1;
      continue;
    }
    if (!reduceOnly) room -= Math.abs(order.usd);
    chosen.push({ order, input: { px: order.price, usd: order.usd, reduceOnly } });
  }
  let next = bot;
  if (skipped > 0) next = withLog(next, "info", `Skipped ${skipped} resting order${skipped === 1 ? "" : "s"}: under $${minLiveOrderUsd} or past the allocation`, now);
  if (chosen.length === 0) return next;
  const oids = await deps.placeLimits(bot.symbol, chosen.map((c) => c.input), bot.leverage);
  const resting: LiveResting[] = [];
  oids.forEach((oid, i) => {
    if (oid !== null) resting.push({ oid, px: chosen[i]!.order.price, usd: chosen[i]!.order.usd });
  });
  return withLog({ ...next, resting, orders: next.orders + chosen.length }, "action", `Placed ${resting.length} resting order${resting.length === 1 ? "" : "s"}`, now);
}

async function execute(bot: LiveBot, out: StepOutput, start: LivePosition, price: number, deps: LiveDeps, now: number): Promise<LiveBot> {
  let next = bot;
  let position = start;
  if (out.flat && position.qty !== 0) {
    await deps.exit(bot.symbol);
    next = withLog({ ...next, orders: next.orders + 1 }, "action", `Closed the ${position.qty > 0 ? "long" : "short"} near ${price}`, now);
    position = { qty: 0, avgPx: 0 };
  } else if (out.market) {
    const delta = clipUsd(out.market, position, price, bot.allocationUsd * bot.leverage);
    const adds = position.qty === 0 || Math.sign(delta) === Math.sign(position.qty);
    if (delta === 0) {
      next = withLog(next, "info", "Skipped an order: the allocation is already fully used", now);
    } else if (adds && Math.abs(delta) < minLiveOrderUsd) {
      next = withLog(next, "info", `Skipped an order of $${Math.abs(delta).toFixed(2)}: below the $${minLiveOrderUsd} minimum`, now);
    } else {
      const verdict = adds
        ? await deps.guard(bot.declaredStop === null ? null : (Math.abs(price - bot.declaredStop) / price) * Math.abs(delta))
        : { allowed: true, reason: "" };
      if (!verdict.allowed) {
        next = withLog(next, "info", `Guardrail: ${verdict.reason}`, now);
      } else {
        await deps.enter(bot.symbol, delta, { leverage: bot.leverage, reduceOnly: !adds });
        next = withLog({ ...next, orders: next.orders + 1 }, "action", `${delta > 0 ? "Bought" : "Sold"} $${Math.abs(delta).toFixed(2)} near ${price}`, now);
        position = await deps.position(bot.symbol);
      }
    }
  }
  next = await reconcileStop(next, position, deps, now);
  return placeLimits(next, out.limits, position, price, deps, now);
}

async function settleResting(bot: LiveBot, deps: LiveDeps, now: number): Promise<{ bot: LiveBot; fills: Fill[] }> {
  if (bot.resting.length === 0) return { bot, fills: [] };
  const oids = bot.resting.map((r) => r.oid);
  await deps.cancel(bot.symbol, oids);
  const filled = await deps.orderFills(bot.symbol, oids, bot.lastCandleTime ?? 0);
  const fills: Fill[] = [];
  for (const order of bot.resting) {
    const hits = filled.filter((f) => f.oid === order.oid);
    const size = hits.reduce((sum, f) => sum + f.size, 0);
    if (size <= 0) continue;
    const time = Math.max(...hits.map((f) => f.time));
    fills.push({ time, qtyDelta: Math.sign(order.usd) * size, price: order.px, feeUsd: 0, realizedUsd: 0, reason: "limit" });
  }
  const next = fills.length > 0 ? withLog(bot, "action", `${fills.length} resting order${fills.length === 1 ? "" : "s"} filled`, now) : bot;
  return { bot: { ...next, resting: [] }, fills };
}

export async function tickLive(input: LiveBot, deps: LiveDeps): Promise<LiveBot> {
  if (!input.enabled || input.status === "halted") return input;
  const now = deps.now();
  const span = input.resolution * 1000;
  try {
    if (input.lastCandleTime === null) {
      const position = await deps.position(input.symbol);
      if (position.qty !== 0) {
        return withLog({ ...input, status: "halted", enabled: false }, "error", `You already hold a ${input.symbol} position. Close it or pick another market.`, now);
      }
      return {
        ...input,
        status: "watching",
        startedAt: input.startedAt ?? now,
        lastCandleTime: Math.floor(now / span) * span - span,
        errorStreak: 0,
        lastCheck: { at: now, message: "Started. The first move comes after the next candle closes" },
      };
    }

    const anchor = input.startedAt ?? input.lastCandleTime;
    const raw = await deps.candles(input.symbol, input.resolution, anchor - warmupCandles * span);
    const closed = raw.filter((c) => c.time + span <= now);
    const fresh = closed.filter((c) => c.time > input.lastCandleTime!);
    const latest = closed[closed.length - 1];

    if (!latest || fresh.length === 0) {
      const position = await deps.position(input.symbol);
      const settled = await reconcileStop(input, position, deps, now);
      const message = position.qty === 0 ? "Waiting for the next candle" : settled.stop ? "Holding, stop in place" : "Holding";
      return { ...settled, errorStreak: 0, lastCheck: { at: now, message } };
    }
    if (input.journal.length + fresh.length > maxLiveJournal) {
      return withLog({ ...input, status: "halted", enabled: false }, "error", "This bot has run for too long to resume safely. Start a new one", now);
    }

    const template = templateById(input.templateId);
    const strategy = template.create(clampParams(template, input.params));
    let declared: number | null = null;
    let upTo = 0;
    for (const entry of input.journal) {
      while (upTo < closed.length && closed[upTo]!.time <= entry.time) upTo += 1;
      const replay = strategy.step({ history: closed.slice(0, upTo), position: { qty: entry.qty, avgPrice: entry.avgPx }, fills: entry.fills ?? [], allocationUsd: input.allocationUsd });
      if (replay.stopPrice !== undefined) declared = replay.stopPrice;
    }

    const settled = await settleResting(input, deps, now);
    const position = await deps.position(input.symbol);
    const journal = [...input.journal];
    let out: StepOutput = {};
    let pending = settled.fills;
    for (const candle of fresh) {
      const index = closed.indexOf(candle);
      out = strategy.step({ history: closed.slice(0, index + 1), position: { qty: position.qty, avgPrice: position.avgPx }, fills: pending, allocationUsd: input.allocationUsd });
      if (out.stopPrice !== undefined) declared = out.stopPrice;
      journal.push(pending.length > 0 ? { time: candle.time, qty: position.qty, avgPx: position.avgPx, fills: pending } : { time: candle.time, qty: position.qty, avgPx: position.avgPx });
      pending = [];
    }

    let next: LiveBot = {
      ...settled.bot,
      journal,
      lastCandleTime: latest.time,
      declaredStop: declared,
      errorStreak: 0,
      lastCheck: { at: now, message: fresh.length > 1 ? `Caught up ${fresh.length} candles` : "Checked the latest candle" },
    };
    try {
      next = await execute(next, out, position, latest.close, deps, now);
    } catch (error) {
      next = failure(next, error, now);
    }
    return next;
  } catch (error) {
    return failure(input, error, now);
  }
}

export async function pauseLive(bot: LiveBot, deps: Pick<LiveDeps, "cancel">, now: number): Promise<LiveBot> {
  if (bot.resting.length > 0) await deps.cancel(bot.symbol, bot.resting.map((r) => r.oid));
  const note = bot.stop ? "Paused. The position and its exchange stop stay in place" : "Paused";
  return withLog({ ...bot, enabled: false, status: bot.status === "halted" ? "halted" : "idle", resting: [] }, "info", note, now);
}

export async function closeLive(bot: LiveBot, deps: Pick<LiveDeps, "cancel" | "exit" | "position">, now: number): Promise<LiveBot> {
  const oids = [...bot.resting.map((r) => r.oid), ...(bot.stop ? [bot.stop.oid] : [])];
  if (oids.length > 0) await deps.cancel(bot.symbol, oids).catch(() => undefined);
  const position = await deps.position(bot.symbol);
  if (position.qty !== 0) await deps.exit(bot.symbol);
  const note = position.qty !== 0 ? `Stopped and closed the ${position.qty > 0 ? "long" : "short"}` : "Stopped. Nothing was open";
  return withLog({ ...bot, enabled: false, status: "idle", resting: [], stop: null, declaredStop: null, orders: bot.orders + (position.qty !== 0 ? 1 : 0) }, "action", note, now);
}

export type LiveAction = "enable" | "pause" | "close" | "remove";

function issued(issuedAt: number): string {
  return new Date(issuedAt).toISOString();
}

export function liveActionMessage(botId: string, action: LiveAction, issuedAt: number): string {
  return `${action[0]!.toUpperCase()}${action.slice(1)} live bot ${botId} on OpenCash.\nIssued: ${issued(issuedAt)}`;
}

export function liveStopAllMessage(owner: string, network: string, close: boolean, issuedAt: number): string {
  return `Stop all my OpenCash bots${close ? " and close their positions" : ""}.\nOwner: ${owner.toLowerCase()}\nNetwork: ${network}\nIssued: ${issued(issuedAt)}`;
}
