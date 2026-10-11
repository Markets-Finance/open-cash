import { avatars, query } from "./dom";
import { disconnect } from "./tabs";
import { listTradingKeys, revokeTradingKey, type TradingKey } from "shared";
import { privateKeyToAccount } from "viem/accounts";
import { hlNetwork, info } from "../hl";
import { mainExchange } from "../hlSession";
import { openDeleteAccount } from "./deleteAccount";
import { clearImport, importWallet } from "../mera";
import { initGuardrailsPane } from "./guardrails";
import { initIdentity } from "./identity";
import { requireTrader } from "./state";

type Profile = { name: string; email: string; variant?: number };

const profileKey = "opencash.profile";

export function initAccount() {
  const trader = requireTrader();
  const nameInput = query<HTMLInputElement>("[data-profile-name]");
  const emailInput = query<HTMLInputElement>("[data-profile-email]");
  const status = query("[data-account-status]");
  let variant = 0;

  function loadProfile(): Profile | null {
    const raw = localStorage.getItem(profileKey);
    if (raw === null) return null;
    try {
      return JSON.parse(trader.openProfile(JSON.parse(raw)));
    } catch {
      return null;
    }
  }

  function saveProfile(value: Profile) {
    localStorage.setItem(profileKey, JSON.stringify(trader.sealProfile(JSON.stringify(value))));
  }

  async function paint() {
    const { avatarDataUri, avatarSeed, shortenAddress } = await avatars();
    const nameEl = document.querySelector<HTMLElement>("[data-account-name]");
    const emailEl = document.querySelector<HTMLElement>("[data-account-email]");
    const avatarEl = document.querySelector<HTMLImageElement>("[data-account-avatar]");
    const profile = loadProfile();
    variant = profile?.variant ?? 0;
    nameInput.value = profile?.name ?? "";
    emailInput.value = profile?.email ?? "";
    if (nameEl) nameEl.textContent = profile?.name || "Trader";
    if (emailEl) emailEl.textContent = profile?.email ?? "";
    const networkEl = document.querySelector<HTMLElement>("[data-account-network]");
    if (networkEl) networkEl.textContent = hlNetwork === "mainnet" ? "Hyperliquid Mainnet" : "Hyperliquid Testnet";
    if (avatarEl) {
      avatarEl.src = avatarDataUri(avatarSeed(trader.address, variant));
      avatarEl.alt = `Avatar for ${shortenAddress(trader.address)}`;
    }
  }
  void paint();
  void initIdentity();
  initGuardrailsPane();
  initImportPane();
  initKeysPane();
  document.querySelector("[data-delete-account]")?.addEventListener("click", openDeleteAccount);

  const home = query("[data-acct-home]");
  const panes = Array.from(document.querySelectorAll<HTMLElement>("[data-acct-pane]"));
  function showPage(key: string | null) {
    home.hidden = key !== null;
    panes.forEach((pane) => (pane.hidden = pane.dataset.acctPane !== key));
    window.scrollTo({ top: 0 });
  }
  document.querySelectorAll<HTMLButtonElement>("[data-acct-open]").forEach((row) => row.addEventListener("click", () => showPage(row.dataset.acctOpen!)));
  document.querySelectorAll<HTMLButtonElement>("[data-acct-back]").forEach((button) => button.addEventListener("click", () => showPage(null)));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !home.offsetParent) showPage(null);
  });
  const addressEl = document.querySelector<HTMLElement>("[data-wallet-address]");
  if (addressEl) addressEl.textContent = trader.address;
  document.querySelector<HTMLButtonElement>("[data-copy-address]")?.addEventListener("click", async (event) => {
    await navigator.clipboard.writeText(trader.address);
    const button = event.currentTarget as HTMLButtonElement;
    button.textContent = "Copied";
    setTimeout(() => (button.textContent = "Copy address"), 1400);
  });

  query<HTMLButtonElement>("[data-save-profile]").addEventListener("click", () => {
    saveProfile({ name: nameInput.value.trim(), email: emailInput.value.trim(), variant });
    status.textContent = "Saved on this device, encrypted with a key only your passkey derives.";
    void paint();
  });
  query<HTMLButtonElement>("[data-shuffle]").addEventListener("click", () => {
    variant = (variant + 1) % 12;
    const profile = loadProfile();
    saveProfile({ name: profile?.name ?? "", email: profile?.email ?? "", variant });
    void paint();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-sign-out]").forEach((button) => button.addEventListener("click", disconnect));

  document.querySelector<HTMLButtonElement>("[data-copy]")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(trader.address);
    const hint = document.querySelector<HTMLElement>("[data-copy-hint]");
    if (hint) {
      hint.textContent = "Copied";
      setTimeout(() => (hint.textContent = "Copy"), 1400);
    }
  });
}

function initImportPane() {
  const trader = requireTrader();
  const state = query("[data-import-state]");
  const addressInput = query<HTMLInputElement>("[data-import-address]");
  const keyInput = query<HTMLInputElement>("[data-import-key]");
  const go = query<HTMLButtonElement>("[data-import-go]");
  const remove = query<HTMLButtonElement>("[data-import-remove]");
  const status = query("[data-import-status]");
  const say = (text: string, tone = "") => {
    status.textContent = text;
    status.dataset.tone = tone;
  };

  const imported = trader.source === "imported";
  state.textContent = imported
    ? `You are using the imported wallet ${trader.address}. Your passkey account is ${trader.passkeyAddress}.`
    : `You are using your passkey account ${trader.address}. Nothing is imported.`;
  remove.hidden = !imported;

  go.addEventListener("click", async () => {
    go.disabled = true;
    try {
      say("Waiting for your passkey…");
      const address = await importWallet(keyInput.value, addressInput.value);
      keyInput.value = "";
      say(`Imported ${address}. Reloading so you can sign in with it…`);
      setTimeout(() => location.reload(), 1200);
    } catch (error) {
      keyInput.value = "";
      say(error instanceof Error ? error.message : String(error), "error");
      go.disabled = false;
    }
  });

  remove.addEventListener("click", async () => {
    remove.disabled = true;
    try {
      await clearImport();
      say("Removed the imported wallet. Reloading…");
      setTimeout(() => location.reload(), 900);
    } catch (error) {
      say(error instanceof Error ? error.message : String(error), "error");
      remove.disabled = false;
    }
  });
}

function initKeysPane() {
  const trader = requireTrader();
  const list = query("[data-keys-list]");
  const status = query("[data-keys-status]");
  const storageKey = `opencash.hl.agent.${hlNetwork}.${trader.address.toLowerCase()}`;
  let keys: TradingKey[] = [];

  function thisBrowser(): string | null {
    try {
      const stored = localStorage.getItem(storageKey) as `0x${string}` | null;
      return stored ? privateKeyToAccount(stored).address.toLowerCase() : null;
    } catch {
      return null;
    }
  }

  async function load() {
    try {
      keys = await listTradingKeys(info, trader.address);
    } catch (error) {
      list.innerHTML = `<p class="status-line" data-tone="error">${error instanceof Error ? error.message : String(error)}</p>`;
      return;
    }
    const mine = thisBrowser();
    list.innerHTML =
      keys.length === 0
        ? `<p class="empty">No trading keys yet. One is created the first time you place an order.</p>`
        : keys
            .map(
              (key, index) => `<div class="setting-row"><span class="setting-row__label">${key.name || "Unnamed key"}${key.address.toLowerCase() === mine ? " · this browser" : ""}<br /><small>${key.address.slice(0, 8)}…${key.address.slice(-6)}${key.validUntil ? ` · expires ${new Date(key.validUntil).toLocaleDateString()}` : ""}</small></span><button type="button" class="link-btn" data-key-revoke="${index}">Revoke</button></div>`,
            )
            .join("");
  }

  list.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-key-revoke]");
    if (!button) return;
    const key = keys[Number(button.dataset.keyRevoke)];
    if (!key) return;
    button.disabled = true;
    status.dataset.tone = "";
    status.textContent = `Revoking ${key.name || "the key"}…`;
    try {
      await revokeTradingKey(mainExchange(trader), key.name);
      if (key.address.toLowerCase() === thisBrowser()) localStorage.removeItem(storageKey);
      status.textContent = "Revoked. That key can no longer place orders.";
      await load();
    } catch (error) {
      status.dataset.tone = "error";
      status.textContent = error instanceof Error ? error.message : String(error);
      button.disabled = false;
    }
  });

  document.querySelector('[data-acct-open="keys"]')?.addEventListener("click", () => void load());
}
