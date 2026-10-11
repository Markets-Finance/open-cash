import { agentKeyMessage, botActionMessage, botDigest, botMandateMessage, type Bot, type BotAction, type BotMode } from "shared";
import { hlNetwork } from "../../hl";
import { mainExchange } from "../../hlSession";
import { query } from "../dom";
import { requireTrader } from "../state";
import { renderBot } from "./view";

const backend = import.meta.env.PUBLIC_BACKEND_URL ?? "http://localhost:8787";
const refreshMs = 15_000;
const finishRetries = 5;
const finishRetryMs = 1_500;

export async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backend}${path}`, init);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

export const post = <T>(path: string, body: unknown) =>
  call<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export async function ensureAgentKey(): Promise<void> {
  const trader = requireTrader();
  const owner = trader.address;
  const status = await call<{ hasKey: boolean; runner: boolean }>(`/bots?owner=${owner}&network=${hlNetwork}`);
  if (!status.runner) throw new Error("The server runner is switched off. Set BOT_RUNNER=1 on the backend.");
  if (status.hasKey) return;
  const started = await post<{ id: string; agentAddress: `0x${string}`; agentName: string }>("/bots/agent/start", { owner, network: hlNetwork });
  await mainExchange(trader).approveAgent({ agentAddress: started.agentAddress, agentName: started.agentName });
  const issuedAt = Date.now();
  const signature = await trader.account.signMessage({ message: agentKeyMessage(owner, hlNetwork, started.agentAddress, issuedAt) });
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

async function act(id: string, action: BotAction): Promise<void> {
  const trader = requireTrader();
  const issuedAt = Date.now();
  const signature = await trader.account.signMessage({ message: botActionMessage(id, action, issuedAt) });
  await post(`/bots/${id}/${action}`, { issuedAt, signature });
}

export async function runOnServer(card: Bot["card"], mode: BotMode): Promise<void> {
  const trader = requireTrader();
  await ensureAgentKey();
  const issuedAt = Date.now();
  const signature = await trader.account.signMessage({ message: botMandateMessage(trader.address, hlNetwork, botDigest(card, mode), issuedAt) });
  const bot = await post<Bot>("/bots", { owner: trader.address, network: hlNetwork, mode, card, issuedAt, signature });
  await act(bot.id, "enable");
  await paintServerBots();
}

export async function paintServerBots(): Promise<void> {
  const host = query("[data-server-bot-list]");
  try {
    const { bots } = await call<{ bots: Bot[] }>(`/bots?owner=${requireTrader().address}&network=${hlNetwork}`);
    host.innerHTML = bots.length === 0 ? `<p class="empty">No server bots yet.</p>` : bots.map(renderBot).join("");
  } catch (error) {
    host.innerHTML = `<p class="empty">${error instanceof Error ? error.message : String(error)}</p>`;
  }
}

export function initServerBots(onError: (error: unknown) => void) {
  const host = query("[data-server-bot-list]");
  host.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const root = target.closest<HTMLElement>("[data-bot]");
    if (!root) return;
    const id = root.dataset.bot!;
    try {
      if (target.closest("[data-bot-toggle]")) await act(id, root.querySelector(".pill--idle") ? "enable" : "disable");
      if (target.closest("[data-bot-delete]")) await act(id, "remove");
      await paintServerBots();
    } catch (error) {
      onError(error);
    }
  });
}

export function startServerBots() {
  void paintServerBots();
  setInterval(() => void paintServerBots(), refreshMs);
}
