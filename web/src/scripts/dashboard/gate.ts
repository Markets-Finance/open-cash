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
const importBlock = query("[data-gate-import-block]");
const importToggle = query<HTMLInputElement>("[data-gate-import-toggle]");
const importFields = query("[data-gate-import-fields]");
const importLink = query<HTMLButtonElement>("[data-gate-import]");

type Mode = "signin" | "create";

function say(message: string, tone: "info" | "error" = "info") {
  status.textContent = message;
  status.dataset.tone = tone;
}

function explain(error: unknown, mode: Mode): string {
  if (!isMeraError(error)) {
    return error instanceof Error ? error.message : "Something went wrong.";
  }
  const messages: Record<string, string> = {
    PRF_UNAVAILABLE:
      "This passkey cannot derive keys. Try a passkey stored in iCloud Keychain, Google Password Manager or 1Password.",
    PASSKEY_OPERATION_FAILED:
      mode === "signin"
        ? "We couldn't find a passkey to sign in with, or the prompt was closed. New to OpenCash? Tap \"Create an account\" below."
        : "The passkey prompt was closed before it finished. Tap Create to try again.",
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

  function syncRequired() {
    const creating = mode === "create";
    const importing = creating && importToggle.checked;
    for (const name of ["name", "email"]) form.querySelector<HTMLInputElement>(`[name="${name}"]`)!.required = creating;
    for (const name of ["importAddress", "importKey"]) form.querySelector<HTMLInputElement>(`[name="${name}"]`)!.required = importing;
  }

  function setMode(next: Mode) {
    mode = next;
    const creating = next === "create";
    titleEl.textContent = creating ? "Create account" : "Sign in";
    hintEl.textContent = creating ? "Two details label your passkey." : "Use your passkey.";
    hintEl.hidden = false;
    fieldsEl.hidden = !creating;
    importBlock.hidden = !creating;
    importLink.hidden = creating;
    if (!creating) {
      importToggle.checked = false;
      importFields.hidden = true;
    }
    goButton.textContent = creating ? "Create" : "Sign in";
    switchButton.textContent = creating ? "I have an account" : "Create an account";
    syncRequired();
    say("");
    if (creating) form.querySelector("input")?.focus();
  }

  async function run(action: () => Promise<TradingAccount>, pending: string, profile?: { name: string; email: string }) {
    say(pending);
    goButton.disabled = true;
    try {
      const account = await action();
      session.trader = account;
      if (profile) localStorage.setItem("opencash.profile", JSON.stringify(account.sealProfile(JSON.stringify({ ...profile, variant: 0 }))));
      gate.hidden = true;
      dash.hidden = false;
      await paintIdentity(account);
      onEnter();
    } catch (error) {
      say(explain(error, mode), "error");
    } finally {
      goButton.disabled = false;
    }
  }

  switchButton.addEventListener("click", () => setMode(mode === "signin" ? "create" : "signin"));
  importToggle.addEventListener("change", () => {
    importFields.hidden = !importToggle.checked;
    syncRequired();
  });
  importLink.addEventListener("click", () => {
    setMode("create");
    importToggle.checked = true;
    importFields.hidden = false;
    syncRequired();
    hintEl.textContent = "Two details label your passkey. Your wallet is encrypted with it.";
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (mode === "signin") {
      void run(signIn, "Waiting for your passkey…");
      return;
    }
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const bringing = importToggle.checked;
    const importKey = bringing ? { privateKey: String(data.get("importKey") ?? ""), expectedAddress: String(data.get("importAddress") ?? "") } : undefined;
    void run(async () => {
      try {
        return await createAccount(email, name, importKey);
      } finally {
        const field = form.querySelector<HTMLInputElement>('[name="importKey"]');
        if (field) field.value = "";
      }
    }, bringing ? "Creating your passkey and importing your wallet…" : "Creating your passkey…", { name, email });
  });
}
