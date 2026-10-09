export function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
}

export function logReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    if (values[i - 1] > 0 && values[i] > 0) out.push(Math.log(values[i] / values[i - 1]));
  }
  return out;
}

export function annualizedVolPct(closes: number[], resolutionSec: number): number {
  const periodsPerYear = (365 * 86400) / resolutionSec;
  return stdev(logReturns(closes)) * Math.sqrt(periodsPerYear) * 100;
}

export function maxDrawdownPct(closes: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const close of closes) {
    peak = Math.max(peak, close);
    if (peak > 0) worst = Math.min(worst, (close - peak) / peak);
  }
  return worst * 100;
}

export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const x = a.slice(a.length - n);
  const y = b.slice(b.length - n);
  const mx = mean(x);
  const my = mean(y);
  let cov = 0;
  for (let i = 0; i < n; i += 1) cov += (x[i] - mx) * (y[i] - my);
  const denom = stdev(x) * stdev(y) * (n - 1);
  return denom === 0 ? 0 : cov / denom;
}

export function beta(asset: number[], benchmark: number[]): number {
  const n = Math.min(asset.length, benchmark.length);
  if (n < 3) return 0;
  const sd = stdev(benchmark.slice(benchmark.length - n));
  return sd === 0 ? 0 : (correlation(asset, benchmark) * stdev(asset.slice(asset.length - n))) / sd;
}

export function zScore(series: number[], value: number): number {
  const sd = stdev(series);
  return sd === 0 ? 0 : (value - mean(series)) / sd;
}

export function alignCloses(
  a: { time: number; close: number }[],
  b: { time: number; close: number }[],
): { times: number[]; a: number[]; b: number[] } {
  const bByTime = new Map(b.map((c) => [c.time, c.close]));
  const times: number[] = [];
  const aligned: number[] = [];
  const other: number[] = [];
  for (const candle of a) {
    const match = bByTime.get(candle.time);
    if (match === undefined) continue;
    times.push(candle.time);
    aligned.push(candle.close);
    other.push(match);
  }
  return { times, a: aligned, b: other };
}
