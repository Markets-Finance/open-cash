import type { Address } from "viem";

export type Snapshot = { time: number; value: number };

export type HistoryRange = "1d" | "7d" | "30d" | "all";

const minGapMs = 60_000;

function key(owner: Address): string {
  return `opencash.portfolio.${owner.toLowerCase()}`;
}

export function loadHistory(owner: Address): Snapshot[] {
  try {
    return JSON.parse(localStorage.getItem(key(owner)) ?? "[]") as Snapshot[];
  } catch {
    return [];
  }
}

export function recordSnapshot(owner: Address, value: number): Snapshot[] {
  const history = loadHistory(owner);
  const last = history[history.length - 1];
  const now = Date.now();
  if (!last || now - last.time >= minGapMs) history.push({ time: now, value });
  try {
    localStorage.setItem(key(owner), JSON.stringify(history.slice(-2000)));
  } catch {
    return history;
  }
  return history;
}

export function filterHistory(history: Snapshot[], range: HistoryRange): Snapshot[] {
  if (range === "all") return history;
  const days = range === "1d" ? 1 : range === "7d" ? 7 : 30;
  const cutoff = Date.now() - days * 86_400_000;
  return history.filter((snapshot) => snapshot.time >= cutoff);
}
