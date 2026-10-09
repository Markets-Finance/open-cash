import type { Template } from "./types.js";

export const trail: Template = {
  id: "trail",
  name: "Trailing stop",
  blurb: "Ride one position and ratchet the stop up behind it. Exits once, then stands down.",
  params: [
    {
      key: "side",
      label: "Direction",
      min: -1,
      max: 1,
      step: 2,
      options: [
        { value: 1, label: "Long" },
        { value: -1, label: "Short" },
      ],
    },
    { key: "trailPct", label: "Trail distance", min: 1, max: 30, step: 0.5, unit: "%" },
    { key: "targetPct", label: "Take profit", min: 0, max: 100, step: 1, unit: "%" },
    { key: "leverage", label: "Leverage", min: 1, max: 5, step: 1, unit: "x" },
  ],
  defaults: { side: 1, trailPct: 6, targetPct: 0, leverage: 2 },
  create(params) {
    let entered = false;
    let done = false;
    let extreme = 0;
    return {
      step({ history, position, allocationUsd }) {
        const last = history[history.length - 1]!;
        if (done) return {};
        if (!entered) {
          entered = true;
          extreme = last.close;
          const stop = last.close * (1 - (params.side! * params.trailPct!) / 100);
          return { market: params.side! * allocationUsd * params.leverage!, stopPrice: stop };
        }
        if (position.qty === 0) {
          done = true;
          return { stopPrice: null };
        }
        const long = position.qty > 0;
        extreme = long ? Math.max(extreme, last.high) : Math.min(extreme, last.low);
        if (params.targetPct! > 0) {
          const move = ((last.close - position.avgPrice) / position.avgPrice) * (long ? 1 : -1) * 100;
          if (move >= params.targetPct!) {
            done = true;
            return { flat: true, stopPrice: null };
          }
        }
        return { stopPrice: extreme * (1 - (params.side! * params.trailPct!) / 100) };
      },
    };
  },
};
