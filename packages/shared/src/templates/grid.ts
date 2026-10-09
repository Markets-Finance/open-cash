import type { Template } from "./types.js";

export const grid: Template = {
  id: "grid",
  name: "Grid",
  blurb: "Rest buys below and sells above. Each dip you buy is sold one rung higher.",
  params: [
    { key: "rangePct", label: "Range below start", min: 2, max: 40, step: 1, unit: "%" },
    { key: "levels", label: "Rungs", min: 3, max: 30, step: 1 },
    { key: "usdPerLevel", label: "Per rung", min: 10, max: 200, step: 5, unit: "USD" },
  ],
  defaults: { rangePct: 12, levels: 8, usdPerLevel: 40 },
  create(params) {
    let rungs: number[] | null = null;
    const held = new Set<number>();
    let stopped = false;
    return {
      step({ history, position, fills }) {
        const last = history[history.length - 1]!;
        if (stopped) return {};
        if (!rungs) {
          const gap = (last.close * params.rangePct!) / 100 / params.levels!;
          rungs = Array.from({ length: params.levels! + 1 }, (_, k) => last.close - k * gap);
        }
        for (const fill of fills) {
          if (fill.reason !== "limit") continue;
          const index = rungs.findIndex((price) => Math.abs(price - fill.price) < 1e-9);
          if (index < 0) continue;
          if (fill.qtyDelta > 0) held.add(index);
          else held.delete(index + 1);
        }
        const floor = rungs[rungs.length - 1]!;
        if (last.close < floor * 0.99) {
          stopped = true;
          held.clear();
          return { flat: true, limits: [], stopPrice: null };
        }
        const limits = [];
        for (let k = 1; k < rungs.length; k += 1) {
          if (held.has(k)) limits.push({ price: rungs[k - 1]!, usd: -params.usdPerLevel! });
          else if (rungs[k]! < last.close) limits.push({ price: rungs[k]!, usd: params.usdPerLevel! });
        }
        return { limits };
      },
    };
  },
};
