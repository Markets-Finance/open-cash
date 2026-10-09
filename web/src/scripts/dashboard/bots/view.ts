import type { Bot } from "shared";
import { changeClass, esc, usd } from "../dom";

const explorer = "https://app.hyperliquid-testnet.xyz/explorer/tx/";

function legsText(bot: Bot): string {
  return bot.card.legs
    .map((leg) => `${leg.direction === "long" ? "L" : "S"} ${leg.symbol} ${leg.leverage}x`)
    .join(" · ");
}

function logRows(bot: Bot): string {
  if (bot.log.length === 0) return `<div class="bot__log-row">No activity yet.</div>`;
  return bot.log
    .slice(0, 8)
    .map((entry) => {
      const time = new Date(entry.at).toLocaleTimeString();
      const tx = entry.txHash
        ? ` <a href="${explorer}${esc(entry.txHash)}" target="_blank" rel="noreferrer">tx</a>`
        : "";
      return `<div class="bot__log-row bot__log-row--${entry.level}"><span>${time}</span><span>${esc(entry.message)}${tx}</span></div>`;
    })
    .join("");
}

function rulesRow(bot: Bot): string {
  if (bot.mode !== "auto") return "";
  return `<div class="bot__rules">
    <label class="field"><span>Min carry % APR</span><input data-rule="minCarryAprPct" type="number" step="any" value="${bot.rules.minCarryAprPct}" /></label>
    <label class="field"><span>Cooldown min</span><input data-rule="cooldownMin" type="number" min="0" value="${bot.rules.cooldownMin}" /></label>
    <label class="field"><span>Opens / day</span><input data-rule="maxOpensPerDay" type="number" min="1" value="${bot.rules.maxOpensPerDay}" /></label>
  </div>`;
}

export function renderBot(bot: Bot): string {
  const target = bot.card.takeProfitPct === undefined ? "none" : `${bot.card.takeProfitPct}%`;
  return `<div class="bot card" data-bot="${esc(bot.id)}">
    <div class="bot__head">
      <span class="bot__name">${esc(bot.name)}</span>
      <span class="pill">${bot.mode === "auto" ? "Auto" : "Guard"}</span>
      <span class="pill pill--${bot.status}">${bot.status}</span>
      <span class="bot__spacer"></span>
      <button type="button" class="btn ${bot.enabled ? "" : "btn--primary"}" data-bot-toggle>${bot.enabled ? "Stop" : "Start"}</button>
      <button type="button" class="link-btn" data-bot-share>Share</button>
      <button type="button" class="link-btn" data-bot-server>Run on server</button>
      <button type="button" class="link-btn" data-bot-delete>Delete</button>
    </div>
    <div class="bot__meta">
      <span>${esc(legsText(bot))}</span>
      <span>Margin ${usd(bot.card.marginUsd)}</span>
      <span>Stop ${bot.card.stopLossPct}%</span>
      <span>Target ${target}</span>
      <span class="${changeClass(bot.realizedPnlUsd)}">Realised ${usd(bot.realizedPnlUsd)}</span>
    </div>
    ${rulesRow(bot)}
    ${bot.lastCheck ? `<div class="bot__meta"><span>Checked ${new Date(bot.lastCheck.at).toLocaleTimeString()}: ${esc(bot.lastCheck.message)}</span></div>` : ""}
    <div class="bot__log">${logRows(bot)}</div>
  </div>`;
}
