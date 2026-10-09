import { isMeraError } from "@category-labs/mera";
import type { TradingAccount } from "shared";
import { createAccount, signIn } from "../mera";
import { avatars, query } from "./dom";
import { session } from "./state";

const gate = query("[data-gate]");
const dash = query("[data-dash]");
const status = query("[data-gate-status]");
const form = query<HTMLFormElement>("[data-gate-form]");
const switchButton = query<HTMLButtonElement>("[data-gate-switch]");
const goButton = query<HTMLButtonElement>("[data-gate-go]");
const titleEl = query("[data-gate-title]");
const hintEl = query("[data-gate-hint]");
const fieldsEl = query("[data-gate-fields]");

type Mode = "signin" | "create";

function say(message: string, tone: "info" | "error" = "info") {
  status.textContent = message;
  status.dataset.tone = tone;
}

function explain(error: unknown): string {
  if (!isMeraError(error)) {
    return error instanceof Error ? error.message : "Something went wrong.";
  }
  const messages: Record<string, string> = {
    PRF_UNAVAILABLE:
      "This passkey cannot derive keys. Try a passkey stored in iCloud Keychain, Google Password Manager or 1Password.",
    PASSKEY_OPERATION_FAILED: "The passkey prompt was cancelled or unavailable.",
    CRYPTO_UNAVAILABLE: "This browser is missing a required crypto primitive.",
  };
  return messages[error.code] ?? `${error.code}: ${error.message}`;
}

async function paintIdentity(account: TradingAccount) {
  const { avatarDataUri, avatarSeed, shortenAddress } = await avatars();
  const short = shortenAddress(account.address);
  const nameEl = document.querySelector<HTMLElement>("[data-account-name]");
  const addressEl = document.querySelector<HTMLElement>("[data-address-text]");
  const avatarEl = document.querySelector<HTMLImageElement>("[data-account-avatar]");
  const topbarEl = document.querySelector<HTMLElement>("[data-topbar-address-text]");
  if (nameEl) nameEl.textContent = "Trader";
  if (addressEl) addressEl.textContent = short;
  if (topbarEl) topbarEl.textContent = short;
  if (avatarEl) {
    avatarEl.src = avatarDataUri(avatarSeed(account.address, 0));
    avatarEl.alt = `Avatar for ${short}`;
  }
}

export function initGate(onEnter: () => void) {
  let mode: Mode = "signin";

  function setMode(next: Mode) {
    mode = next;
    const creating = next === "create";
    titleEl.textContent = creating ? "Create account" : "Sign in";
    hintEl.textContent = creating ? "Two details label your passkey." : "Use your passkey.";
    hintEl.hidden = false;
    fieldsEl.hidden = !creating;
    goButton.textContent = creating ? "Create" : "Sign in";
    switchButton.textContent = creating ? "I have an account" : "Create an account";
    form.querySelectorAll<HTMLInputElement>("input").forEach((input) => (input.required = creating));
    say("");
    if (creating) form.querySelector("input")?.focus();
  }

  async function run(action: () => Promise<TradingAccount>, pending: string) {
    say(pending);
    goButton.disabled = true;
    try {
      const account = await action();
      session.trader = account;
      gate.hidden = true;
      dash.hidden = false;
      await paintIdentity(account);
      onEnter();
    } catch (error) {
      say(explain(error), "error");
    } finally {
      goButton.disabled = false;
    }
  }

  switchButton.addEventListener("click", () => setMode(mode === "signin" ? "create" : "signin"));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (mode === "signin") {
      void run(signIn, "Waiting for your passkey…");
      return;
    }
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    void run(() => createAccount(email, name), "Creating your passkey…");
  });
}
