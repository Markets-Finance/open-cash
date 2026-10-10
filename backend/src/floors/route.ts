import type { FastifyInstance } from "fastify";
import { floorDigest, floorId, floorMessage, type FloorRecord, type HlNetwork } from "shared";
import { isAddress, type Address, type Hex } from "viem";
import { verifySigned } from "../auth/signed.js";
import { JsonFileStore } from "../store/jsonFile.js";

type StoredFloor = FloorRecord & { id: string; savedAt: number };

const store = new JsonFileStore<StoredFloor[]>("data/floors.json");
const maxFloorsPerOwner = 50;
const keyOf = (owner: string, network: HlNetwork) => `${network}:${owner.toLowerCase()}`;

function parseNet(value: unknown): HlNetwork {
  return value === "mainnet" ? "mainnet" : "testnet";
}

function validRecord(record: unknown): record is FloorRecord {
  const r = record as Partial<FloorRecord> | null;
  return (
    !!r &&
    typeof r.coin === "string" && r.coin.length > 0 && r.coin.length <= 32 &&
    typeof r.dex === "string" &&
    Number.isInteger(r.assetId) &&
    typeof r.isLong === "boolean" &&
    [r.floorUsd, r.sleeveUsd, r.leverage, r.size, r.entryPx, r.openedAt].every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0) &&
    Number.isInteger(r.szDecimals)
  );
}

export function registerFloorRoute(app: FastifyInstance): void {
  app.get<{ Querystring: { owner?: string; network?: string } }>("/floors", async (request, reply) => {
    const owner = request.query.owner ?? "";
    if (!isAddress(owner)) return reply.status(400).send({ error: "invalid owner" });
    return { records: (await store.get(keyOf(owner, parseNet(request.query.network)))) ?? [] };
  });

  app.post<{ Body: { owner?: Address; network?: string; record?: FloorRecord; issuedAt?: number; signature?: Hex } }>("/floors", async (request, reply) => {
    const { owner = "" as Address, record, issuedAt = 0, signature = "0x" as Hex } = request.body ?? {};
    const network = parseNet(request.body?.network);
    if (!isAddress(owner) || !validRecord(record)) return reply.status(400).send({ error: "invalid request" });
    const problem = await verifySigned(owner, floorMessage(owner, network, "add", floorDigest(record), issuedAt), signature, Date.now());
    if (problem) return reply.status(401).send({ error: problem });
    const key = keyOf(owner, network);
    const list = (await store.get(key)) ?? [];
    const id = floorId(record);
    const existing = list.find((f) => f.id === id);
    if (existing) return existing;
    if (list.length >= maxFloorsPerOwner) return reply.status(400).send({ error: `At most ${maxFloorsPerOwner} floors per wallet` });
    const stored: StoredFloor = { ...record, id, savedAt: Date.now() };
    await store.set(key, [...list, stored]);
    return stored;
  });

  app.post<{ Params: { id: string }; Body: { owner?: Address; network?: string; issuedAt?: number; signature?: Hex } }>("/floors/:id/remove", async (request, reply) => {
    const { owner = "" as Address, issuedAt = 0, signature = "0x" as Hex } = request.body ?? {};
    const network = parseNet(request.body?.network);
    const id = request.params.id;
    if (!isAddress(owner)) return reply.status(400).send({ error: "invalid owner" });
    const problem = await verifySigned(owner, floorMessage(owner, network, "remove", id, issuedAt), signature, Date.now());
    if (problem) return reply.status(401).send({ error: problem });
    const key = keyOf(owner, network);
    const list = (await store.get(key)) ?? [];
    if (!list.some((f) => f.id === id)) return reply.status(404).send({ error: "unknown floor" });
    await store.set(key, list.filter((f) => f.id !== id));
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: { owner?: Address; network?: string; record?: FloorRecord; issuedAt?: number; signature?: Hex } }>("/floors/:id/replace", async (request, reply) => {
    const { owner = "" as Address, record, issuedAt = 0, signature = "0x" as Hex } = request.body ?? {};
    const network = parseNet(request.body?.network);
    const id = request.params.id;
    if (!isAddress(owner) || !validRecord(record)) return reply.status(400).send({ error: "invalid request" });
    const problem = await verifySigned(owner, floorMessage(owner, network, "replace", `${id}>${floorDigest(record)}`, issuedAt), signature, Date.now());
    if (problem) return reply.status(401).send({ error: problem });
    const key = keyOf(owner, network);
    const list = (await store.get(key)) ?? [];
    if (!list.some((f) => f.id === id)) return reply.status(404).send({ error: "unknown floor" });
    const stored: StoredFloor = { ...record, id: floorId(record), savedAt: Date.now() };
    await store.set(key, [...list.filter((f) => f.id !== id && f.id !== stored.id), stored]);
    return stored;
  });
}
