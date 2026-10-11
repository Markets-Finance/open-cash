import { agentKeyMessage, botMandateMessage, liveActionMessage, liveDigest, liveStopAllMessage, type LiveAction, type LiveBot, type LiveSpec } from "shared";
import { currentTrader } from "./bots";
import { backendUrl } from "./config";
import { hlNetwork, mainExchange } from "./hl";

export type LiveMetrics = {
  fills: number;
  volumeUsd: number;
  feesUsd: number;
  realizedUsd: number;
  unrealizedUsd: number;
  netUsd: number;
  returnPct: number;
  positionSize: number;
  entryPx: number | null;
};

export type PublicLive = Omit<LiveBot, "journal"> & { candlesSeen: number; metrics: LiveMetrics | null };
export type Preflight = { ready: boolean; checks: { name: string; ok: boolean; detail: string }[]; intents: string[] };

const finishRetries = 5;
const finishRetryMs = 1_500;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backendUrl}${path}`, init);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

const post = <T>(path: string, body: unknown) => call<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function signer() {
  const trader = currentTrader();
  if (!trader) throw new Error("Not signed in.");
  return trader;
}

async function ensureServerKey(): Promise<void> {
  const trader = signer();
  const status = await call<{ hasKey: boolean; runner: boolean }>(`/bots?owner=${trader.address}&network=${hlNetwork}`);
  if (!status.runner) throw new Error("The server runner is switched off.");
  if (status.hasKey) return;
  const started = await post<{ id: string; agentAddress: `0x${string}`; agentName: string }>("/bots/agent/start", { owner: trader.address, network: hlNetwork });
  await mainExchange(trader).approveAgent({ agentAddress: started.agentAddress, agentName: started.agentName });
  const issuedAt = Date.now();
  const signature = await trader.account.signMessage({ message: agentKeyMessage(trader.address, hlNetwork, started.agentAddress, issuedAt) });
  for (let attempt = 0; ; attempt++) {
    try {
      await post("/bots/agent/finish", { id: started.id, issuedAt, signature });
      return;
    } catch (error) {
      if (attempt >= finishRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, finishRetryMs));
    }
  }
}

export function loadLive(): Promise<{ bots: PublicLive[]; runner: boolean }> {
  return call(`/live?owner=${signer().address}&network=${hlNetwork}`);
}

export function preflightLive(id: string): Promise<Preflight> {
  return call(`/live/${id}/preflight`);
}

export async function reviewLive(spec: LiveSpec): Promise<{ id: string; preflight: Preflight }> {
  const trader = signer();
  await ensureServerKey();
  const issuedAt = Date.now();
  const signature = await trader.account.signMessage({ message: botMandateMessage(trader.address, hlNetwork, liveDigest(spec), issuedAt) });
  const bot = await post<{ id: string }>("/live", { owner: trader.address, network: hlNetwork, ...spec, issuedAt, signature });
  return { id: bot.id, preflight: await preflightLive(bot.id) };
}

export async function liveAct(id: string, action: LiveAction): Promise<void> {
  const issuedAt = Date.now();
  const signature = await signer().account.signMessage({ message: liveActionMessage(id, action, issuedAt) });
  await post(`/live/${id}/${action}`, { issuedAt, signature });
}

export async function stopAllBots(close: boolean): Promise<string> {
  const trader = signer();
  const issuedAt = Date.now();
  const signature = await trader.account.signMessage({ message: liveStopAllMessage(trader.address, hlNetwork, close, issuedAt) });
  const result = await post<{ liveStopped: number; cardBotsStopped: number; failures: string[]; note: string }>("/live/stop-all", { owner: trader.address, network: hlNetwork, close, issuedAt, signature });
  const failed = result.failures.length > 0 ? ` Problems: ${result.failures.join("; ")}` : "";
  return `Stopped ${result.liveStopped} live and ${result.cardBotsStopped} server bot${result.cardBotsStopped === 1 ? "" : "s"}. ${result.note}${failed}`;
}
