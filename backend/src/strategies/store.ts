import type { CopyRecord, SharedStrategy } from "shared";
import { JsonFileStore } from "../store/jsonFile.js";

export const strategies = new JsonFileStore<SharedStrategy>("data/strategies.json");
export const copies = new JsonFileStore<CopyRecord>("data/copies.json");

export async function deleteStrategyData(owner: string): Promise<{ strategies: number; copies: number }> {
  const who = owner.toLowerCase();
  const mine = (await strategies.all()).filter((s) => s.author.toLowerCase() === who);
  const mineIds = new Set(mine.map((s) => s.id));
  let removedCopies = 0;
  for (const copy of await copies.all()) {
    if (copy.follower.toLowerCase() === who || mineIds.has(copy.strategyId)) {
      await copies.delete(copy.id);
      removedCopies += 1;
    }
  }
  for (const strategy of mine) await strategies.delete(strategy.id);
  return { strategies: mine.length, copies: removedCopies };
}
