import { atr, highest, lowest } from "./indicators.js";
import type { Template } from "./types.js";

export const donchian: Template = {
  id: "donchian",
  name: "Donchian breakout",
  blurb: "Buy a new high, sell a new low, cut losses at a multiple of volatility.",
  params: [
    { key: "entryN", label: "Entry window", min: 5, max: 100, step: 1, unit: "candles" },
    { key: "exitN", label: "Exit window", min: 3, max: 50, step: 1, unit: "candles" },
    { key: "stopAtr", label: "Stop distance", min: 1, max: 5, step: 0.5, unit: "x ATR" },
    { key: "riskPct", label: "Risk per trade", min: 0.5, max: 5, step: 0.5, unit: "%" },
    {
      key: "shorts",
      label: "Direction",
      min: 0,
      max: 1,
      step: 1,
      options: [
        { value: 0, label: "Long only" },
        { value: 1, label: "Long and short" },
      ],
    },
  ],
  defaults: { entryN: 20, exitN: 10, stopAtr: 2, riskPct: 2, shorts: 1 },
  create(params) {
    let stop: number | null = null;
    return {
      step({ history, position, allocationUsd }) {
        const last = history[history.length - 1]!;
        if (position.qty === 0) {
          stop = null;
          if (history.length <= params.entryN! + 1) return {};
          const volatility = atr(history, 14);
          if (volatility <= 0) return {};
          const stopDistance = volatility * params.stopAtr!;
          const notional = ((allocationUsd * params.riskPct!) / 100) * (last.close / stopDistance);
          if (last.close > highest(history, params.entryN!, 1)) {
            stop = last.close - stopDistance;
            return { market: notional, stopPrice: stop };
          }
          if (params.shorts === 1 && last.close < lowest(history, params.entryN!, 1)) {
            stop = last.close + stopDistance;
            return { market: -notional, stopPrice: stop };
          }
          return {};
        }
        const long = position.qty > 0;
        const exit = long
          ? last.close < lowest(history, params.exitN!, 1)
          : last.close > highest(history, params.exitN!, 1);
        if (exit) return { flat: true, stopPrice: null };
        return { stopPrice: stop };
      },
    };
  },
};
