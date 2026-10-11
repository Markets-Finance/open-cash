import { tickLive, type HlNetwork, type LiveDeps } from "shared";
import { agentIssue } from "../runner/integrity.js";
import { loadKey } from "../runner/vault.js";
import { liveDepsFor, liveMandateIssue } from "./deps.js";
import { getLive, listLive, saveLive, withLiveLock, type ServerLiveBot } from "./store.js";

export function halted(bot: ServerLiveBot, message: string): ServerLiveBot {
  return { ...bot, enabled: false, status: "halted", log: [{ at: Date.now(), level: "error" as const, message }, ...bot.log].slice(0, 60) };
}

async function tickLiveOwner(owner: string, net: HlNetwork, ids: string[]): Promise<void> {
  const stored = await loadKey(owner, net);
  const problem = stored ? await agentIssue(owner, net, stored.agentAddress).catch(() => null) : "No agent key saved for this wallet";
  const deps: LiveDeps | null = problem ? null : await liveDepsFor(owner, net);
  for (const id of ids) {
    await withLiveLock(id, async () => {
      const bot = await getLive(id);
      if (!bot || !bot.enabled || bot.status === "halted") return;
      if (!deps) return saveLive(halted(bot, problem ?? "Agent key unavailable"));
      const issue = await liveMandateIssue(bot);
      if (issue) return saveLive(halted(bot, issue));
      const next = await tickLive(bot, deps);
      await saveLive({ ...next, owner: bot.owner, net: bot.net, mandate: bot.mandate });
    });
  }
}

export async function tickLiveAll(): Promise<void> {
  const groups = new Map<string, string[]>();
  for (const bot of await listLive({ enabled: true })) {
    const key = `${bot.net}:${bot.owner.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), bot.id]);
  }
  await Promise.allSettled(
    [...groups.entries()].map(([key, ids]) => {
      const [net, owner] = key.split(":") as [HlNetwork, string];
      return tickLiveOwner(owner, net, ids).catch((error) => console.error(`live runner ${key} failed`, error));
    }),
  );
}
