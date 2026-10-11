import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";

export type HlNetwork = "mainnet" | "testnet";
type ExchangeConfig = ConstructorParameters<typeof ExchangeClient>[0];
export type HlWallet = Extract<ExchangeConfig, { wallet: unknown }>["wallet"];

function transportFor(network: HlNetwork): HttpTransport {
  return new HttpTransport({ isTestnet: network === "testnet" });
}

export function createHlInfo(network: HlNetwork = "mainnet"): InfoClient {
  return new InfoClient({ transport: transportFor(network) });
}

const exchangeNetworks = new WeakMap<object, HlNetwork>();

export function createHlExchange(network: HlNetwork, wallet: HlWallet): ExchangeClient {
  const client = new ExchangeClient({ transport: transportFor(network), wallet });
  exchangeNetworks.set(client, network);
  return client;
}

export function exchangeNetwork(client: object): HlNetwork {
  return exchangeNetworks.get(client) ?? "mainnet";
}
