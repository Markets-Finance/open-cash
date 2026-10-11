import {
  createHlInfo,
  defaultGuardrails,
  evaluateGuardrails,
  loadGuardrailLoss,
  type GuardrailState,
  type GuardrailVerdict,
  type Guardrails,
  type HlNetwork,
} from "shared";
import { JsonFileStore } from "../store/jsonFile.js";

export type GuardrailRecord = {
  owner: string;
  network: HlNetwork;
  settings: Guardrails;
  pending: { settings: Guardrails; effectiveAt: number } | null;
  state: GuardrailState;
  signature: string;
  issuedAt: number;
};

const records = new JsonFileStore<GuardrailRecord>("data/guardrails.json");

const keyOf = (owner: string, network: HlNetwork) => `${network}:${owner.toLowerCase()}`;

export async function getGuardrails(owner: string, network: HlNetwork, now = Date.now()): Promise<GuardrailRecord | null> {
  const record = await records.get(keyOf(owner, network));
  if (!record) return null;
  if (record.pending && record.pending.effectiveAt <= now) {
    const promoted = { ...record, settings: record.pending.settings, pending: null };
    await records.set(keyOf(owner, network), promoted);
    return promoted;
  }
  return record;
}

export async function deleteGuardrails(owner: string): Promise<number> {
  let removed = 0;
  for (const network of ["testnet", "mainnet"] as const) {
    if (await records.get(keyOf(owner, network))) {
      await records.delete(keyOf(owner, network));
      removed += 1;
    }
  }
  return removed;
}

export async function putGuardrails(record: GuardrailRecord): Promise<void> {
  await records.set(keyOf(record.owner, record.network), record);
}

export async function guardrailStatus(
  owner: string,
  network: HlNetwork,
  maxLossUsd?: number | null,
  now = Date.now(),
): Promise<{ configured: boolean; settings: Guardrails; verdict: GuardrailVerdict; loss: Awaited<ReturnType<typeof loadGuardrailLoss>> }> {
  const record = await getGuardrails(owner, network, now);
  const settings = record?.settings ?? defaultGuardrails;
  const state = record?.state ?? { lockedUntil: null, lastBreachAt: null };
  const loss = await loadGuardrailLoss(createHlInfo(network), owner as `0x${string}`, now);
  const verdict: GuardrailVerdict =
    record === null
      ? { allowed: true, breached: false, lockedUntil: null, reason: "No limits set", lossTodayUsd: loss.lossTodayUsd, remainingTodayUsd: 0 }
      : evaluateGuardrails({
          settings,
          state,
          loss,
          now,
          ...(maxLossUsd === undefined ? {} : { trade: { maxLossUsd } }),
        });
  if (verdict.breached && record) {
    await putGuardrails({ ...record, state: { lockedUntil: verdict.lockedUntil, lastBreachAt: now } });
  }
  return { configured: record !== null, settings, verdict, loss };
}
