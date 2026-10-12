import assert from "node:assert/strict";
import type { StrategyCard } from "../strategy/types.js";
import { tickBot, type BotDeps, type HeldLeg } from "./engine.js";
import { createBot } from "./types.js";

const card: StrategyCard = { name: "Test", thesis: "", kind: "basket", marginUsd: 100, stopLossPct: 8, legs: [{ symbol: "ETH", direction: "long", weightBps: 10000, leverage: 2 }] } as StrategyCard;
const now = Date.UTC(2026, 9, 13, 12);

function deps(over: Partial<BotDeps> & { held?: HeldLeg[] }): BotDeps & { calls: string[] } {
  const calls: string[] = [];
  let held = over.held ?? [];
  return {
    calls,
    now: () => now,
    heldLegs: async () => held,
    checkEntry: async () => ({ ok: true, reason: "ok", carryAprPct: null }),
    open: async () => {
      calls.push("open");
      held = [{ symbol: "ETH", direction: "long", depositUsd: 100, pnlUsd: 0 }];
      return {};
    },
    close: async () => {
      calls.push("close");
      held = [];
      return {};
    },
    protect: async () => {
      calls.push("protect");
      return ["stop ETH at 2000"];
    },
    ...over,
  };
}

const auto = { ...createBot("a", "auto", card, now), enabled: true, status: "watching" as const };

const ok = deps({});
const opened = await tickBot(auto, ok);
assert.deepEqual(ok.calls, ["open", "protect"], "stop placed right after open");
assert.equal(opened.status, "open");
assert.match(opened.log[0].message, /Exchange stop placed: stop ETH at 2000/);

const failing = deps({
  protect: async () => {
    failing.calls.push("protect");
    throw new Error("rejected");
  },
});
const closed = await tickBot(auto, failing);
assert.deepEqual(failing.calls, ["open", "protect", "close"], "closed when the stop cannot be placed");
assert.equal(closed.errorStreak, 1);
assert.match(closed.log[0].message, /closed because the exchange stop could not be placed: rejected/);

const guard = { ...createBot("g", "guard", card, now), enabled: true, status: "watching" as const };
const holding = deps({ held: [{ symbol: "ETH", direction: "long", depositUsd: 100, pnlUsd: -2 }] });
const guarded = await tickBot(guard, holding);
assert.deepEqual(holding.calls, ["protect"], "held position gets protected, not closed");
assert.equal(guarded.status, "open");

const broken = deps({
  held: [{ symbol: "ETH", direction: "long", depositUsd: 100, pnlUsd: -2 }],
  protect: async () => {
    throw new Error("no market");
  },
});
const still = await tickBot(guard, broken);
assert.equal(still.status, "open", "a failed protect on a held position never closes it");
assert.match(still.log[0].message, /Could not place an exchange stop: no market/);

const stopped = deps({ held: [{ symbol: "ETH", direction: "long", depositUsd: 100, pnlUsd: -9 }] });
await tickBot(guard, stopped);
assert.deepEqual(stopped.calls, ["protect", "close"], "bot-side stop still closes past the limit");

console.log("bots protect: ok");
