import type { Template } from "./types.js";

export const dca: Template = {
  id: "dca",
  name: "DCA",
  blurb: "Buy a fixed amount on a schedule, or on dips, up to a hard cap.",
  params: [
    { key: "everyN", label: "Buy every", min: 1, max: 168, step: 1, unit: "candles" },
    { key: "buyUsd", label: "Each buy", min: 10, max: 500, step: 10, unit: "USD" },
    { key: "dipPct", label: "Only on dip", min: 0, max: 10, step: 0.5, unit: "%" },
    { key: "stopPct", label: "Stop below average", min: 0, max: 50, step: 1, unit: "%" },
  ],
  defaults: { everyN: 24, buyUsd: 50, dipPct: 0, stopPct: 20 },
  create(params) {
    let count = 0;
    return {
      step({ history, position, allocationUsd }) {
        const last = history[history.length - 1]!;
        count += 1;
        const held = Math.abs(position.qty) * last.close;
        const stopPrice = position.qty > 0 && params.stopPct! > 0 ? position.avgPrice * (1 - params.stopPct! / 100) : null;
        if (count % params.everyN! !== 0 || held + params.buyUsd! > allocationUsd) return { stopPrice };
        if (params.dipPct! > 0) {
          const recent = history.slice(-params.everyN! - 1);
          const peak = Math.max(...recent.map((c) => c.high));
          if (last.close > peak * (1 - params.dipPct! / 100)) return { stopPrice };
        }
        return { market: params.buyUsd!, stopPrice };
      },
    };
  },
};
