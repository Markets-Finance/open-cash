import "react-native-get-random-values";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { reactNativeWebAuthnClient } from "@category-labs/mera/react-native-webauthn-client";
import {
  clearImportedWallet,
  createTradingAccount,
  importWalletKey,
  relyingPartyId,
  relyingPartyName,
  revealRecoveryPhrase,
  signInTradingAccount,
  type CredentialStore,
  type TradingAccount,
} from "shared";

const storageKey = "opencash.passkey.credential";
const importStorageKey = "opencash.import.v1";
export const rpId = relyingPartyId;

const nativeStore: CredentialStore = {
  read: () => AsyncStorage.getItem(storageKey),
  write: (value) => AsyncStorage.setItem(storageKey, value),
};

const importStore: CredentialStore = {
  read: () => AsyncStorage.getItem(importStorageKey),
  write: async (value) => {
    if (value === "") await AsyncStorage.removeItem(importStorageKey);
    else await AsyncStorage.setItem(importStorageKey, value);
  },
};

function passkeyContext() {
  return {
    rpId,
    rpName: relyingPartyName,
    store: nativeStore,
    importStore,
    webAuthnClient: reactNativeWebAuthnClient,
  };
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

export function revealPhrase(): Promise<string> {
  return revealRecoveryPhrase(passkeyContext());
}

export function importWallet(privateKey: string, expectedAddress: string): Promise<`0x${string}`> {
  return importWalletKey(passkeyContext(), { privateKey, expectedAddress });
}

export function clearImport(): Promise<void> {
  return clearImportedWallet(passkeyContext());
}
