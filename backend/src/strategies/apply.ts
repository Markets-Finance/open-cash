import { accumulate, createHlInfo, type CopyRecord } from "shared";
import { copies, strategies } from "./store.js";

const syncEveryMs = 60_000;
let syncing = false;

async function refresh(copy: CopyRecord, now: number): Promise<CopyRecord> {
  const strategy = await strategies.get(copy.strategyId);
  if (!strategy) return copy;
  const from = Math.max(copy.startMs, copy.countedThroughMs);
  const until = copy.stopMs ?? now;
  if (from >= until) return copy;
  const info = createHlInfo(copy.network);
  const [fills, fundings] = await Promise.all([
    info.userFillsByTime({ user: copy.follower, startTime: from + 1, endTime: until }),
    info.userFunding({ user: copy.follower, startTime: from + 1, endTime: until }),
  ]);
  const symbols = new Set(strategy.card.legs.map((leg) => leg.symbol));
  return accumulate(copy, fills, fundings, symbols, now);
}

export async function syncCopies(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const now = Date.now();
    for (const copy of await copies.all()) {
      if (copy.stopMs !== null && copy.countedThroughMs >= copy.stopMs) continue;
      const next = await refresh(copy, now).catch(() => copy);
      if (next !== copy) await copies.set(copy.id, next);
    }
  } finally {
    syncing = false;
  }
}

export function startCopySync(onError: (error: unknown) => void): void {
  const run = () => syncCopies().catch(onError);
  void run();
  setInterval(run, syncEveryMs);
}
