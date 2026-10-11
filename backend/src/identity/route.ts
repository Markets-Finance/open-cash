import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { isAddress } from "viem";
import { linkMessage, normalizeHandle, type LinkChallenge, type VerifiedLink } from "shared";
import { JsonFileStore } from "../store/jsonFile.js";
import { verifyTweetProof } from "./verify.js";

const challenges = new JsonFileStore<LinkChallenge>("data/identity-challenges.json");
import { identityLinks as links } from "./links.js";
const challengeTtlMs = 15 * 60_000;

export function registerIdentityRoute(app: FastifyInstance): void {
  app.post<{ Body: { address: string; handle: string } }>("/identity/challenge", async (request, reply) => {
    const handle = normalizeHandle(request.body.handle ?? "");
    const address = request.body.address ?? "";
    if (!isAddress(address)) return reply.status(400).send({ error: "invalid address" });
    if (!handle) return reply.status(400).send({ error: "invalid X handle" });
    const challenge: LinkChallenge = {
      id: randomUUID(),
      address,
      handle,
      nonce: randomBytes(12).toString("hex"),
      expiresAt: Date.now() + challengeTtlMs,
    };
    await challenges.set(challenge.id, challenge);
    return { challenge, message: linkMessage(challenge) };
  });

  app.post<{ Body: { challengeId: string; tweetUrl: string } }>("/identity/verify", async (request, reply) => {
    const challenge = await challenges.get(request.body.challengeId ?? "");
    if (!challenge) return reply.status(404).send({ error: "unknown challenge" });
    const verdict = await verifyTweetProof(challenge, request.body.tweetUrl ?? "", Date.now());
    if (!verdict.ok) return reply.status(422).send({ error: verdict.reason });

    const existing = await links.all();
    for (const link of existing) {
      if (link.handle === verdict.handle || link.address.toLowerCase() === challenge.address.toLowerCase()) {
        await links.delete(link.address.toLowerCase());
      }
    }
    const link: VerifiedLink = {
      address: challenge.address,
      handle: verdict.handle,
      tweetId: verdict.tweetId,
      verifiedAt: Date.now(),
    };
    await links.set(link.address.toLowerCase(), link);
    await challenges.delete(challenge.id);
    return link;
  });

  app.get<{ Querystring: { address?: string; handle?: string } }>("/identity", async (request, reply) => {
    const { address, handle } = request.query;
    if (address && isAddress(address)) return (await links.get(address.toLowerCase())) ?? reply.status(404).send({ error: "not linked" });
    const normalized = normalizeHandle(handle ?? "");
    if (normalized) {
      const found = (await links.all()).find((link) => link.handle === normalized);
      return found ?? reply.status(404).send({ error: "not linked" });
    }
    return reply.status(400).send({ error: "address or handle required" });
  });
}
