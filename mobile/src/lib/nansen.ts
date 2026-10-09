import { nansen, type nansen as NansenShared } from "shared";
import { backendUrl } from "./config";

type Pulse = NansenShared.SmartPulse;

const ttlMs = 10 * 60_000;
const cache = new Map<string, { at: number; value: Map<string, Pulse> | null }>();

export async function loadPulses(symbols: string[]): Promise<Map<string, Pulse> | null> {
  const wanted = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))].sort();
  const key = wanted.join(",");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  let value: Map<string, Pulse> | null = null;
  try {
    const response = await fetch(`${backendUrl}/nansen/pulse?symbols=${key}`);
    if (response.ok) {
      const body = (await response.json()) as { pulses: Pulse[] };
      value = new Map(body.pulses.map((pulse) => [pulse.symbol, pulse]));
    }
  } catch {
    value = null;
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function pulseList(symbols: string[]): Promise<Pulse[] | null> {
  const map = await loadPulses(symbols);
  if (!map) return null;
  return symbols.map((symbol) => map.get(symbol.toUpperCase())).filter((pulse): pulse is Pulse => pulse !== undefined);
}

export function flowText(value: number): string {
  const abs = Math.abs(value);
  const sign = value >= 0 ? "+" : "−";
  const text = abs >= 1e6 ? `${(abs / 1e6).toFixed(2)}M` : abs >= 1e3 ? `${(abs / 1e3).toFixed(1)}K` : abs.toFixed(0);
  return `${sign}$${text}`;
}

export const stanceLabel = (stance: NansenShared.Stance) => (stance === "buying" ? "Buying" : stance === "selling" ? "Selling" : "Flat");

export const agreementFor = nansen.binAgreement;
