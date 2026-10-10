import assert from "node:assert/strict";
import { computeLoss, evaluateGuardrails, guardrailIssues, isLoosening, utcDayStart } from "./evaluate.js";
import { defaultGuardrails, type GuardrailLoss } from "./types.js";

const now = Date.UTC(2026, 9, 10, 15, 0, 0);
const day = utcDayStart(now);
const loss = (lossTodayUsd: number): GuardrailLoss => ({ realisedUsd: 0, feesUsd: 0, fundingUsd: 0, unrealisedLossUsd: 0, lossTodayUsd });
const free = { lockedUntil: null, lastBreachAt: null };

const l = computeLoss({
  fills: [
    { time: day - 1000, closedPnl: "-100", fee: "1" },
    { time: day + 1000, closedPnl: "-10", fee: "0.5" },
    { time: day + 2000, closedPnl: "4", fee: "0.5" },
  ],
  fundings: [{ time: day + 3000, delta: { usdc: "-1" } }],
  unrealisedPnls: [-3, 7],
  now,
});
assert.equal(l.lossTodayUsd, 11, "yesterday excluded, unrealised gains ignored");

assert.equal(evaluateGuardrails({ settings: defaultGuardrails, state: free, loss: loss(10), now }).allowed, true);
const breach = evaluateGuardrails({ settings: defaultGuardrails, state: free, loss: loss(50), now });
assert.equal(breach.allowed, false);
assert.equal(breach.breached, true);
assert.equal(breach.lockedUntil, now + 60 * 60_000);
const locked = evaluateGuardrails({ settings: defaultGuardrails, state: { lockedUntil: now + 1, lastBreachAt: now }, loss: loss(0), now });
assert.equal(locked.allowed, false, "lock holds even after loss drops");
assert.equal(evaluateGuardrails({ settings: defaultGuardrails, state: { lockedUntil: now - 1, lastBreachAt: now }, loss: loss(0), now }).allowed, true, "lock expires");
assert.match(evaluateGuardrails({ settings: defaultGuardrails, state: free, loss: loss(0), now, trade: { maxLossUsd: null } }).reason, /stop is required/);
assert.equal(evaluateGuardrails({ settings: defaultGuardrails, state: free, loss: loss(0), now, trade: { maxLossUsd: 21 } }).allowed, false, "per-trade limit");
assert.equal(evaluateGuardrails({ settings: defaultGuardrails, state: free, loss: loss(40), now, trade: { maxLossUsd: 15 } }).allowed, false, "remaining budget");
assert.equal(evaluateGuardrails({ settings: defaultGuardrails, state: free, loss: loss(40), now, trade: { maxLossUsd: 10 } }).allowed, true);
assert.equal(isLoosening(defaultGuardrails, { ...defaultGuardrails, dailyLossLimitUsd: 100 }), true);
assert.equal(isLoosening(defaultGuardrails, { ...defaultGuardrails, coolOffMinutes: 30 }), true);
assert.equal(isLoosening(defaultGuardrails, { ...defaultGuardrails, dailyLossLimitUsd: 20 }), false);
assert.ok(guardrailIssues({ ...defaultGuardrails, maxLossPerTradeUsd: 60 }).length > 0);
console.log("guardrail checks passed");
