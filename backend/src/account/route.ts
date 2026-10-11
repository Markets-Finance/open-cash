import type { FastifyInstance } from "fastify";
import { deleteAccountMessage } from "shared";
import { isAddress, type Address, type Hex } from "viem";
import { verifySigned } from "../auth/signed.js";
import { deleteFloorsFor } from "../floors/route.js";
import { deleteGuardrails } from "../guardrails/store.js";
import { deleteBoardsForOwner } from "../boards/store.js";
import { identityLinks } from "../identity/links.js";
import { deleteBot, listBots } from "../runner/store.js";
import { removeKey } from "../runner/vault.js";
import { deleteStrategyData } from "../strategies/store.js";

export function registerAccountRoute(app: FastifyInstance): void {
  app.post<{ Body: { owner?: Address; issuedAt?: number; signature?: Hex } }>("/account/delete", async (request, reply) => {
    const { owner = "" as Address, issuedAt = 0, signature = "0x" as Hex } = request.body ?? {};
    if (!isAddress(owner)) return reply.status(400).send({ error: "invalid owner" });
    const problem = await verifySigned(owner, deleteAccountMessage(owner, issuedAt), signature, Date.now());
    if (problem) return reply.status(401).send({ error: problem });

    const bots = await listBots({ owner });
    for (const bot of bots) await deleteBot(bot.id);
    await removeKey(owner, "testnet");
    await removeKey(owner, "mainnet");
    const strategyData = await deleteStrategyData(owner);
    const hadLink = (await identityLinks.get(owner.toLowerCase())) !== undefined;
    if (hadLink) await identityLinks.delete(owner.toLowerCase());

    return {
      ok: true,
      removed: {
        bots: bots.length,
        floors: await deleteFloorsFor(owner),
        guardrails: await deleteGuardrails(owner),
        boards: await deleteBoardsForOwner(owner),
        sharedStrategies: strategyData.strategies,
        copyRecords: strategyData.copies,
        xLink: hadLink ? 1 : 0,
      },
    };
  });
}
