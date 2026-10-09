import "react-native-get-random-values";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { reactNativeWebAuthnClient } from "@category-labs/mera/react-native-webauthn-client";
import {
  createTradingAccount,
  relyingPartyId,
  relyingPartyName,
  revealRecoveryPhrase,
  signInTradingAccount,
  type CredentialStore,
  type TradingAccount,
} from "shared";

const storageKey = "opencash.passkey.credential";
export const rpId = relyingPartyId;

const nativeStore: CredentialStore = {
  read: () => AsyncStorage.getItem(storageKey),
  write: (value) => AsyncStorage.setItem(storageKey, value),
};

function passkeyContext() {
  return {
    rpId,
    rpName: relyingPartyName,
    store: nativeStore,
    webAuthnClient: reactNativeWebAuthnClient,
  };
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

export function revealPhrase(): Promise<string> {
  return revealRecoveryPhrase(passkeyContext());
}
