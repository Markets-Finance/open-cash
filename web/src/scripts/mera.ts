import {
  clearImportedWallet,
  createTradingAccount,
  importWalletKey,
  relyingPartyId,
  relyingPartyName,
  signInTradingAccount,
  type CredentialStore,
  type TradingAccount,
} from "shared";

const storageKey = "opencash.passkey.credential";
const importStorageKey = "opencash.import.v1";

const browserStore: CredentialStore = {
  async read() {
    return localStorage.getItem(storageKey);
  },
  async write(value) {
    localStorage.setItem(storageKey, value);
  },
};

const importStore: CredentialStore = {
  async read() {
    return localStorage.getItem(importStorageKey);
  },
  async write(value) {
    if (value === "") localStorage.removeItem(importStorageKey);
    else localStorage.setItem(importStorageKey, value);
  },
};

export const rpId =
  location.hostname === "localhost" ? "localhost" : relyingPartyId;

function passkeyContext() {
  return { rpId, rpName: relyingPartyName, store: browserStore, importStore };
}

export function createAccount(
  userName: string,
  displayName: string,
  importKey?: { privateKey: string; expectedAddress?: string },
): Promise<TradingAccount> {
  return createTradingAccount({ ...passkeyContext(), userName, displayName, importKey });
}

export function signIn(): Promise<TradingAccount> {
  return signInTradingAccount(passkeyContext());
}

export function importWallet(privateKey: string, expectedAddress: string): Promise<`0x${string}`> {
  return importWalletKey(passkeyContext(), { privateKey, expectedAddress });
}

export function clearImport(): Promise<void> {
  return clearImportedWallet(passkeyContext());
}
