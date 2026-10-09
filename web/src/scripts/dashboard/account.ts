import { avatars, query } from "./dom";
import { disconnect } from "./tabs";
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
    if (avatarEl) {
      avatarEl.src = avatarDataUri(avatarSeed(trader.address, variant));
      avatarEl.alt = `Avatar for ${shortenAddress(trader.address)}`;
    }
  }
  void paint();

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
