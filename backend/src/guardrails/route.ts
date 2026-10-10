import type { FastifyInstance } from "fastify";
import {
  guardrailIssues,
  guardrailsMessage,
  isLoosening,
  looseningDelayMs,
  type Guardrails,
  type HlNetwork,
} from "shared";
import { isAddress, type Address, type Hex } from "viem";
import { verifySigned } from "../auth/signed.js";
import { getGuardrails, guardrailStatus, putGuardrails } from "./store.js";

function parseNet(value: unknown): HlNetwork {
  return value === "mainnet" ? "mainnet" : "testnet";
}

export function registerGuardrailsRoute(app: FastifyInstance): void {
  app.get<{ Querystring: { owner?: string; network?: string } }>("/guardrails", async (request, reply) => {
    const owner = request.query.owner ?? "";
    if (!isAddress(owner)) return reply.status(400).send({ error: "invalid owner" });
    const record = await getGuardrails(owner, parseNet(request.query.network));
    if (!record) return reply.status(404).send({ error: "no guardrails set" });
    const { signature, ...rest } = record;
    return rest;
  });

  app.post<{ Body: { owner?: Address; network?: string; settings?: Guardrails; issuedAt?: number; signature?: Hex } }>(
    "/guardrails",
    async (request, reply) => {
      const { owner = "" as Address, settings, issuedAt = 0, signature = "0x" as Hex } = request.body ?? {};
      const network = parseNet(request.body?.network);
      if (!isAddress(owner) || !settings) return reply.status(400).send({ error: "invalid request" });
      const issues = guardrailIssues(settings);
      if (issues.length > 0) return reply.status(422).send({ error: issues.join(" ") });
      const problem = await verifySigned(owner, guardrailsMessage(owner, network, settings, issuedAt), signature, Date.now());
      if (problem) return reply.status(401).send({ error: problem });
      const now = Date.now();
      const current = await getGuardrails(owner, network, now);
      const delayed = current !== null && isLoosening(current.settings, settings);
      const record = {
        owner,
        network,
        settings: delayed ? current!.settings : settings,
        pending: delayed ? { settings, effectiveAt: now + looseningDelayMs } : null,
        state: current?.state ?? { lockedUntil: null, lastBreachAt: null },
        signature,
        issuedAt,
      };
      await putGuardrails(record);
      const { signature: _signature, ...rest } = record;
      return { ...rest, delayed };
    },
  );

  app.get<{ Querystring: { owner?: string; network?: string; maxLossUsd?: string } }>("/guardrails/status", async (request, reply) => {
    const owner = request.query.owner ?? "";
    if (!isAddress(owner)) return reply.status(400).send({ error: "invalid owner" });
    const raw = request.query.maxLossUsd;
    const maxLossUsd = raw === undefined ? undefined : raw === "none" ? null : Number(raw);
    if (maxLossUsd !== undefined && maxLossUsd !== null && !(maxLossUsd >= 0)) return reply.status(400).send({ error: "invalid maxLossUsd" });
    try {
      return await guardrailStatus(owner, parseNet(request.query.network), maxLossUsd);
    } catch (error) {
      return reply.status(502).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
