import "react-native-get-random-values";

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { reactNativeWebAuthnClient } from "@category-labs/mera/react-native-webauthn-client";
import {
  clearImportedWallet,
  createTradingAccount,
  importWalletKey,
  relyingPartyId,
  relyingPartyName,
  resumeTradingAccount,
  revealRecoveryPhrase,
  signInTradingAccount,
  type CredentialStore,
  type TradingAccount,
} from "shared";

const storageKey = "opencash.passkey.credential";
const importStorageKey = "opencash.import.v1";
const sessionStorageKey = "opencash.session.v1";
const sessionTtlMs = 24 * 60 * 60 * 1000;
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

const sessionStore: CredentialStore = {
  read: async () => {
    try {
      const raw = await SecureStore.getItemAsync(sessionStorageKey);
      if (raw === null) return null;
      const saved = JSON.parse(raw) as { secret: string; at: number };
      if (Date.now() - saved.at > sessionTtlMs) {
        await SecureStore.deleteItemAsync(sessionStorageKey);
        return null;
      }
      await SecureStore.setItemAsync(sessionStorageKey, JSON.stringify({ secret: saved.secret, at: Date.now() }));
      return saved.secret;
    } catch {
      return null;
    }
  },
  write: async (value) => {
    if (value === "") await SecureStore.deleteItemAsync(sessionStorageKey);
    else await SecureStore.setItemAsync(sessionStorageKey, JSON.stringify({ secret: value, at: Date.now() }));
  },
};

function passkeyContext() {
  return {
    rpId,
    rpName: relyingPartyName,
    store: nativeStore,
    importStore,
    sessionStore,
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

export async function resumeSession(): Promise<TradingAccount | null> {
  try {
    return await resumeTradingAccount(passkeyContext());
  } catch {
    await sessionStore.write("");
    return null;
  }
}

export function touchSession(): Promise<string | null> {
  return sessionStore.read();
}

export function endSession(): Promise<void> {
  return sessionStore.write("");
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
