import { intents } from "shared";
import { backendUrl } from "./config";

export type Source = intents.FundingSource;
export type Destination = intents.IntentsToken;

export async function loadCatalog(): Promise<{ sources: Source[]; destinations: Destination[] }> {
  const response = await fetch(`${backendUrl}/intents/tokens`);
  if (!response.ok) throw new Error(`Swap service ${response.status}`);
  return (await response.json()) as { sources: Source[]; destinations: Destination[] };
}

export async function previewQuote(input: {
  origin: Source;
  destination: Destination;
  amount: number;
  recipient: string;
  refundTo: string;
}): Promise<intents.Quote> {
  const response = await fetch(`${backendUrl}/intents/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      originAsset: input.origin.assetId,
      destinationAsset: input.destination.assetId,
      amount: intents.toBaseUnits(input.amount, input.origin.decimals),
      recipient: input.recipient,
      refundTo: input.refundTo,
      dry: true,
    }),
  });
  const body = (await response.json()) as { quote?: intents.Quote; error?: string };
  if (!response.ok || !body.quote) throw new Error(plainError(body.error ?? `Quote failed (${response.status})`));
  return body.quote;
}

function plainError(message: string): string {
  const minimum = message.match(/minimum swap amount is (\$[\d,]+)/);
  if (minimum) return `This route needs at least ${minimum[1]}.`;
  if (message.includes("refundTo is not valid")) return "Enter a valid refund address on the source chain.";
  if (message.includes("Amount is too low")) return "That amount is too small for this route.";
  return message.replace(/^Intents quote \d+:\s*/, "").slice(0, 160);
}

export const chainNames: Record<string, string> = {
  eth: "Ethereum",
  base: "Base",
  arb: "Arbitrum",
  op: "Optimism",
  pol: "Polygon",
  bsc: "BNB Chain",
  avax: "Avalanche",
  sol: "Solana",
  btc: "Bitcoin",
  near: "NEAR",
  ton: "TON",
  tron: "Tron",
  xrp: "XRP Ledger",
  sui: "Sui",
  doge: "Dogecoin",
};

export function chainName(chain: string): string {
  return chainNames[chain] ?? chain.toUpperCase();
}

export type Info = { provider: "aurora" | "near-direct"; persistent: boolean };
export type DepositAddress = {
  kind: "persistent" | "one-time";
  depositAddress: string;
  memo?: string;
  deadline?: string;
  amountIn?: string;
  amountOut?: string;
};
export type Landed = { tx_hash: string; amount: string; decimals: number; created_at: string };

export async function loadInfo(): Promise<Info> {
  const response = await fetch(`${backendUrl}/intents/info`);
  if (!response.ok) throw new Error(`Deposit service ${response.status}`);
  return (await response.json()) as Info;
}

export async function createDepositAddress(input: { chain: string; recipient: string; originAsset: string; amount: number; decimals: number; refundTo: string }): Promise<DepositAddress> {
  const response = await fetch(`${backendUrl}/intents/deposit-address`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chain: input.chain,
      recipient: input.recipient,
      originAsset: input.originAsset,
      amount: intents.toBaseUnits(input.amount, input.decimals),
      refundTo: input.refundTo,
    }),
  });
  const body = (await response.json()) as DepositAddress & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Deposit address failed (${response.status})`);
  return body;
}

export async function loadLanded(depositAddress: string): Promise<{ received: Landed[]; success: Landed[] }> {
  const response = await fetch(`${backendUrl}/intents/deposits?address=${encodeURIComponent(depositAddress)}`);
  if (!response.ok) return { received: [], success: [] };
  return (await response.json()) as { received: Landed[]; success: Landed[] };
}

export async function loadStatus(depositAddress: string, memo?: string): Promise<string | null> {
  const query = memo ? `&depositMemo=${encodeURIComponent(memo)}` : "";
  const response = await fetch(`${backendUrl}/intents/status?depositAddress=${encodeURIComponent(depositAddress)}${query}`);
  if (!response.ok) return null;
  return ((await response.json()) as { status?: string }).status ?? null;
}
