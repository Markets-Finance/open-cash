import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { HlNetwork as Net } from "shared";

const keysPath = "data/bot-keys.json";
const devSecretPath = "data/bot-secret.key";

type Entry = { agentAddress: string; iv: string; tag: string; data: string; savedAt: number };

let master: Buffer | null = null;

async function masterKey(): Promise<Buffer> {
  if (master) return master;
  const configured = process.env.BOT_KEY_SECRET;
  if (configured) {
    if (!/^[0-9a-f]{64}$/i.test(configured)) throw new Error("BOT_KEY_SECRET must be 64 hex characters");
    master = Buffer.from(configured, "hex");
    return master;
  }
  try {
    master = Buffer.from((await readFile(devSecretPath, "utf8")).trim(), "hex");
  } catch {
    master = randomBytes(32);
    await mkdir(dirname(devSecretPath), { recursive: true });
    await writeFile(devSecretPath, master.toString("hex"), { mode: 0o600 });
    console.warn("bot vault: created a local dev secret in data/bot-secret.key. Set BOT_KEY_SECRET in production.");
  }
  return master;
}

async function readAll(): Promise<Record<string, Entry>> {
  try {
    return JSON.parse(await readFile(keysPath, "utf8")) as Record<string, Entry>;
  } catch {
    return {};
  }
}

const idOf = (owner: string, net: Net) => `${net}:${owner.toLowerCase()}`;

export async function saveKey(owner: string, net: Net, agentAddress: string, secretHex: string): Promise<void> {
  const id = idOf(owner, net);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await masterKey(), iv);
  cipher.setAAD(Buffer.from(id));
  const data = Buffer.concat([cipher.update(secretHex, "utf8"), cipher.final()]);
  const all = await readAll();
  all[id] = { agentAddress, iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex"), data: data.toString("hex"), savedAt: Date.now() };
  await mkdir(dirname(keysPath), { recursive: true });
  await writeFile(keysPath, JSON.stringify(all), { mode: 0o600 });
}

export async function loadKey(owner: string, net: Net): Promise<{ agentAddress: string; secretHex: string } | null> {
  const id = idOf(owner, net);
  const entry = (await readAll())[id];
  if (!entry) return null;
  const decipher = createDecipheriv("aes-256-gcm", await masterKey(), Buffer.from(entry.iv, "hex"));
  decipher.setAAD(Buffer.from(id));
  decipher.setAuthTag(Buffer.from(entry.tag, "hex"));
  const secretHex = Buffer.concat([decipher.update(Buffer.from(entry.data, "hex")), decipher.final()]).toString("utf8");
  return { agentAddress: entry.agentAddress, secretHex };
}

export async function hasKey(owner: string, net: Net): Promise<boolean> {
  return (await readAll())[idOf(owner, net)] !== undefined;
}

export async function removeKey(owner: string, net: Net): Promise<void> {
  const all = await readAll();
  delete all[idOf(owner, net)];
  await writeFile(keysPath, JSON.stringify(all), { mode: 0o600 });
}
