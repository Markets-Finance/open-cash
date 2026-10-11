import { deleteAccountMessage, listTradingKeys, revokeTradingKey, suppliedUsdc } from "shared";
import { hlNetwork, info } from "../hl";
import { mainExchange } from "../hlSession";
import { clearImport } from "../mera";
import { errorText, query, usd } from "./dom";
import { getDesk } from "./desk";
import { closeModal, openModal } from "./modal";
import { requireTrader } from "./state";

const backend = import.meta.env.PUBLIC_BACKEND_URL ?? "http://localhost:8787";
const confirmWord = "DELETE";

async function blockers(): Promise<string[]> {
  const trader = requireTrader();
  const [desk, lent] = await Promise.all([getDesk(true), suppliedUsdc(info, trader.address).catch(() => 0)]);
  const list: string[] = [];
  if (desk.positions.length > 0) list.push(`You have ${desk.positions.length} open position${desk.positions.length === 1 ? "" : "s"}. Close ${desk.positions.length === 1 ? "it" : "them"} first.`);
  if (desk.orders.length > 0) list.push(`You have ${desk.orders.length} open order${desk.orders.length === 1 ? "" : "s"}, including stops and targets. Cancel ${desk.orders.length === 1 ? "it" : "them"} first.`);
  if (lent > 0.000001) list.push(`${usd(lent)} is lent as a floor. Close your floors first so the money comes back.`);
  return list;
}

export function openDeleteAccount() {
  const trader = requireTrader();
  const panel = openModal(`
    <div class="modal__head"><span class="modal__title">Delete my data?</span><button type="button" class="modal__close" data-close>×</button></div>
    <div class="warn-box"><b>This cannot be undone.</b> Read this before you continue.
      <ul>
        <li>Every trading key for your account is revoked, so nothing can place orders for it.</li>
        <li>Your loss limits, saved floors, bots, saved bins, shared strategies, follow records and X link are deleted from our server. Strategies you shared disappear for everyone who followed them.</li>
        <li>The imported wallet, your profile and everything else saved on this device are wiped, and you are signed out.</li>
      </ul>
    </div>
    <div class="warn-box"><b>What this does not do.</b>
      <ul>
        <li>Your Hyperliquid account and its funds stay on the exchange. Withdraw first if you want them out.</li>
        <li>Your passkey stays in your password manager. Delete it there yourself. If you delete it while an account still holds funds, you will lose access to that account.</li>
        <li>Anyone who has the private key of an imported wallet still controls that wallet.</li>
      </ul>
    </div>
    <p class="quote-line">Account: ${trader.address}${trader.source === "imported" ? " (imported wallet)" : ""}</p>
    <div data-delete-blockers><p class="empty">Checking for open positions, orders and floors…</p></div>
    <label class="field"><span>Type ${confirmWord} to confirm</span><input data-delete-word autocomplete="off" spellcheck="false" /></label>
    <label class="quote-line"><input type="checkbox" data-delete-ack /> I understand this cannot be undone.</label>
    <div class="btn-row">
      <button type="button" class="btn" data-delete-cancel>Cancel</button>
      <button type="button" class="btn btn--danger" data-delete-go disabled>Delete my data</button>
    </div>
    <p class="status-line" data-delete-status></p>
  `);
  const blockersEl = query("[data-delete-blockers]", panel);
  const wordEl = query<HTMLInputElement>("[data-delete-word]", panel);
  const ackEl = query<HTMLInputElement>("[data-delete-ack]", panel);
  const goEl = query<HTMLButtonElement>("[data-delete-go]", panel);
  const statusEl = query("[data-delete-status]", panel);
  let blocked = true;
  let running = false;

  function paint() {
    goEl.disabled = running || blocked || wordEl.value.trim() !== confirmWord || !ackEl.checked;
  }
  [wordEl, ackEl].forEach((el) => el.addEventListener("input", paint));
  ackEl.addEventListener("change", paint);
  query("[data-delete-cancel]", panel).addEventListener("click", closeModal);

  void blockers()
    .then((list) => {
      blocked = list.length > 0;
      blockersEl.innerHTML = blocked ? `<div class="warn-box"><b>Not yet.</b><ul>${list.map((text) => `<li>${text}</li>`).join("")}</ul></div>` : `<p class="quote-line">No open positions, orders or floors. You can continue.</p>`;
      paint();
    })
    .catch((error) => {
      blockersEl.innerHTML = `<p class="status-line" data-tone="error">${errorText(error)}. Deleting is disabled until this check works.</p>`;
    });

  goEl.addEventListener("click", async () => {
    running = true;
    paint();
    statusEl.dataset.tone = "";
    const failures: string[] = [];
    try {
      statusEl.textContent = "Revoking trading keys…";
      const keys = await listTradingKeys(info, trader.address).catch(() => []);
      for (const key of keys) {
        try {
          await revokeTradingKey(mainExchange(trader), key.name);
        } catch (error) {
          failures.push(`Could not revoke ${key.name || key.address}: ${errorText(error)}`);
        }
      }
      statusEl.textContent = "Deleting your data on our server…";
      const issuedAt = Date.now();
      const signature = await trader.account.signMessage({ message: deleteAccountMessage(trader.address, issuedAt) });
      const response = await fetch(`${backend}/account/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: trader.address, issuedAt, signature }),
      });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? `Server ${response.status}`);
      statusEl.textContent = "Wiping this device…";
      await clearImport();
      for (const key of Object.keys(localStorage)) if (key.startsWith("opencash.")) localStorage.removeItem(key);
      sessionStorage.clear();
      statusEl.textContent = failures.length > 0 ? `Done, with problems: ${failures.join(" ")} Signing you out…` : "Done. Everything is deleted. Signing you out…";
      setTimeout(() => location.reload(), failures.length > 0 ? 5000 : 1800);
    } catch (error) {
      running = false;
      statusEl.dataset.tone = "error";
      statusEl.textContent = `Stopped: ${errorText(error)}. Nothing on this device was wiped.`;
      paint();
    }
  });
}
