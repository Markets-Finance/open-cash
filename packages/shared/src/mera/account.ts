import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
  type PasskeyCredentialMetadata,
  type WebAuthnClient,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import {
  deriveNamespaceKey,
  open as openSealed,
  parseSealedRecord,
  seal as sealPlaintext,
  type SealedRecord,
} from "./namespace.js";
import { isDevAuth } from "./config.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { utf8 } from "@scure/base";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { LocalAccount } from "viem";

const evmAccountPath = "m/44'/60'/0'/0/0";

const devEntropy = sha256(utf8.decode("opencash.dev.account.v1"));

function devTradingAccount(): TradingAccount {
  return deriveTradingAccount(Uint8Array.from(devEntropy));
}

export const profileNamespace = "terminal.profile.v1";
export const importNamespace = "terminal.import.v1";

export type CredentialStore = {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
};

export type PasskeyContext = {
  rpId: string;
  rpName: string;
  store: CredentialStore;
  importStore?: CredentialStore;
  sessionStore?: CredentialStore;
  webAuthnClient?: WebAuthnClient;
};

export type TradingAccount = {
  source: "passkey" | "imported";
  passkeyAddress: `0x${string}`;
  address: `0x${string}`;
  account: LocalAccount<"mera">;
  sealProfile(plaintext: string): SealedRecord;
  openProfile(record: SealedRecord): string;
  end(): void;
};

export function normalizePrivateKey(value: string): Uint8Array {
  const trimmed = value.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) throw new Error("A private key is 64 hexadecimal characters, optionally starting with 0x.");
  return hexToBytes(trimmed);
}

export function sealImportedKey(prfOutput: Uint8Array, privateKey: Uint8Array): SealedRecord {
  const key = deriveNamespaceKey(prfOutput, importNamespace);
  const record = sealPlaintext(key, importNamespace, Array.from(privateKey, (b) => b.toString(16).padStart(2, "0")).join(""));
  key.fill(0);
  return record;
}

export function openImportedKey(prfOutput: Uint8Array, record: SealedRecord): Uint8Array {
  const key = deriveNamespaceKey(prfOutput, importNamespace);
  try {
    return hexToBytes(openSealed(key, record));
  } finally {
    key.fill(0);
  }
}

function deriveTradingAccount(prfOutput: Uint8Array, imported?: Uint8Array): TradingAccount {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(evmAccountPath);
  if (node.privateKey === null) throw new Error("derivation produced no key");

  const passkeySession = createSecp256k1SigningSession({ privateKey: node.privateKey });
  const passkeyAddress = getEvmAddress(passkeySession.publicKey);
  const session = imported ? createSecp256k1SigningSession({ privateKey: imported }) : passkeySession;
  if (imported) passkeySession.end();
  const profileKey = deriveNamespaceKey(prfOutput, profileNamespace);

  seed.fill(0);
  node.wipePrivateData();
  prfOutput.fill(0);
  imported?.fill(0);

  return {
    source: imported ? "imported" : "passkey",
    passkeyAddress,
    address: getEvmAddress(session.publicKey),
    account: toViemAccount(session),
    sealProfile: (plaintext) =>
      sealPlaintext(profileKey, profileNamespace, plaintext),
    openProfile: (record) => openSealed(profileKey, record),
    end: () => {
      profileKey.fill(0);
      session.end();
    },
  };
}

async function keepSession(context: PasskeyContext, prfOutput: Uint8Array): Promise<void> {
  if (context.sessionStore) await context.sessionStore.write(Array.from(prfOutput, (b) => b.toString(16).padStart(2, "0")).join(""));
}

function checkedImport(input: { privateKey: string; expectedAddress?: string }): Uint8Array {
  const privateKey = normalizePrivateKey(input.privateKey);
  const preview = createSecp256k1SigningSession({ privateKey: Uint8Array.from(privateKey) });
  const address = getEvmAddress(preview.publicKey);
  preview.end();
  if (input.expectedAddress && input.expectedAddress.trim().toLowerCase() !== address.toLowerCase()) {
    privateKey.fill(0);
    throw new Error(`That key belongs to ${address}, not the address you entered. Nothing was imported.`);
  }
  return privateKey;
}

export async function createTradingAccount(
  context: PasskeyContext & { userName: string; displayName: string; importKey?: { privateKey: string; expectedAddress?: string } },
): Promise<TradingAccount> {
  if (isDevAuth) return devTradingAccount();

  const importing = context.importKey ? checkedImport(context.importKey) : null;
  if (importing && !context.importStore) throw new Error("Importing is not available on this device.");

  const created = await createPasskeyWithPrfOutput({
    rp: { id: context.rpId, name: context.rpName },
    user: { name: context.userName, displayName: context.displayName },
    webAuthnClient: context.webAuthnClient,
  });

  await context.store.write(
    JSON.stringify({
      credentialId: created.credentialId,
      transports: created.transports,
    }),
  );

  await keepSession(context, created.prfOutput);

  if (importing && context.importStore) {
    const record = sealImportedKey(Uint8Array.from(created.prfOutput), Uint8Array.from(importing));
    await context.importStore.write(JSON.stringify(record));
    return deriveTradingAccount(created.prfOutput, importing);
  }

  return deriveTradingAccount(created.prfOutput);
}

async function readCredential(
  context: PasskeyContext,
): Promise<PasskeyCredentialMetadata | undefined> {
  const stored = await context.store.read();
  return stored === null ? undefined : JSON.parse(stored);
}

export async function signInTradingAccount(
  context: PasskeyContext,
): Promise<TradingAccount> {
  if (isDevAuth) return devTradingAccount();

  const known = await readCredential(context);

  const { prfOutput, credentialId } = await getPasskeyPrfOutput({
    rpId: context.rpId,
    credential: known,
    webAuthnClient: context.webAuthnClient,
  });

  if (known?.credentialId !== credentialId) {
    await context.store.write(JSON.stringify({ credentialId }));
  }
  await keepSession(context, prfOutput);

  const sealed = context.importStore ? await context.importStore.read() : null;
  if (sealed) return deriveTradingAccount(prfOutput, openImportedKey(prfOutput, parseSealedRecord(sealed)));
  return deriveTradingAccount(prfOutput);
}

export async function resumeTradingAccount(context: PasskeyContext): Promise<TradingAccount | null> {
  if (isDevAuth || !context.sessionStore) return null;
  const stored = await context.sessionStore.read();
  if (!stored || !/^[0-9a-f]{64}$/.test(stored)) return null;
  const prfOutput = hexToBytes(stored);
  const sealed = context.importStore ? await context.importStore.read() : null;
  if (sealed) return deriveTradingAccount(prfOutput, openImportedKey(prfOutput, parseSealedRecord(sealed)));
  return deriveTradingAccount(prfOutput);
}

export async function importWalletKey(
  context: PasskeyContext,
  input: { privateKey: string; expectedAddress?: string },
): Promise<`0x${string}`> {
  if (!context.importStore) throw new Error("Importing is not available on this device.");
  const privateKey = normalizePrivateKey(input.privateKey);
  const preview = createSecp256k1SigningSession({ privateKey: Uint8Array.from(privateKey) });
  const address = getEvmAddress(preview.publicKey);
  preview.end();
  if (input.expectedAddress && input.expectedAddress.trim().toLowerCase() !== address.toLowerCase()) {
    privateKey.fill(0);
    throw new Error(`That key belongs to ${address}, not the address you entered. Nothing was imported.`);
  }
  const { prfOutput } = await getPasskeyPrfOutput({
    rpId: context.rpId,
    credential: await readCredential(context),
    webAuthnClient: context.webAuthnClient,
  });
  const record = sealImportedKey(prfOutput, privateKey);
  prfOutput.fill(0);
  privateKey.fill(0);
  await context.importStore.write(JSON.stringify(record));
  return address;
}

export async function clearImportedWallet(context: PasskeyContext): Promise<void> {
  if (context.importStore) await context.importStore.write("");
}

export async function revealRecoveryPhrase(
  context: PasskeyContext,
): Promise<string> {
  if (isDevAuth) return entropyToMnemonic(devEntropy, wordlist);

  const { prfOutput } = await getPasskeyPrfOutput({
    rpId: context.rpId,
    credential: await readCredential(context),
    webAuthnClient: context.webAuthnClient,
  });

  const phrase = entropyToMnemonic(prfOutput, wordlist);
  prfOutput.fill(0);
  return phrase;
}
