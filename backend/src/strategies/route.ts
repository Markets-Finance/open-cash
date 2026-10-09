import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { isAddress, type Address, type Hex } from "viem";
import {
  cardDigestInput,
  cardShapeIssues,
  defaultLimits,
  followMessage,
  publishMessage,
  rankStrategies,
  unfollowMessage,
  type CopyRecord,
  type HlNetwork,
  type StrategyCard,
  type VerifiedLink,
} from "shared";
import { verifySigned } from "../auth/signed.js";
import { JsonFileStore } from "../store/jsonFile.js";
import { startCopySync } from "./apply.js";
import { copies, strategies } from "./store.js";

const links = new JsonFileStore<VerifiedLink>("data/identity-links.json");

function parseNet(value: unknown): HlNetwork {
  return value === "mainnet" ? "mainnet" : "testnet";
}

function newCopy(strategyId: string, follower: Address, network: HlNetwork, isAuthor: boolean, marginUsd: number, now: number): CopyRecord {
  return {
    id: randomUUID(),
    strategyId,
    follower,
    network,
    isAuthor,
    declaredMarginUsd: marginUsd,
    startMs: now,
    stopMs: null,
    countedThroughMs: now,
    netPnlUsd: 0,
    feesUsd: 0,
    fundingUsd: 0,
    volumeUsd: 0,
    closedTrades: 0,
    wins: 0,
  };
}

export function registerStrategyRoute(app: FastifyInstance): void {
  startCopySync((error) => app.log.error(error, "copy sync failed"));

  app.post<{ Body: { address: Address; network?: string; card: StrategyCard; issuedAt: number; signature: Hex } }>("/strategies", async (request, reply) => {
    const { address, card, issuedAt, signature } = request.body;
    const network = parseNet(request.body.network);
    if (!isAddress(address ?? "")) return reply.status(400).send({ error: "invalid address" });
    const shape = cardShapeIssues(card, defaultLimits);
    if (shape.length > 0) return reply.status(422).send({ error: shape.join(" ") });
    const digest = createHash("sha256").update(cardDigestInput(card)).digest("hex");
    const problem = await verifySigned(address, publishMessage(digest, issuedAt), signature, Date.now());
    if (problem) return reply.status(401).send({ error: problem });
    if ((await strategies.all()).some((s) => s.author.toLowerCase() === address.toLowerCase() && createHash("sha256").update(cardDigestInput(s.card)).digest("hex") === digest)) {
      return reply.status(409).send({ error: "You already published this strategy" });
    }
    const strategy = { id: randomUUID().slice(0, 8), card, author: address, createdAt: Date.now() };
    await strategies.set(strategy.id, strategy);
    const author = newCopy(strategy.id, address, network, true, card.marginUsd, Date.now());
    await copies.set(author.id, author);
    return strategy;
  });

  app.post<{ Params: { id: string }; Body: { address: Address; network?: string; marginUsd: number; issuedAt: number; signature: Hex } }>("/strategies/:id/follow", async (request, reply) => {
    const { address, marginUsd, issuedAt, signature } = request.body;
    const network = parseNet(request.body.network);
    const strategy = await strategies.get(request.params.id);
    if (!strategy) return reply.status(404).send({ error: "unknown strategy" });
    if (!isAddress(address ?? "") || !(marginUsd > 0) || marginUsd > defaultLimits.maxMarginUsd) return reply.status(400).send({ error: "invalid address or margin" });
    const problem = await verifySigned(address, followMessage(strategy.id, marginUsd, issuedAt), signature, Date.now());
    if (problem) return reply.status(401).send({ error: problem });
    const existing = (await copies.all()).find((c) => c.strategyId === strategy.id && c.follower.toLowerCase() === address.toLowerCase() && c.stopMs === null);
    if (existing) return reply.status(409).send({ error: "Already following" });
    const isAuthor = strategy.author.toLowerCase() === address.toLowerCase();
    const copy = newCopy(strategy.id, address, network, isAuthor, marginUsd, Date.now());
    await copies.set(copy.id, copy);
    return copy;
  });

  app.post<{ Params: { id: string }; Body: { address: Address; issuedAt: number; signature: Hex } }>("/strategies/:id/unfollow", async (request, reply) => {
    const { address, issuedAt, signature } = request.body;
    if (!isAddress(address ?? "")) return reply.status(400).send({ error: "invalid address" });
    const problem = await verifySigned(address, unfollowMessage(request.params.id, issuedAt), signature, Date.now());
    if (problem) return reply.status(401).send({ error: problem });
    const active = (await copies.all()).find((c) => c.strategyId === request.params.id && c.follower.toLowerCase() === address.toLowerCase() && c.stopMs === null);
    if (!active) return reply.status(404).send({ error: "not following" });
    const stopped = { ...active, stopMs: Date.now() };
    await copies.set(active.id, stopped);
    return stopped;
  });

  app.get("/strategies", async () => {
    const all = await strategies.all();
    const allCopies = await copies.all();
    const handles = new Map((await links.all()).map((l) => [l.address.toLowerCase(), l.handle]));
    const scores = rankStrategies(all.map((s) => s.id), allCopies);
    return {
      note: "Follower results are realised PnL after fees in the strategy's markets since they followed, plus funding, from Hyperliquid fills. They include any manual trades the follower made in those markets.",
      rows: scores.map((score, index) => {
        const strategy = all.find((s) => s.id === score.strategyId)!;
        return { rank: score.ranked ? index + 1 : null, ...score, name: strategy.card.name, card: strategy.card, author: strategy.author, authorHandle: handles.get(strategy.author.toLowerCase()) ?? null };
      }),
    };
  });
}
