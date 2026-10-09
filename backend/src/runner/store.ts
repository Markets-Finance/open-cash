import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Bot } from "shared";
import type { HlNetwork as Net } from "shared";

export type ServerBot = Bot & {
  owner: string;
  net: Net;
  mandate: { digest: string; signature: string; issuedAt: number };
};

const path = "data/server-bots.json";

let bots: ServerBot[] | null = null;
let writing: Promise<void> = Promise.resolve();

async function load(): Promise<ServerBot[]> {
  if (bots) return bots;
  try {
    bots = JSON.parse(await readFile(path, "utf8")) as ServerBot[];
  } catch {
    bots = [];
  }
  return bots;
}

function persist(): Promise<void> {
  writing = writing.then(async () => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(bots ?? []));
  });
  return writing;
}

export async function listBots(filter: { owner?: string; net?: Net; enabled?: boolean } = {}): Promise<ServerBot[]> {
  return (await load()).filter(
    (bot) =>
      (filter.owner === undefined || bot.owner.toLowerCase() === filter.owner.toLowerCase()) &&
      (filter.net === undefined || bot.net === filter.net) &&
      (filter.enabled === undefined || bot.enabled === filter.enabled),
  );
}

export async function getBot(id: string): Promise<ServerBot | null> {
  return (await load()).find((bot) => bot.id === id) ?? null;
}

export async function saveBot(bot: ServerBot): Promise<void> {
  const all = await load();
  const index = all.findIndex((item) => item.id === bot.id);
  if (index === -1) all.unshift(bot);
  else all[index] = bot;
  await persist();
}

export async function deleteBot(id: string): Promise<void> {
  bots = (await load()).filter((bot) => bot.id !== id);
  await persist();
}
