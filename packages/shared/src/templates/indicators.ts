import type { Candle } from "../analysis/types.js";

export function highest(candles: Candle[], count: number, skipLast = 0): number {
  const end = candles.length - skipLast;
  let value = -Infinity;
  for (let i = Math.max(0, end - count); i < end; i += 1) value = Math.max(value, candles[i]!.high);
  return value;
}

export function lowest(candles: Candle[], count: number, skipLast = 0): number {
  const end = candles.length - skipLast;
  let value = Infinity;
  for (let i = Math.max(0, end - count); i < end; i += 1) value = Math.min(value, candles[i]!.low);
  return value;
}

export function atr(candles: Candle[], count: number): number {
  if (candles.length < 2) return 0;
  const start = Math.max(1, candles.length - count);
  let total = 0;
  let n = 0;
  for (let i = start; i < candles.length; i += 1) {
    const c = candles[i]!;
    const prev = candles[i - 1]!.close;
    total += Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
    n += 1;
  }
  return n === 0 ? 0 : total / n;
}
