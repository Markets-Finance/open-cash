import {
  createHlExchange,
  createHlInfo,
  loadCandles as loadHlCandles,
  loadDesk as loadHlDesk,
  loadTradeMarkets as loadHlMarkets,
  type ChartRangeKey,
  type HlWallet,
} from "shared";
import type { Address } from "viem";

export {
  chartRanges,
  marketLogoUrl as logoFor,
  maxOrderNotionalUsd,
  type ChartRangeKey,
  type HlCandle,
  type HlDesk,
  type TradeMarket,
} from "shared";

export const hlNetwork = "testnet";

export const info = createHlInfo(hlNetwork);

export type HlExchange = ReturnType<typeof createHlExchange>;

let wallet: HlWallet | null = null;

export function getExchange(): HlExchange | null {
  return wallet ? createHlExchange(hlNetwork, wallet) : null;
}

export const loadTradeMarkets = () => loadHlMarkets(info);
export const loadCandles = (coin: string, range: ChartRangeKey) => loadHlCandles(info, coin, range);
export const loadDesk = (user: Address) => loadHlDesk(info, user);
