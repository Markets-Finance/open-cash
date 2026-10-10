import type { InfoClient } from "@nktkas/hyperliquid";
import { median } from "../analysis/stats.js";
import { loadOhlc } from "./book.js";

export type MarketKind = "crypto" | "us-equity" | "intl-equity" | "index" | "commodity" | "fx";

export type WeekendSignal = "predictive" | "weak" | "not-applicable";

export type MarketSession = {
  coin: string;
  kind: MarketKind;
  hlTrading: true;
  tradfiOpen: boolean | null;
  nextChangeAt: number | null;
  weekendSignal: WeekendSignal;
  label: string;
  caveat: string | null;
};

const indices = new Set(["SP500", "XYZ100", "JP225"]);
const commodities = new Set(["GOLD", "SILVER", "CL", "BRENTOIL", "NATGAS", "COPPER", "PLATINUM", "PALLADIUM", "HO"]);
const fx = new Set(["EUR", "JPY", "GBP"]);
const intl = new Set([
  "SKHX", "SKHY", "SMSN", "HYUNDAI", "KIOXIA", "SOFTBANK", "CXMT", "UNITREE", "ZHIPU",
  "MINIMAX", "SHEIN", "GIGADEV", "KR200", "KSTR",
]);

export function marketKind(coin: string): MarketKind {
  if (!coin.includes(":")) return "crypto";
  const base = coin.split(":")[1];
  if (indices.has(base)) return "index";
  if (commodities.has(base)) return "commodity";
  if (fx.has(base)) return "fx";
  if (intl.has(base)) return "intl-equity";
  return "us-equity";
}

const nyParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

function newYork(ms: number): { day: number; minutes: number } {
  const parts = Object.fromEntries(nyParts.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { day, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function usEquityOpen(ms: number): boolean {
  const { day, minutes } = newYork(ms);
  return day >= 1 && day <= 5 && minutes >= 570 && minutes < 960;
}

function globexOpen(ms: number): boolean {
  const { day, minutes } = newYork(ms);
  if (day === 6) return false;
  if (day === 0) return minutes >= 1080;
  if (day === 5) return minutes < 1020;
  return minutes < 1020 || minutes >= 1080;
}

function openFn(kind: MarketKind): ((ms: number) => boolean) | null {
  if (kind === "us-equity") return usEquityOpen;
  if (kind === "index" || kind === "commodity" || kind === "fx") return globexOpen;
  return null;
}

function nextChange(isOpen: (ms: number) => boolean, now: number): number | null {
  const step = 15 * 60_000;
  const start = Math.ceil(now / step) * step;
  const state = isOpen(now);
  for (let t = start; t <= now + 8 * 864e5; t += step) if (isOpen(t) !== state) return t;
  return null;
}

const caveats: Record<MarketKind, string | null> = {
  crypto: null,
  index: "Weekend prices have tracked the Monday reopen of indices well; still not a guarantee.",
  commodity: "Weekend prices have tracked the Monday reopen of commodities well; still not a guarantee.",
  fx: "FX reopens Sunday evening New York time; weekend moves are thin.",
  "us-equity": "Published research found weekend prices on single stocks no better than a coin flip at predicting the Monday open; check this stock's own record.",
  "intl-equity": "Home-market hours are not modelled; research found weekend prices on single stocks unreliable for the reopen.",
};

export function marketSession(coin: string, now: number = Date.now()): MarketSession {
  const kind = marketKind(coin);
  const isOpen = openFn(kind);
  const weekendSignal: WeekendSignal =
    kind === "crypto" ? "not-applicable" : kind === "index" || kind === "commodity" ? "predictive" : "weak";
  if (!isOpen) {
    return {
      coin,
      kind,
      hlTrading: true,
      tradfiOpen: null,
      nextChangeAt: null,
      weekendSignal,
      label: kind === "crypto" ? "Trades 24/7" : "Trades 24/7 on Hyperliquid; home market hours not shown",
      caveat: caveats[kind],
    };
  }
  const open = isOpen(now);
  const change = nextChange(isOpen, now);
  const when = change ? new Date(change).toUTCString().replace(":00 GMT", " UTC") : "";
  return {
    coin,
    kind,
    hlTrading: true,
    tradfiOpen: open,
    nextChangeAt: change,
    weekendSignal,
    label: open ? `Market open, closes ${when}` : `Market closed, reopens ${when}; still trades 24/7 on Hyperliquid`,
    caveat: caveats[kind],
  };
}

export type WeekendGap = {
  weekOf: string;
  fridayClose: number;
  preOpen: number;
  afterOpen: number;
  driftPct: number;
  gapPct: number;
};

export type WeekendGapStats = {
  coin: string;
  kind: MarketKind;
  weeks: number;
  medianAbsGapPct: number | null;
  directionHitRate: number | null;
  medianCapturedShare: number | null;
  gaps: WeekendGap[];
  method: string;
  caveat: string | null;
};

function boundaries(kind: MarketKind, isOpen: (ms: number) => boolean, from: number, to: number) {
  const closes: number[] = [];
  const opens: number[] = [];
  const step = 15 * 60_000;
  let prev = isOpen(from);
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
    const now = isOpen(t);
    if (now !== prev) {
      const { day } = newYork(t);
      if (!now && day === 5) closes.push(t);
      if (now && (kind === "us-equity" ? day === 1 : day === 0)) opens.push(t);
      prev = now;
    }
  }
  return closes
    .map((close) => ({ close, open: opens.find((o) => o > close && o - close < 4 * 864e5) }))
    .filter((w): w is { close: number; open: number } => w.open !== undefined);
}

export async function weekendGapStats(info: InfoClient, coin: string, weeks = 12, now: number = Date.now()): Promise<WeekendGapStats> {
  const kind = marketKind(coin);
  const isOpen = openFn(kind);
  const method =
    "Friday close = HL price at the home market's Friday close; pre-open = HL price just before the reopen; after-open = HL price one hour after the reopen, used as the reopen reference.";
  if (!isOpen) {
    return { coin, kind, weeks: 0, medianAbsGapPct: null, directionHitRate: null, medianCapturedShare: null, gaps: [], method, caveat: caveats[kind] };
  }
  const from = now - (weeks + 1) * 7 * 864e5;
  const candles = await loadOhlc(info, coin, "1h", from);
  const hour = 3600_000;
  const priceAt = (t: number) => {
    const c = candles.filter((x) => x.time + hour <= t).pop();
    return c ? c.close : null;
  };
  const gaps: WeekendGap[] = [];
  for (const { close, open } of boundaries(kind, isOpen, from, now - 2 * hour)) {
    const fridayClose = priceAt(close);
    const preOpen = priceAt(open);
    const afterOpen = priceAt(open + hour);
    if (!fridayClose || !preOpen || !afterOpen) continue;
    gaps.push({
      weekOf: new Date(close).toISOString().slice(0, 10),
      fridayClose,
      preOpen,
      afterOpen,
      driftPct: (preOpen / fridayClose - 1) * 100,
      gapPct: (afterOpen / fridayClose - 1) * 100,
    });
  }
  const recent = gaps.slice(-weeks);
  const meaningful = recent.filter((g) => Math.abs(g.gapPct) >= 0.05);
  const sizeable = recent.filter((g) => Math.abs(g.gapPct) >= 0.2);
  return {
    coin,
    kind,
    weeks: recent.length,
    medianAbsGapPct: recent.length ? median(recent.map((g) => Math.abs(g.gapPct))) : null,
    directionHitRate: meaningful.length ? meaningful.filter((g) => Math.sign(g.driftPct) === Math.sign(g.gapPct)).length / meaningful.length : null,
    medianCapturedShare: sizeable.length ? median(sizeable.map((g) => g.driftPct / g.gapPct)) : null,
    gaps: recent,
    method,
    caveat: caveats[kind],
  };
}
