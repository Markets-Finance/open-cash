export {
  clearImportedWallet,
  createTradingAccount,
  importWalletKey,
  addressForKey,
  normalizePrivateKey,
  openImportedKey,
  revealRecoveryPhrase,
  sealImportedKey,
  resumeTradingAccount,
  signInTradingAccount,
} from "./account.js";
export type {
  CredentialStore,
  PasskeyContext,
  TradingAccount,
} from "./account.js";
export { profileNamespace } from "./account.js";
export { authMode, isDevAuth, relyingPartyId, relyingPartyName } from "./config.js";
export {
  alertsNamespace,
  journalNamespace,
  openJournalSession,
  openNamespaceSession,
} from "./journal.js";
export type { NamespaceSession } from "./journal.js";
export {
  deriveNamespaceKey,
  namespaceSalt,
  open,
  parseSealedRecord,
  seal,
} from "./namespace.js";
export type { SealedRecord } from "./namespace.js";
