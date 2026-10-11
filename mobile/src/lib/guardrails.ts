import { defaultGuardrails, guardrailsMessage, type GuardrailVerdict, type Guardrails } from "shared";
import { currentTrader } from "./bots";
import { backendUrl } from "./config";
import { hlNetwork } from "./hl";

export type GuardStatus = {
  configured: boolean;
  settings: Guardrails;
  verdict: GuardrailVerdict;
  loss: { lossTodayUsd: number };
};

export type StoredGuardrails = {
  settings: Guardrails;
  pending: { settings: Guardrails; effectiveAt: number } | null;
};

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${backendUrl}${path}`);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

export function loadGuardStatus(owner: string, maxLossUsd: number | null): Promise<GuardStatus> {
  return get<GuardStatus>(`/guardrails/status?owner=${owner}&network=${hlNetwork}&maxLossUsd=${maxLossUsd === null ? "none" : maxLossUsd}`);
}

export async function guardOrThrow(owner: string, maxLossUsd: number | null): Promise<void> {
  const { verdict } = await loadGuardStatus(owner, maxLossUsd);
  if (!verdict.allowed) throw new Error(`Guardrail: ${verdict.reason}. Your limits are under Account, Loss limits. Tightening is instant, loosening takes 24 hours.`);
}

export async function guardForBot(_card: unknown, maxLossUsd: number | null): Promise<{ allowed: boolean; reason: string }> {
  const owner = currentTrader()?.address;
  if (!owner) return { allowed: false, reason: "Not signed in." };
  const { verdict } = await loadGuardStatus(owner, maxLossUsd);
  return { allowed: verdict.allowed, reason: verdict.reason ?? "" };
}

export async function loadStoredGuardrails(owner: string): Promise<StoredGuardrails> {
  try {
    return await get<StoredGuardrails>(`/guardrails?owner=${owner}&network=${hlNetwork}`);
  } catch {
    return { settings: defaultGuardrails, pending: null };
  }
}

export async function saveGuardrails(settings: Guardrails): Promise<{ delayed: boolean }> {
  const trader = currentTrader();
  if (!trader) throw new Error("Not signed in.");
  const issuedAt = Date.now();
  const signature = await trader.account.signMessage({ message: guardrailsMessage(trader.address, hlNetwork, settings, issuedAt) });
  const response = await fetch(`${backendUrl}/guardrails`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner: trader.address, network: hlNetwork, settings, issuedAt, signature }),
  });
  const body = (await response.json()) as { delayed?: boolean; error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return { delayed: body.delayed === true };
}
