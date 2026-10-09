import { hlNetwork } from "../hl";
import { addBotFromCard } from "./bots";
import { changeClass, errorText, esc, query, say, usd } from "./dom";
import { requireTrader } from "./state";
import { followStrategy, loadStrategies, type StrategyRow } from "./strategies";

const backend = import.meta.env.PUBLIC_BACKEND_URL ?? "http://localhost:8787";

type Row = {
  rank: number;
  address: string | null;
  handle: string | null;
  netPnlUsd: number;
  volumeUsd: number;
  equityUsd: number;
  roiPct: number;
};

type Board = { network: string; windowHours: number; syncedAt: number; rows: Row[] };

function who(row: Row): string {
  if (row.handle) {
    return `<a href="https://x.com/${esc(row.handle)}" target="_blank" rel="noreferrer">@${esc(row.handle)}</a> <span title="Verified on X">✓</span>`;
  }
  return row.address ? `${esc(row.address.slice(0, 6))}…${esc(row.address.slice(-4))}` : "Unknown";
}

function strategyWho(row: StrategyRow): string {
  if (row.authorHandle) return `@${esc(row.authorHandle)} ✓`;
  return `${esc(row.author.slice(0, 6))}…${esc(row.author.slice(-4))}`;
}

function legsText(row: StrategyRow): string {
  return row.card.legs
    .map((l) => `<span class="asset-row--link" data-open-asset="${esc(l.symbol)}" tabindex="0">${l.direction === "long" ? "L" : "S"} ${esc(l.symbol)} ${l.leverage}x ↗</span>`)
    .join(" · ");
}

async function renderStrategies() {
  const note = query("[data-strategies-note]");
  const table = query("[data-strategies-table]");
  const status = query("[data-strategies-status]");
  try {
    const { note: disclosure, rows } = await loadStrategies();
    const mine = requireTrader().address.toLowerCase();
    note.textContent = `Ranked by the median return on margin of followers, author excluded, once two followers have closed trades. ${disclosure}`;
    if (rows.length === 0) {
      table.innerHTML = `<p class="empty">No strategies shared yet. Share one from Your bots in the Agent tab.</p>`;
      return;
    }
    table.innerHTML = `<table class="data-table">
      <thead><tr><th>#</th><th>Strategy</th><th>Author</th><th>Followers</th><th style="text-align:right">Median follower return</th><th>Follower PnL</th><th>Author's own</th><th></th></tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr>
            <td class="cell-muted">${r.rank ?? "–"}</td>
            <td><b>${esc(r.name)}</b><div class="cell-muted">${legsText(r)} · stop ${r.card.stopLossPct}%</div></td>
            <td class="cell-muted">${strategyWho(r)}</td>
            <td class="cell-muted">${r.activeFollowers} active, ${r.qualifyingFollowers} with trades</td>
            <td class="cell-value ${r.medianRoiPct === null ? "" : changeClass(r.medianRoiPct)}">${r.medianRoiPct === null ? "needs 2 followers" : `${r.medianRoiPct.toFixed(1)}%`}</td>
            <td class="cell-muted">${usd(r.totalFollowerPnlUsd)}</td>
            <td class="cell-muted">${r.authorRoiPct === null ? "–" : `${r.authorRoiPct.toFixed(1)}%`}</td>
            <td>${r.author.toLowerCase() === mine ? `<span class="cell-muted">Yours</span>` : `<button type="button" class="link-btn" data-follow="${esc(r.strategyId)}">Follow</button>`}</td>
          </tr>`,
        )
        .join("")}</tbody></table>`;
    table.querySelectorAll<HTMLButtonElement>("[data-follow]").forEach((button) =>
      button.addEventListener("click", async () => {
        const row = rows.find((r) => r.strategyId === button.dataset.follow)!;
        button.disabled = true;
        try {
          await followStrategy(row.strategyId, row.card.marginUsd);
          await addBotFromCard(row.card, "auto");
          say(status, `Following ${row.name}. An Auto bot was added under Your bots in the Agent tab. Press Start there to run it.`);
          await renderStrategies();
        } catch (error) {
          say(status, errorText(error), "error");
          button.disabled = false;
        }
      }),
    );
  } catch (error) {
    note.textContent = errorText(error);
  }
}

export async function initRanks() {
  void renderStrategies();
  const note = query("[data-ranks-note]");
  const table = query("[data-ranks-table]");
  try {
    const response = await fetch(`${backend}/leaderboard?limit=50&network=${hlNetwork}`);
    if (!response.ok) throw new Error(`Leaderboard ${response.status}`);
    const board = (await response.json()) as Board;
    note.textContent = `Hyperliquid ${board.network}, last ${Math.round(board.windowHours / 24)} days. Profit and volume from Hyperliquid's own stats. Wallets with at least $10,000 in the account. Synced ${new Date(board.syncedAt).toLocaleTimeString()}.`;
    if (board.rows.length === 0) {
      table.innerHTML = `<p class="empty">No account has met the minimum yet.</p>`;
      return;
    }
    table.innerHTML = `<table class="data-table">
      <thead><tr><th>#</th><th>Trader</th><th style="text-align:right">Profit</th><th>Return</th><th>Account value</th><th>Volume</th></tr></thead>
      <tbody>${board.rows
        .map(
          (r) => `<tr>
            <td class="cell-muted">${r.rank}</td>
            <td>${who(r)}</td>
            <td class="cell-value ${changeClass(r.netPnlUsd)}">${usd(r.netPnlUsd)}</td>
            <td class="cell-muted ${changeClass(r.roiPct)}">${r.roiPct.toFixed(1)}%</td>
            <td class="cell-muted">${usd(r.equityUsd)}</td>
            <td class="cell-muted">${usd(r.volumeUsd)}</td>
          </tr>`,
        )
        .join("")}</tbody></table>`;
  } catch (error) {
    note.textContent = errorText(error);
  }
}
