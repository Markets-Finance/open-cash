import { defaultGuardrails, guardrailBounds, guardrailsMessage, type GuardrailVerdict, type Guardrails } from "shared";
import { hlNetwork } from "../hl";
import { errorText, query, usd } from "./dom";
import { requireTrader, session } from "./state";

const backend = import.meta.env.PUBLIC_BACKEND_URL ?? "http://localhost:8787";
const barRefreshMs = 30_000;

type Status = {
  configured: boolean;
  settings: Guardrails;
  verdict: GuardrailVerdict;
  loss: { lossTodayUsd: number };
};

type Stored = {
  settings: Guardrails;
  pending: { settings: Guardrails; effectiveAt: number } | null;
  state: { lockedUntil: number | null };
};

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${backend}${path}`);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

export function loadGuardStatus(maxLossUsd: number | null): Promise<Status> {
  const owner = requireTrader().address;
  const loss = maxLossUsd === null ? "none" : String(maxLossUsd);
  return get<Status>(`/guardrails/status?owner=${owner}&network=${hlNetwork}&maxLossUsd=${loss}`);
}

export async function guardOrThrow(maxLossUsd: number | null): Promise<void> {
  const { verdict } = await loadGuardStatus(maxLossUsd);
  if (!verdict.allowed) throw new Error(`Guardrail: ${verdict.reason}`);
}

export async function guardForBot(_card: unknown, maxLossUsd: number | null): Promise<{ allowed: boolean; reason: string }> {
  const { verdict } = await loadGuardStatus(maxLossUsd);
  return { allowed: verdict.allowed, reason: verdict.reason ?? "" };
}

function clock(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

export async function paintGuardBar() {
  const bar = document.querySelector<HTMLElement>("[data-guard-bar]");
  if (!bar || !session.trader) return;
  try {
    const { settings, verdict } = await loadGuardStatus(null);
    bar.hidden = false;
    const locked = verdict.lockedUntil !== null && verdict.lockedUntil > Date.now();
    bar.dataset.tone = locked ? "locked" : verdict.remainingTodayUsd < settings.dailyLossLimitUsd * 0.25 ? "warn" : "ok";
    bar.textContent = locked
      ? `New trades are paused until ${clock(verdict.lockedUntil!)}. You hit your daily loss limit of ${usd(settings.dailyLossLimitUsd)}. Closing is always allowed.`
      : `Loss today ${usd(verdict.lossTodayUsd)} of ${usd(settings.dailyLossLimitUsd)} · ${usd(verdict.remainingTodayUsd)} left`;
  } catch {
    bar.hidden = true;
  }
}

export function startGuardBar() {
  void paintGuardBar();
  setInterval(() => void paintGuardBar(), barRefreshMs);
  document.addEventListener("guard:changed", () => void paintGuardBar());
}

export function initGuardrailsPane() {
  const daily = query<HTMLInputElement>("[data-guard-daily]");
  const perTrade = query<HTMLInputElement>("[data-guard-trade]");
  const coolOff = query<HTMLInputElement>("[data-guard-cooloff]");
  const saveBtn = query<HTMLButtonElement>("[data-guard-save]");
  const statusEl = query("[data-guard-status]");
  const noteEl = query("[data-guard-note]");

  const say = (text: string, tone = "") => {
    statusEl.textContent = text;
    statusEl.dataset.tone = tone;
  };

  async function load() {
    const owner = requireTrader().address;
    let settings: Guardrails = defaultGuardrails;
    let pending: Stored["pending"] = null;
    try {
      const stored = await get<Stored>(`/guardrails?owner=${owner}&network=${hlNetwork}`);
      settings = stored.settings;
      pending = stored.pending;
      noteEl.textContent = pending
        ? `A looser limit is waiting and takes effect ${clock(pending.effectiveAt)}. Tighter limits apply at once.`
        : "Tighter limits apply at once. Looser limits wait 24 hours so a bad moment cannot undo them.";
    } catch {
      noteEl.textContent = `Not set yet. These are the defaults. Tighter limits apply at once. Looser limits wait 24 hours.`;
    }
    daily.value = String(settings.dailyLossLimitUsd);
    perTrade.value = String(settings.maxLossPerTradeUsd);
    coolOff.value = String(settings.coolOffMinutes);
  }

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    try {
      const trader = requireTrader();
      const settings: Guardrails = {
        dailyLossLimitUsd: Number(daily.value),
        maxLossPerTradeUsd: Number(perTrade.value),
        coolOffMinutes: Number(coolOff.value),
      };
      say("Waiting for your passkey…");
      const issuedAt = Date.now();
      const signature = await trader.account.signMessage({ message: guardrailsMessage(trader.address, hlNetwork, settings, issuedAt) });
      const response = await fetch(`${backend}/guardrails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: trader.address, network: hlNetwork, settings, issuedAt, signature }),
      });
      const body = (await response.json()) as { delayed?: boolean; error?: string };
      if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
      say(body.delayed ? "Saved. The looser limit takes effect in 24 hours." : "Saved. The new limits apply now.");
      document.dispatchEvent(new CustomEvent("guard:changed"));
      await load();
    } catch (error) {
      say(errorText(error), "error");
    } finally {
      saveBtn.disabled = false;
    }
  });

  query("[data-guard-bounds]").textContent = `Daily limit $${guardrailBounds.dailyLossLimitUsd.min}–${guardrailBounds.dailyLossLimitUsd.max.toLocaleString()}. Per trade up to the daily limit. Cool-off ${guardrailBounds.coolOffMinutes.min} minutes to ${guardrailBounds.coolOffMinutes.max / 1440} days.`;
  void load();
}
