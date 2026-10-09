import assert from "node:assert/strict";
import type { Candle } from "../analysis/types.js";
import { library, paperFromBot, runPaper, simulate, templateById, defaultSimOptions, type SimOptions, type Strategy } from "./index.js";

const hour = 3_600_000;
const base: SimOptions = { ...defaultSimOptions, allocationUsd: 1000, maxLeverage: 3, takerFeeBps: 0, makerFeeBps: 0, slippageBps: 0 };

function candle(i: number, open: number, high: number, low: number, close: number): Candle {
  return { time: i * hour, open, high, low, close, volume: 0 };
}

function once(market: number, stopPrice?: number): Strategy {
  let sent = false;
  return {
    step() {
      if (sent) return {};
      sent = true;
      return { market, stopPrice: stopPrice ?? null };
    },
  };
}

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

{
  const r = simulate(once(1000), [candle(0, 100, 100, 100, 100), candle(1, 100, 110, 100, 110)], base);
  close(r.metrics.netPnlUsd, 100);
  close(r.metrics.returnPct, 10);
}
{
  const r = simulate(once(1000), [candle(0, 100, 100, 100, 100), candle(1, 100, 110, 100, 110)], { ...base, takerFeeBps: 10 });
  close(r.metrics.netPnlUsd, 99);
  close(r.metrics.feesUsd, 1);
}
{
  const r = simulate(once(1000, 95), [candle(0, 100, 100, 100, 100), candle(1, 100, 101, 90, 92)], base);
  close(r.metrics.netPnlUsd, -50);
  assert.equal(r.fills[1]!.reason, "stop");
}
{
  const r = simulate(once(1000, 90), [candle(0, 100, 100, 100, 100), candle(1, 100, 100, 100, 100), candle(2, 85, 86, 80, 82)], base);
  close(r.metrics.netPnlUsd, -150);
}
{
  const r = simulate(once(1000), [candle(0, 100, 100, 100, 100), candle(1, 100, 100, 100, 100)], {
    ...base,
    funding: [{ timeMs: hour + 1000, hourlyRate: 0.001 }],
  });
  close(r.metrics.fundingUsd, -1);
  const short = simulate(once(-1000), [candle(0, 100, 100, 100, 100), candle(1, 100, 100, 100, 100)], {
    ...base,
    funding: [{ timeMs: hour + 1000, hourlyRate: 0.001 }],
  });
  close(short.metrics.fundingUsd, 1);
}
{
  const r = simulate(once(100000), [candle(0, 100, 100, 100, 100), candle(1, 100, 100, 100, 100)], base);
  close(Math.abs(r.fills[0]!.qtyDelta) * 100, 3000);
}
{
  const r = simulate(once(3000), [candle(0, 100, 100, 100, 100), candle(1, 100, 100, 30, 30)], base);
  assert.equal(r.metrics.liquidated, true);
}

{
  let step = 0;
  const roundTrip: Strategy = { step: () => (++step === 1 ? { market: 1000 } : step === 2 ? { flat: true } : {}) };
  const r = simulate(roundTrip, [candle(0, 100, 100, 100, 100), candle(1, 100, 100, 100, 100), candle(2, 120, 120, 120, 120), candle(3, 120, 120, 120, 120)], base);
  close(r.fills.reduce((sum, f) => sum + f.qtyDelta, 0), 0, 1e-12);
  close(r.metrics.netPnlUsd, 200);
}

{
  const rise = Array.from({ length: 30 }, (_, i) => candle(i, 100, 101, 99, 100));
  const series = [...rise, candle(30, 100, 106, 100, 105), candle(31, 105, 108, 104, 107), candle(32, 107, 110, 106, 109), candle(33, 109, 110, 90, 91)];
  const strat = templateById("donchian").create({ ...templateById("donchian").defaults, shorts: 0 });
  const r = simulate(strat, series, { ...base, maxLeverage: 5 });
  assert.ok(r.fills.length >= 2, "donchian enters and exits");
  assert.ok(r.fills[0]!.qtyDelta > 0 && r.fills[0]!.time === 31 * hour, "enters next open after breakout close");
  assert.ok(r.metrics.maxDrawdownPct >= 0);
}

{
  const series = [
    candle(0, 100, 100, 100, 100),
    candle(1, 100, 100, 94, 95),
    candle(2, 95, 101, 95, 100),
    candle(3, 100, 100, 100, 100),
  ];
  const strat = templateById("grid").create({ rangePct: 10, levels: 5, usdPerLevel: 100 });
  const r = simulate(strat, series, base);
  const buys = r.fills.filter((f) => f.qtyDelta > 0);
  const sells = r.fills.filter((f) => f.qtyDelta < 0);
  assert.ok(buys.length >= 1 && sells.length >= 1, "grid buys the dip and sells the bounce");
  assert.ok(r.metrics.returnPct > 0, "grid nets a profit on a round trip");
}

{
  const series = Array.from({ length: 80 }, (_, i) => candle(i, 100 + i, 101 + i, 99 + i, 100 + i));
  const bot = paperFromBot("p", "trail", "BTC", 3600, { side: 1, trailPct: 5, targetPct: 0, leverage: 1 }, 500, 40 * hour);
  const r = runPaper(bot, series, base);
  assert.ok(r.fills.every((f) => f.time >= 40 * hour), "paper never trades before start");
  assert.equal(r.candles, 40);
}

for (const template of library) {
  const series = Array.from({ length: 200 }, (_, i) => {
    const p = 100 + 15 * Math.sin(i / 9) + i * 0.05;
    return candle(i, p, p + 1, p - 1, p + 0.3);
  });
  const r = simulate(template.create(template.defaults), series, defaultSimOptions);
  assert.ok(Number.isFinite(r.metrics.returnPct), `${template.id} returns a finite result`);
  console.log(template.id.padEnd(9), r.metrics.returnPct.toFixed(2).padStart(7), "%", `fills ${r.fills.length}`, `dd ${r.metrics.maxDrawdownPct.toFixed(1)}%`);
}

console.log("simulate checks passed");
