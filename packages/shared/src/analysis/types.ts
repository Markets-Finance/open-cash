export type BookLevel = { price: number; size: number; orders: number };

export type Book = { bids: BookLevel[]; asks: BookLevel[]; atMs: number };

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type FundingPoint = { timeMs: number; hourlyRate: number };
