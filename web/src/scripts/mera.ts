import {
  createTradingAccount,
  relyingPartyId,
  relyingPartyName,
  signInTradingAccount,
  type CredentialStore,
  type TradingAccount,
} from "shared";

const storageKey = "opencash.passkey.credential";

const browserStore: CredentialStore = {
  async read() {
    return localStorage.getItem(storageKey);
  },
  async write(value) {
    localStorage.setItem(storageKey, value);
  },
};

export const rpId =
  location.hostname === "localhost" ? "localhost" : relyingPartyId;

function passkeyContext() {
  return { rpId, rpName: relyingPartyName, store: browserStore };
}

export function createAccount(
  userName: string,
  displayName: string,
): Promise<TradingAccount> {
  return createTradingAccount({ ...passkeyContext(), userName, displayName });
}

export function signIn(): Promise<TradingAccount> {
  return signInTradingAccount(passkeyContext());
}
