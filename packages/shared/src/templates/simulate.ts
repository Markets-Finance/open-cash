import type { Candle } from "../analysis/types.js";
import type {
  EquityPoint,
  Fill,
  LimitOrder,
  Marker,
  SimOptions,
  SimResult,
  Strategy,
} from "./types.js";

type Book = {
  cash: number;
  qty: number;
  avg: number;
  fees: number;
  funding: number;
  closing: number;
  wins: number;
};

function applyTrade(
  book: Book,
  time: number,
  delta: number,
  price: number,
  feeBps: number,
  reason: Fill["reason"],
): Fill {
  const fee = (Math.abs(delta) * price * feeBps) / 1e4;
  let realized = 0;
  const reduces = book.qty !== 0 && Math.sign(delta) !== Math.sign(book.qty);
  if (reduces) {
    const closed = Math.min(Math.abs(delta), Math.abs(book.qty));
    realized = closed * (price - book.avg) * Math.sign(book.qty);
  }
  const next = book.qty + delta;
  if (next === 0 || (book.qty !== 0 && Math.sign(next) !== Math.sign(book.qty))) {
    book.avg = next === 0 ? 0 : price;
  } else if (!reduces) {
    book.avg = (Math.abs(book.qty) * book.avg + Math.abs(delta) * price) / Math.abs(next);
  }
  book.qty = Math.abs(next) < 1e-12 ? 0 : next;
  book.cash += realized - fee;
  book.fees += fee;
  if (reduces) {
    book.closing += 1;
    if (realized - fee > 0) book.wins += 1;
  }
  return { time, qtyDelta: delta, price, feeUsd: fee, realizedUsd: realized, reason };
}

function equityAt(book: Book, mark: number): number {
  return book.cash + book.qty * (mark - book.avg);
}

const minNotionalUsd = 1;

function tooSmall(book: Book, delta: number, price: number): boolean {
  const adds = book.qty === 0 || Math.sign(delta) === Math.sign(book.qty);
  return adds && Math.abs(delta * price) < minNotionalUsd;
}

function clipDelta(book: Book, delta: number, price: number, maxLeverage: number): number {
  const equity = equityAt(book, price);
  if (equity <= 0) return 0;
  const next = book.qty + delta;
  const cap = (equity * maxLeverage) / price;
  if (Math.abs(next) <= cap) return delta;
  if (Math.abs(book.qty) >= cap && Math.sign(delta) === Math.sign(book.qty)) return 0;
  return Math.sign(next) * cap - book.qty;
}

export function simulate(
  strategy: Strategy,
  candles: Candle[],
  options: SimOptions,
  startIndex = 0,
): SimResult {
  const book: Book = { cash: options.allocationUsd, qty: 0, avg: 0, fees: 0, funding: 0, closing: 0, wins: 0 };
  const equity: EquityPoint[] = [];
  const fills: Fill[] = [];
  const markers: Marker[] = [];
  const slip = options.slippageBps / 1e4;
  const funding = [...(options.funding ?? [])].sort((a, b) => a.timeMs - b.timeMs);
  const span = candles.length > 1 ? candles[1]!.time - candles[0]!.time : 3_600_000;

  let fundingIndex = 0;
  let pendingMarket = 0;
  let pendingFlat = false;
  let resting: LimitOrder[] = [];
  let stopPrice: number | null = null;
  let peak = options.allocationUsd;
  let maxDrawdown = 0;
  let exposed = 0;
  let liquidated = false;
  let carried: Fill[] = [];

  function record(fill: Fill, kind: Marker["kind"]) {
    fills.push(fill);
    carried.push(fill);
    markers.push({ time: fill.time, price: fill.price, kind });
  }

  for (let i = startIndex; i < candles.length; i += 1) {
    const candle = candles[i]!;
    carried = [];

    if (pendingFlat && book.qty !== 0) {
      const price = candle.open * (1 - Math.sign(book.qty) * slip);
      record(applyTrade(book, candle.time, -book.qty, price, options.takerFeeBps, "market"), book.qty > 0 ? "sell" : "buy");
      pendingMarket = 0;
    }
    pendingFlat = false;

    if (pendingMarket !== 0) {
      const price = candle.open * (1 + Math.sign(pendingMarket) * slip);
      const delta = clipDelta(book, pendingMarket / price, price, options.maxLeverage);
      if (delta !== 0 && !tooSmall(book, delta, price)) record(applyTrade(book, candle.time, delta, price, options.takerFeeBps, "market"), delta > 0 ? "buy" : "sell");
      pendingMarket = 0;
    }

    let stopped = false;
    if (stopPrice !== null && book.qty !== 0) {
      const long = book.qty > 0;
      const hit = long ? candle.low <= stopPrice : candle.high >= stopPrice;
      if (hit) {
        const base = long ? Math.min(candle.open, stopPrice) : Math.max(candle.open, stopPrice);
        const price = base * (1 - Math.sign(book.qty) * slip);
        record(applyTrade(book, candle.time, -book.qty, price, options.takerFeeBps, "stop"), "stop");
        stopped = true;
        stopPrice = null;
      }
    }

    if (!stopped && resting.length > 0) {
      const green = candle.close >= candle.open;
      const touched = (order: LimitOrder) => (order.usd > 0 ? candle.low <= order.price : candle.high >= order.price);
      const buys = resting.filter((order) => order.usd > 0 && touched(order));
      const sells = resting.filter((order) => order.usd < 0 && touched(order));
      const ordered = green ? [...buys, ...sells] : [...sells, ...buys];
      for (const order of ordered) {
        const price = order.usd > 0 ? Math.min(order.price, candle.open) : Math.max(order.price, candle.open);
        const wanted = order.usd / price;
        const delta = clipDelta(book, wanted, price, options.maxLeverage);
        if (delta === 0 || tooSmall(book, delta, price)) continue;
        record(
          applyTrade(book, candle.time, delta, order.price, options.makerFeeBps, "limit"),
          delta > 0 ? "buy" : "sell",
        );
      }
    }
    resting = [];

    const until = candle.time + span;
    while (fundingIndex < funding.length && funding[fundingIndex]!.timeMs <= until) {
      const point = funding[fundingIndex]!;
      if (point.timeMs > candle.time && book.qty !== 0) {
        const paid = -Math.sign(book.qty) * Math.abs(book.qty) * candle.close * point.hourlyRate;
        book.cash += paid;
        book.funding += paid;
      }
      fundingIndex += 1;
    }

    const value = equityAt(book, candle.close);
    if (book.qty !== 0) exposed += 1;
    if (value <= 0) {
      liquidated = true;
      book.cash = 0;
      book.qty = 0;
      equity.push({ time: candle.time, equity: 0 });
      maxDrawdown = 100;
      break;
    }
    equity.push({ time: candle.time, equity: value });
    peak = Math.max(peak, value);
    maxDrawdown = Math.max(maxDrawdown, ((peak - value) / peak) * 100);

    const out = strategy.step({
      history: candles.slice(0, i + 1),
      position: { qty: book.qty, avgPrice: book.avg },
      fills: carried,
      allocationUsd: options.allocationUsd,
    });
    pendingMarket = out.market ?? 0;
    pendingFlat = out.flat ?? false;
    resting = out.limits ?? [];
    if (out.stopPrice !== undefined) stopPrice = out.stopPrice;
  }

  const last = equity[equity.length - 1]?.equity ?? options.allocationUsd;
  const first = candles[startIndex];
  const final = candles[candles.length - 1];
  return {
    candles: candles.length - startIndex,
    equity,
    fills,
    markers,
    metrics: {
      netPnlUsd: last - options.allocationUsd,
      returnPct: ((last - options.allocationUsd) / options.allocationUsd) * 100,
      holdReturnPct: first && final ? ((final.close - first.open) / first.open) * 100 : 0,
      maxDrawdownPct: maxDrawdown,
      closingFills: book.closing,
      winRatePct: book.closing === 0 ? null : (book.wins / book.closing) * 100,
      feesUsd: book.fees,
      fundingUsd: book.funding,
      exposurePct: candles.length <= startIndex ? 0 : (exposed / (candles.length - startIndex)) * 100,
      liquidated,
    },
  };
}
