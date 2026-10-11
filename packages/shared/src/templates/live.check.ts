import assert from "node:assert/strict";
import type { Candle } from "../analysis/types.js";
import { closeLive, createLiveBot, liveDigest, liveIssues, pauseLive, tickLive, type LiveBot, type LiveDeps, type LiveOrderFill } from "./live.js";

const hour = 3_600_000;
const t0 = 1_000 * hour;

function flatCandles(count: number, price: number, start = t0 - 300 * hour): Candle[] {
  return Array.from({ length: count }, (_, i) => ({ time: start + i * hour, open: price, high: price * 1.001, low: price * 0.999, close: price, volume: 0 }));
}

type Exchange = {
  clock: number;
  candles: Candle[];
  qty: number;
  avg: number;
  stops: Map<number, number>;
  resting: Map<number, { px: number; usd: number }>;
  fills: LiveOrderFill[];
  calls: string[];
  failStop: boolean;
  failCandles: boolean;
  allow: boolean;
  nextOid: number;
};

function exchange(candles: Candle[]): Exchange {
  return { clock: t0, candles, qty: 0, avg: 0, stops: new Map(), resting: new Map(), fills: [], calls: [], failStop: false, failCandles: false, allow: true, nextOid: 1 };
}

function mark(x: Exchange): number {
  return x.candles.filter((c) => c.time + hour <= x.clock).at(-1)!.close;
}

function deps(x: Exchange): LiveDeps {
  return {
    now: () => x.clock,
    candles: async (_s, _r, since) => {
      if (x.failCandles) throw new Error("candles down");
      return x.candles.filter((c) => c.time >= since);
    },
    position: async () => ({ qty: x.qty, avgPx: x.avg }),
    guard: async (maxLoss) => {
      x.calls.push(`guard:${maxLoss === null ? "none" : maxLoss.toFixed(2)}`);
      return x.allow ? { allowed: true, reason: "" } : { allowed: false, reason: "limit" };
    },
    enter: async (_s, usd, { reduceOnly }) => {
      const px = mark(x);
      const qty = usd / px;
      x.avg = x.qty === 0 || Math.sign(qty) !== Math.sign(x.qty) ? px : (x.avg * x.qty + px * qty) / (x.qty + qty);
      x.qty += qty;
      x.calls.push(`enter:${Math.round(usd)}${reduceOnly ? ":reduce" : ""}`);
    },
    exit: async () => {
      x.calls.push("exit");
      x.qty = 0;
      x.avg = 0;
    },
    placeStop: async (_s, px) => {
      if (x.failStop) throw new Error("stop rejected");
      const oid = x.nextOid++;
      x.stops.set(oid, px);
      x.calls.push(`stop:${px.toFixed(2)}`);
      return oid;
    },
    cancel: async (_s, oids) => {
      for (const oid of oids) {
        x.stops.delete(oid);
        x.resting.delete(oid);
      }
      x.calls.push(`cancel:${oids.length}`);
    },
    placeLimits: async (_s, orders) =>
      orders.map((o) => {
        const oid = x.nextOid++;
        x.resting.set(oid, { px: o.px, usd: o.usd });
        return oid;
      }),
    orderFills: async (_s, oids) => x.fills.filter((f) => oids.includes(f.oid)),
  };
}

function enabled(bot: LiveBot): LiveBot {
  return { ...bot, enabled: true, status: "watching" };
}

function roundTrip(bot: LiveBot): LiveBot {
  return JSON.parse(JSON.stringify(bot)) as LiveBot;
}

function addCandle(x: Exchange, close: number, high = close, low = close) {
  const last = x.candles.at(-1)!;
  x.candles.push({ time: last.time + hour, open: last.close, high: Math.max(high, close), low: Math.min(low, close), close, volume: 0 });
  x.clock = last.time + 2 * hour;
}

{
  const spec = { templateId: "donchian" as const, symbol: "ETH", resolution: 3600, params: { entryN: 20, exitN: 10, stopAtr: 2, riskPct: 2, shorts: 0 }, allocationUsd: 1000, leverage: 3 };
  assert.deepEqual(liveIssues(spec), []);
  assert.equal(liveDigest(spec), liveDigest({ ...spec, params: { shorts: 0, riskPct: 2, stopAtr: 2, exitN: 10, entryN: 20 } }));
  assert.notEqual(liveDigest(spec), liveDigest({ ...spec, allocationUsd: 1001 }));
  assert.ok(liveIssues({ ...spec, leverage: 9 }).length > 0);
  assert.ok(liveIssues({ ...spec, resolution: 60 }).length > 0);
  assert.ok(liveIssues({ ...spec, allocationUsd: 5 }).length > 0);
  assert.ok(liveIssues({ ...spec, templateId: "nope" as never }).length > 0);

  const x = exchange(flatCandles(300, 100));
  x.clock = x.candles.at(-1)!.time + hour + 60_000;
  let bot = enabled(createLiveBot(spec, x.clock));
  bot = await tickLive(bot, deps(x));
  assert.equal(bot.status, "watching");
  assert.equal(bot.lastCandleTime, x.candles.at(-1)!.time);
  assert.equal(x.calls.length, 0);

  bot = await tickLive(bot, deps(x));
  assert.equal(x.calls.length, 0, "no new candle means no action");

  addCandle(x, 110, 110, 100);
  bot = await tickLive(roundTrip(bot), deps(x));
  assert.ok(x.qty > 0, "breakout bought");
  assert.equal(x.stops.size, 1, "stop placed after entry");
  assert.equal(bot.status, "open");
  assert.ok(bot.stop && bot.stop.px < 110);
  assert.ok(x.calls[0]!.startsWith("guard:"), "guardrail asked before an entry");
  const ordersAfterEntry = bot.orders;
  assert.equal(ordersAfterEntry, 2);

  addCandle(x, 111);
  const before = x.calls.length;
  bot = await tickLive(roundTrip(bot), deps(x));
  assert.equal(x.calls.slice(before).filter((c) => c.startsWith("enter")).length, 0, "replay does not re-enter after restart");
  assert.equal(x.stops.size, 1, "stop unchanged");

  addCandle(x, 95, 111, 95);
  bot = await tickLive(roundTrip(bot), deps(x));
  assert.equal(x.qty, 0, "exit window closed the long");
  assert.equal(x.stops.size, 0, "stop cancelled with the position");
  assert.equal(bot.status, "watching");
}

{
  const x = exchange(flatCandles(300, 100));
  x.clock = x.candles.at(-1)!.time + hour;
  let bot = enabled(createLiveBot({ templateId: "trail", symbol: "BTC", resolution: 3600, params: { side: 1, trailPct: 5, targetPct: 0, leverage: 2 }, allocationUsd: 100, leverage: 2 }, x.clock));
  bot = await tickLive(bot, deps(x));
  addCandle(x, 100);
  bot = await tickLive(bot, deps(x));
  assert.ok(Math.abs(x.qty * 100 - 200) < 1e-6, "trail entered allocation x leverage");
  assert.equal([...x.stops.values()][0]!.toFixed(2), "95.00");
  addCandle(x, 120, 120, 100);
  bot = await tickLive(roundTrip(bot), deps(x));
  assert.equal([...x.stops.values()][0]!.toFixed(2), "114.00", "stop ratchets after restart replay");
  assert.equal(x.stops.size, 1, "old stop replaced, not duplicated");
  x.qty = 0;
  addCandle(x, 113);
  bot = await tickLive(roundTrip(bot), deps(x));
  assert.equal(x.stops.size, 0, "stop removed once the exchange closed the position");
  addCandle(x, 140);
  const before = x.calls.length;
  bot = await tickLive(roundTrip(bot), deps(x));
  assert.equal(x.calls.slice(before).filter((c) => c.startsWith("enter")).length, 0, "trail stands down after its exit");
}

{
  const x = exchange(flatCandles(300, 100));
  x.clock = x.candles.at(-1)!.time + hour;
  x.allow = false;
  let bot = enabled(createLiveBot({ templateId: "trail", symbol: "BTC", resolution: 3600, params: { side: 1, trailPct: 5, targetPct: 0, leverage: 1 }, allocationUsd: 100, leverage: 1 }, x.clock));
  bot = await tickLive(bot, deps(x));
  addCandle(x, 100);
  bot = await tickLive(bot, deps(x));
  assert.equal(x.qty, 0, "guardrail blocked the entry");
  assert.ok(bot.log.some((l) => l.message.startsWith("Guardrail")));
}

{
  const x = exchange(flatCandles(300, 100));
  x.clock = x.candles.at(-1)!.time + hour;
  x.failStop = true;
  let bot = enabled(createLiveBot({ templateId: "trail", symbol: "BTC", resolution: 3600, params: { side: 1, trailPct: 5, targetPct: 0, leverage: 1 }, allocationUsd: 100, leverage: 1 }, x.clock));
  bot = await tickLive(bot, deps(x));
  addCandle(x, 100);
  bot = await tickLive(bot, deps(x));
  assert.equal(x.qty, 0, "position closed when the stop could not be placed");
  assert.ok(x.calls.includes("exit"));
  assert.ok(bot.log.some((l) => l.message.includes("Could not place the stop")));
}

{
  const x = exchange(flatCandles(300, 100));
  x.clock = x.candles.at(-1)!.time + hour;
  let bot = enabled(createLiveBot({ templateId: "dca", symbol: "ETH", resolution: 3600, params: { everyN: 1, buyUsd: 40, dipPct: 0, stopPct: 0 }, allocationUsd: 100, leverage: 1 }, x.clock));
  bot = await tickLive(bot, deps(x));
  for (let i = 0; i < 4; i += 1) {
    addCandle(x, 100);
    bot = await tickLive(roundTrip(bot), deps(x));
  }
  assert.ok(Math.abs(x.qty * 100 - 80) < 1e-6, `DCA stops at the allocation (held $${(x.qty * 100).toFixed(2)})`);
  assert.equal(x.stops.size, 0, "no stop when stopPct is 0");
}

{
  const x = exchange(flatCandles(300, 100));
  x.clock = x.candles.at(-1)!.time + hour;
  let bot = enabled(createLiveBot({ templateId: "grid", symbol: "ETH", resolution: 3600, params: { rangePct: 10, levels: 5, usdPerLevel: 20 }, allocationUsd: 200, leverage: 1 }, x.clock));
  bot = await tickLive(bot, deps(x));
  addCandle(x, 100);
  bot = await tickLive(bot, deps(x));
  assert.equal(bot.resting.length, 5, "five buy rungs resting below");
  assert.ok(bot.resting.every((r) => r.usd > 0 && r.px < 100));
  const firstRung = bot.resting.reduce((a, b) => (a.px > b.px ? a : b));
  x.fills.push({ oid: firstRung.oid, size: 20 / firstRung.px, time: x.clock });
  x.qty = 20 / firstRung.px;
  x.avg = firstRung.px;
  addCandle(x, 99, 100, 97);
  bot = await tickLive(roundTrip(bot), deps(x));
  const sells = bot.resting.filter((r) => r.usd < 0);
  assert.equal(sells.length, 1, "filled rung gets a sell one rung higher");
  assert.ok(Math.abs(sells[0]!.px - 100) < 1e-9);
  assert.equal(bot.journal.at(-1)!.fills?.length, 1, "fill journaled for replay");
  addCandle(x, 99);
  bot = await tickLive(roundTrip(bot), deps(x));
  assert.equal(bot.resting.filter((r) => r.usd < 0).length, 1, "replayed state keeps the sell");

  bot = await pauseLive(bot, deps(x), x.clock);
  assert.equal(bot.enabled, false);
  assert.equal(bot.resting.length, 0, "pause cancels resting orders");
  assert.equal(x.resting.size, 0);
  assert.ok(x.qty > 0, "pause keeps the position");

  bot = await closeLive(bot, deps(x), x.clock);
  assert.equal(x.qty, 0, "close flattens");
}

{
  const x = exchange(flatCandles(300, 100));
  x.clock = x.candles.at(-1)!.time + hour;
  x.qty = 1;
  const bot = await tickLive(enabled(createLiveBot({ templateId: "dca", symbol: "ETH", resolution: 3600, params: {}, allocationUsd: 100, leverage: 1 }, x.clock)), deps(x));
  assert.equal(bot.status, "halted", "refuses to adopt an existing position");
}

{
  const x = exchange(flatCandles(300, 100));
  x.clock = x.candles.at(-1)!.time + hour;
  let bot = enabled(createLiveBot({ templateId: "dca", symbol: "ETH", resolution: 3600, params: {}, allocationUsd: 100, leverage: 1 }, x.clock));
  bot = await tickLive(bot, deps(x));
  x.failCandles = true;
  for (let i = 0; i < 3; i += 1) bot = await tickLive(bot, deps(x));
  assert.equal(bot.status, "halted", "halts after repeated errors");
  assert.equal(bot.enabled, false);
}

console.log("live checks passed");
