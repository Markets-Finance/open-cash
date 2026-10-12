import type { StrategyIssue } from "../strategy/types.js";
import type { StrategyCard } from "../strategy/types.js";
import { maxLogEntries, type Bot, type BotLogEntry, type BotLogLevel } from "./types.js";

export type HeldLeg = {
  symbol: string;
  direction: "long" | "short";
  depositUsd: number;
  pnlUsd: number;
};

export type EntryCheck = { ok: boolean; reason: string; carryAprPct: number | null };

export type BotDeps = {
  now: () => number;
  heldLegs: (card: StrategyCard) => Promise<HeldLeg[]>;
  checkEntry: (card: StrategyCard, minCarryAprPct: number) => Promise<EntryCheck>;
  signalGate?: (card: StrategyCard) => Promise<{ ok: boolean; reason: string }>;
  open: (card: StrategyCard) => Promise<{ txHash?: string }>;
  close: (card: StrategyCard) => Promise<{ txHash?: string }>;
  protect?: (card: StrategyCard) => Promise<string[]>;
};

export type StopReason = "stop" | "target";

export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function blockingIssues(issues: StrategyIssue[]): StrategyIssue[] {
  return issues.filter((issue) => issue.severity === "error");
}

export function exitReason(card: StrategyCard, held: HeldLeg[]): StopReason | null {
  const deposit = held.reduce((sum, leg) => sum + leg.depositUsd, 0);
  if (deposit <= 0) return null;
  const pnlPct = (held.reduce((sum, leg) => sum + leg.pnlUsd, 0) / deposit) * 100;
  if (pnlPct <= -card.stopLossPct) return "stop";
  if (card.takeProfitPct !== undefined && pnlPct >= card.takeProfitPct) return "target";
  return null;
}

function withLog(bot: Bot, level: BotLogLevel, message: string, at: number, txHash?: string): Bot {
  const entry: BotLogEntry = { at, level, message, ...(txHash ? { txHash } : {}) };
  return { ...bot, log: [entry, ...bot.log].slice(0, maxLogEntries) };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function tickBot(input: Bot, deps: BotDeps): Promise<Bot> {
  if (!input.enabled || input.status === "halted") return input;
  const now = deps.now();
  let bot: Bot = input;

  try {
    const held = await deps.heldLegs(bot.card);

    if (held.length > 0) {
      if (deps.protect) {
        try {
          const placed = await deps.protect(bot.card);
          if (placed.length > 0) bot = withLog(bot, "action", `Exchange stop placed: ${placed.join(", ")}`, now);
        } catch (error) {
          bot = withLog(bot, "error", `Could not place an exchange stop: ${message(error)}`, now);
        }
      }
      const reason = exitReason(bot.card, held);
      if (reason === null) {
        const pnl = held.reduce((sum, leg) => sum + leg.pnlUsd, 0);
        return { ...bot, status: "open", errorStreak: 0, lastCheck: { at: now, message: `Holding, PnL ${pnl.toFixed(2)} USD` } };
      }
      const pnl = held.reduce((sum, leg) => sum + leg.pnlUsd, 0);
      const { txHash } = await deps.close(bot.card);
      bot = withLog(bot, "action", `${reason === "stop" ? "Stop" : "Target"} hit, closed at ${pnl.toFixed(2)} USD`, now, txHash);
      return {
        ...bot,
        status: bot.mode === "auto" ? "watching" : "stopped",
        enabled: bot.mode === "auto",
        realizedPnlUsd: bot.realizedPnlUsd + pnl,
        errorStreak: 0,
      };
    }

    if (bot.mode === "guard") {
      return {
        ...bot,
        status: "watching",
        errorStreak: 0,
        lastCheck: { at: now, message: "No open position to guard" },
      };
    }

    const today = dayKey(now);
    const opens = bot.opensToday.day === today ? bot.opensToday.count : 0;
    const coolingUntil = bot.lastOpenAt === null ? 0 : bot.lastOpenAt + bot.rules.cooldownMin * 60_000;
    if (opens >= bot.rules.maxOpensPerDay) {
      return { ...bot, status: "watching", lastCheck: { at: now, message: "Daily open limit reached" } };
    }
    if (now < coolingUntil) {
      return { ...bot, status: "watching", lastCheck: { at: now, message: "Cooling down after the last open" } };
    }

    const check = await deps.checkEntry(bot.card, bot.rules.minCarryAprPct);
    bot = { ...bot, lastCheck: { at: now, message: check.reason } };
    if (!check.ok) return bot.status === "watching" ? bot : { ...bot, status: "watching" };

    if (bot.card.signal === "nansen" && deps.signalGate) {
      const gate = await deps.signalGate(bot.card);
      if (!gate.ok) {
        bot = { ...bot, lastCheck: { at: now, message: `Waiting on Nansen: ${gate.reason}` } };
        return bot.status === "watching" ? bot : { ...bot, status: "watching" };
      }
      check.reason = `${check.reason}. Nansen: ${gate.reason}`;
    }

    const { txHash } = await deps.open(bot.card);
    let placed: string[] = [];
    if (deps.protect) {
      try {
        placed = await deps.protect(bot.card);
      } catch (error) {
        await deps.close(bot.card);
        throw new Error(`Opened, then closed because the exchange stop could not be placed: ${message(error)}`);
      }
    }
    bot = withLog(bot, "action", `Opened ${bot.card.name}. ${check.reason}${placed.length > 0 ? `. Exchange stop placed: ${placed.join(", ")}` : ""}`, now, txHash);
    return {
      ...bot,
      status: "open",
      lastOpenAt: now,
      opensToday: { day: today, count: opens + 1 },
      errorStreak: 0,
    };
  } catch (error) {
    const streak = bot.errorStreak + 1;
    bot = withLog(bot, "error", message(error), now);
    if (streak >= bot.rules.maxErrors) {
      return withLog({ ...bot, errorStreak: streak, status: "halted", enabled: false }, "error", `Halted after ${streak} errors in a row`, now);
    }
    return { ...bot, errorStreak: streak };
  }
}
