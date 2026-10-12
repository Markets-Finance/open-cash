import { isMeraError } from "@category-labs/mera";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addressForKey, isDevAuth, type TradingAccount } from "shared";
import { PassCard } from "../components/PassCard";
import { AuthShell, type AuthMode } from "../components/AuthShell";
import { SettingIcon, type SettingIconKind } from "../components/SettingIcon";
import { TabBar, tabBarHeight, type TabKey } from "../components/TabBar";
import { hlNetwork, networkLabel } from "../lib/hl";
import { createAccount, endSession, resumeSession, revealPhrase, signIn } from "../lib/mera";
import { LimitsPanel } from "../components/LimitsPanel";
import { DeleteAccountModal } from "../components/DeleteAccountModal";
import { ImportPanel } from "../components/ImportPanel";
import { KeysPanel } from "../components/KeysPanel";
import { MovePanel } from "../components/MovePanel";
import { XVerify } from "../components/XVerify";
import { dark, family, space, track } from "../theme";

const profileKey = "opencash.profile";

export type Profile = { name: string; email: string; variant?: number };

type Panel = "profile" | "history" | "wallets" | "phrase" | "network" | "limits" | "x" | "import" | "move" | "keys" | null;

const failures: Record<string, string> = {
  PRF_UNAVAILABLE:
    "This passkey cannot derive keys. Its authenticator does not support the PRF extension, so it cannot be used for an OpenCash account. Try a passkey stored in iCloud Keychain, Google Password Manager or 1Password.",
  PASSKEY_OPERATION_FAILED:
    "We couldn't find a passkey, or the prompt was closed. New to OpenCash? Choose Create an account.",
  CRYPTO_UNAVAILABLE: "This device is missing a required crypto primitive.",
};

type ActionProps = {
  label: string;
  onPress: () => void;
  emphasis?: "primary" | "outline" | "quiet";
};

function Action({ label, onPress, emphasis = "outline" }: ActionProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        emphasis === "primary" && styles.actionPrimary,
        emphasis === "quiet" && styles.actionQuiet,
        pressed && styles.actionPressed,
      ]}
    >
      <Text
        style={[
          styles.actionLabel,
          emphasis === "primary" && styles.actionLabelPrimary,
          emphasis === "quiet" && styles.actionLabelQuiet,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const tints = { purple: "#8f7cf5", lime: "#b4f58c", blue: "#6fb7f2", peach: "#f2b98b" } as const;

type RowProps = {
  icon: SettingIconKind;
  tint: keyof typeof tints;
  label: string;
  value?: string;
  last?: boolean;
  onPress?: () => void;
};

function Row({ icon, tint, label, value, last, onPress }: RowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={onPress === undefined}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.actionPressed]}
    >
      <View style={[styles.rowGlyph, { backgroundColor: tints[tint] }]}>
        <SettingIcon kind={icon} cut={tints[tint]} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      {value !== undefined && <Text style={styles.rowValue}>{value}</Text>}
      {onPress !== undefined && <Text style={styles.chevron}>›</Text>}
    </Pressable>
  );
}

export function Account({
  initialAccount,
  initialProfile,
  portfolio,
  onAuthenticated,
  onProfileChange,
  onInitialised,
  onSelectTab,
}: {
  initialAccount: TradingAccount | null;
  initialProfile: Profile | null;
  portfolio: number | null;
  onAuthenticated: (account: TradingAccount | null) => void;
  onProfileChange: (profile: Profile | null) => void;
  onInitialised: () => void;
  onSelectTab: (key: TabKey) => void;
}) {
  const insets = useSafeAreaInsets();
  const [account, setAccount] = useState<TradingAccount | null>(initialAccount);
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const [variant, setVariant] = useState(initialProfile?.variant ?? 0);
  const [formMode, setFormMode] = useState<"create" | "profile" | null>(null);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importKey, setImportKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [missing, setMissing] = useState(false);

  function explain(error: unknown) {
    setFailed(true);
    if (!isMeraError(error)) {
      setStatus(
        error instanceof Error ? error.message : "Something went wrong.",
      );
      return;
    }
    setStatus(failures[error.code] ?? `${error.code}: ${error.message}`);
    if (error.code === "PASSKEY_OPERATION_FAILED" && account === null && formMode === null) setMissing(true);
  }

  async function loadProfile(next: TradingAccount): Promise<Profile | null> {
    const raw = await AsyncStorage.getItem(profileKey);
    if (raw === null) return null;
    try {
      return JSON.parse(next.openProfile(JSON.parse(raw)));
    } catch {
      return null;
    }
  }

  async function run(
    action: () => Promise<TradingAccount | null>,
    pending: string,
    created: Profile | null = null,
  ): Promise<Profile | null | undefined> {
    setFailed(false);
    setStatus(pending);
    try {
      const next = await action();
      if (next === null) {
        setStatus("");
        return;
      }
      const resolved = created ?? (await loadProfile(next));
      if (created !== null) {
        await AsyncStorage.setItem(
          profileKey,
          JSON.stringify(next.sealProfile(JSON.stringify(created))),
        );
      }
      setAccount(next);
      onAuthenticated(next);
      setProfile(resolved);
      onProfileChange(resolved);
      setVariant(resolved?.variant ?? 0);
      setFormMode(null);
      setStatus(
        resolved === null
          ? "Signed in. This device has no profile yet — save one below. Your address is already correct."
          : "Signed in. Your profile was decrypted locally; the key came from your passkey.",
      );
      return resolved;
    } catch (error) {
      explain(error);
    }
  }

  function openPanel(key: Exclude<Panel, null>) {
    const next = panel === key ? null : key;
    setPanel(next);
    setPhrase(null);
    setFormMode(next === "profile" ? "profile" : null);
  }

  useEffect(() => {
    if (initialAccount !== null) return;
    void resumeSession().then(async (next) => {
      if (next === null) return;
      const resolved = await run(async () => next, "Restoring your session…");
      setStatus("");
      if (resolved) onInitialised();
    });
  }, []);

  function signOut() {
    void endSession();
    account?.end();
    setAccount(null);
    onAuthenticated(null);
    setProfile(null);
    onProfileChange(null);
    setVariant(0);
    setPhrase(null);
    setFormMode(null);
    setFailed(false);
    setStatus("Signed out. The derived key was zeroed.");
  }

  async function copyAddress() {
    if (account === null) return;
    await Clipboard.setStringAsync(account.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  async function showPhrase() {
    setFailed(false);
    setStatus("Waiting for your passkey…");
    try {
      setPhrase(await revealPhrase());
      setStatus("Write these 24 words down. Anyone who has them owns this account.");
    } catch (error) {
      explain(error);
    }
  }

  async function persistProfile(on: TradingAccount, next: Profile) {
    await AsyncStorage.setItem(
      profileKey,
      JSON.stringify(on.sealProfile(JSON.stringify(next))),
    );
    setProfile(next);
    onProfileChange(next);
  }

  async function saveProfile(next: Profile) {
    if (account === null) return;
    await persistProfile(account, next);
    setFormMode(null);
    setStatus("Saved on this device, encrypted with a key only your passkey derives.");
    onInitialised();
  }

  function submit() {
    const entered = { name: name.trim(), email: email.trim(), variant };
    if (entered.name === "" || entered.email === "") {
      setFailed(true);
      setStatus("A name and an email are both needed to label the passkey.");
      return;
    }
    if (account !== null) {
      void saveProfile(entered).catch((error) => {
        setFailed(true);
        setStatus(error instanceof Error ? error.message : String(error));
      });
      return;
    }
    const key = importOpen ? importKey.trim() : "";
    if (importOpen && addressForKey(key) === null) {
      setFailed(true);
      setStatus("Enter a valid private key, or skip the import.");
      return;
    }
    void run(
      () => createAccount(entered.email, entered.name, key === "" ? undefined : { privateKey: key }),
      "Creating a passkey…",
      entered,
    ).finally(() => setImportKey(""));
  }

  const showTabBar = account !== null && profile !== null;

  const formCard = (
            <View style={styles.card}>
              <Text style={styles.field}>Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Ada Lovelace"
                placeholderTextColor={dark.muted}
                autoComplete="name"
                style={styles.input}
              />
              <Text style={styles.field}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="ada@example.com"
                placeholderTextColor={dark.muted}
                autoComplete="email"
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
              />
              <Action
                label={formMode === "profile" ? "Save profile" : "Create passkey"}
                emphasis="primary"
                onPress={submit}
              />
              <Text style={styles.note}>
                {formMode === "profile"
                  ? "Stored only on this device, encrypted with a key only your passkey can derive. Your address does not change."
                  : "Your name and email label the passkey in your password manager, and are encrypted with a key only your passkey can derive."}
              </Text>
            </View>
          
  );

  const titles: Record<Exclude<Panel, null>, string> = {
    profile: "Profile",
    wallets: "Wallets",
    history: "History",
    phrase: "Recovery phrase",
    network: "Network",
    limits: "Loss limits",
    x: "Verified X account",
    import: "Import a wallet",
    move: "Move money",
    keys: "Trading keys",
  };

  function closePage() {
    setPanel(null);
    setFormMode(null);
    setPhrase(null);
  }

  if (account === null || profile === null) {
    const authMode: AuthMode = account !== null ? "profile" : formMode === "create" ? "create" : "signin";
    return (
      <AuthShell
        mode={authMode}
        dev={isDevAuth}
        name={name}
        email={email}
        status={status}
        failed={failed}
        onName={setName}
        onEmail={setEmail}
        importOpen={importOpen}
        importAddress={importKey.trim() === "" ? null : addressForKey(importKey)}
        importKey={importKey}
        onImportOpen={account === null ? (open) => { setImportOpen(open); setMissing(false); if (open) setFormMode("create"); } : undefined}
        onImportKey={setImportKey}
        onSwitch={account === null ? () => { setMissing(false); setFailed(false); setStatus(""); setFormMode(formMode === "create" ? null : "create"); } : undefined}
        onSubmit={() => { setMissing(false); if (authMode === "signin") void run(signIn, "Waiting for your passkey…"); else submit(); }}
        missing={missing}
      />
    );
  }

  if (account !== null && showTabBar && panel !== null) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
          <Pressable onPress={closePage} hitSlop={12} style={styles.iconButton} accessibilityLabel="Back">
            <Text style={styles.back}>←</Text>
          </Pressable>
          <Text style={styles.heading}>{titles[panel]}</Text>
          <View style={styles.iconSpacer} />
        </View>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + insets.bottom + space.xl }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {panel === "profile" && formCard}
          {panel === "wallets" && (
            <View style={styles.card}>
              <Text style={styles.note}>One passkey, one address. {networkLabel}</Text>
              <Text style={styles.walletAddress}>{account.address}</Text>
              <Action label={copied ? "Copied" : "Copy address"} onPress={() => void copyAddress()} />
            </View>
          )}
          {panel === "history" && (
            <View style={styles.card}>
              <Text style={styles.note}>
                No trades recorded on this device yet. Filled bins will appear here once an indexer is wired up.
              </Text>
            </View>
          )}
          {panel === "phrase" && (
            <View style={styles.card}>
              {phrase === null ? (
                <>
                  <Text style={styles.note}>
                    {account !== null && account.source === "imported"
                      ? `You are using an imported wallet (${account.address}). These 24 words belong to your passkey account (${account.passkeyAddress}), not to the imported wallet. The imported wallet's recovery is the private key you imported, which this app does not keep in readable form.`
                      : "Your 24 words rebuild this account in any wallet. Anyone who has them owns it. Reveal them only where nobody can see your screen."}
                    {" "}Anyone who has the words owns the passkey account. Reveal them only where nobody can see your screen.
                  </Text>
                  <Action label="Reveal with passkey" emphasis="primary" onPress={showPhrase} />
                </>
              ) : (
                <>
                  <Text style={styles.phraseWords}>{phrase}</Text>
                  <Text style={styles.note}>
                    Write them on paper. Never type them into anything but a wallet you trust.
                  </Text>
                  <Action label="Hide" emphasis="quiet" onPress={() => setPhrase(null)} />
                </>
              )}
            </View>
          )}
          {panel === "limits" && account !== null && <LimitsPanel trader={account} />}
          {panel === "x" && account !== null && <XVerify trader={account} />}
          {panel === "move" && account !== null && <MovePanel trader={account} />}
          {panel === "keys" && account !== null && <KeysPanel trader={account} />}
          {panel === "import" && account !== null && <ImportPanel trader={account} onDone={() => void run(signIn, "Signing in with your passkey…")} />}
          {panel === "network" && (
            <View style={styles.card}>
              <Text style={styles.note}>Network</Text>
              <Text style={styles.walletAddress}>{networkLabel}</Text>
              <Text style={styles.note}>Margin</Text>
              <Text style={styles.walletAddress}>USDC</Text>
              <Text style={styles.note}>{hlNetwork === "mainnet" ? "Deposits arrive from Arbitrum through the app. These are real funds." : "Deposits arrive from Arbitrum Sepolia through the app. Testnet funds have no value."}</Text>
            </View>
          )}
          {status !== "" && <Text style={[styles.status, failed && styles.statusFailed]}>{status}</Text>}
        </ScrollView>
        <TabBar active="account" onSelect={onSelectTab} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {account !== null && (
        <DeleteAccountModal
          visible={deleteOpen}
          trader={account}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => {
            setDeleteOpen(false);
            signOut();
          }}
        />
      )}
      {showTabBar && (
        <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
          <Text style={styles.heading}>Account</Text>
          <View style={styles.iconSpacer} />
        </View>
      )}

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: showTabBar
              ? tabBarHeight + insets.bottom + space.xl
              : insets.bottom + space.block,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isDevAuth && (
          <View style={styles.devBanner}>
            <Text style={styles.devBannerText}>
              DEV MODE — no passkey. This is a shared test account, not yours.
            </Text>
          </View>
        )}

        {profile === null && (
          <Text style={styles.lede}>
            One passkey derives your address. No seed phrase, no password,
            nothing stored on this device.
          </Text>
        )}

        {account !== null && (
          <PassCard
            address={account.address}
            name={profile?.name ?? "Trader"}
            email={profile?.email}
            tier={isDevAuth ? "Dev account" : "Passkey pass"}
            variant={variant}
            network={networkLabel}
            value={portfolio}
            copied={copied}
            onCopyAddress={() => void copyAddress()}
          />
        )}

        <View style={styles.actions}>
          {account === null ? (
            <>
              <Action
                label="Sign in with passkey"
                emphasis="primary"
                onPress={() => void run(signIn, "Waiting for your passkey…")}
              />
              <Action
                label="Create a new account"
                onPress={() => setFormMode(formMode === "create" ? null : "create")}
              />
            </>
          ) : (
            <>
              {profile === null ? (
                <Action
                  label="Save profile on this device"
                  emphasis="primary"
                  onPress={() => setFormMode(formMode === "profile" ? null : "profile")}
                />
              ) : (
                <>
                  <Text style={styles.sectionLabel}>Account settings</Text>
                  <View style={styles.group}>
                    <Row icon="profile" tint="purple" label="Profile" onPress={() => openPanel("profile")} />
                    <Row icon="wallet" tint="blue" label="Wallets" onPress={() => openPanel("wallets")} />
                    <Row icon="wallet" tint="lime" label="Move money" onPress={() => openPanel("move")} />
                    <Row icon="lock" tint="blue" label="Trading keys" onPress={() => openPanel("keys")} />
                    <Row icon="wallet" tint="lime" label="Import a wallet" onPress={() => openPanel("import")} />
                    <Row icon="history" tint="lime" label="History" onPress={() => openPanel("history")} last />
                  </View>

                  <Text style={styles.sectionLabel}>Security</Text>
                  <View style={styles.group}>
                    <Row icon="lock" tint="lime" label="Loss limits" onPress={() => openPanel("limits")} />
                    <Row icon="profile" tint="purple" label="Verified X account" onPress={() => openPanel("x")} />
                    <Row icon="lock" tint="peach" label="Recovery phrase" onPress={() => openPanel("phrase")} last />
                  </View>

                  <Text style={styles.sectionLabel}>Settings</Text>
                  <View style={styles.group}>
                    <Row icon="globe" tint="blue" label="Network" value={networkLabel} onPress={() => openPanel("network")} />
                    <Row icon="exit" tint="peach" label="Sign out" onPress={signOut} last />
                  </View>

                  <Text style={styles.sectionLabel}>Danger zone</Text>
                  <View style={styles.group}>
                    <Row icon="exit" tint="peach" label="Delete my data" onPress={() => setDeleteOpen(true)} last />
                  </View>
                </>
              )}
            </>
          )}

          {formMode !== null && panel === null && formCard}

          {status !== "" && (
            <Text style={[styles.status, failed && styles.statusFailed]}>
              {status}
            </Text>
          )}
        </View>
      </ScrollView>
      {showTabBar && <TabBar active="account" onSelect={onSelectTab} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: dark.paper },
  header: {
    paddingHorizontal: space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: {
    fontFamily: family.semibold,
    fontSize: 26,
    letterSpacing: -1,
    textTransform: "uppercase",
    color: dark.ink,
  },
  iconSpacer: { width: 54, height: 54 },
  iconButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#f3f4f1",
    alignItems: "center",
    justifyContent: "center",
  },
  back: { fontFamily: family.medium, fontSize: 22, color: "#14181a" },
  content: { padding: space.lg, gap: space.lg },
  lede: {
    fontFamily: family.regular,
    fontSize: 14,
    lineHeight: 14 * 1.6,
    color: dark.muted,
  },
  actions: { gap: space.md },
  sectionLabel: { fontFamily: family.medium, fontSize: 13, color: dark.muted, marginTop: space.sm },
  group: { borderRadius: 28, backgroundColor: dark.surface, paddingHorizontal: space.lg },
  row: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: space.md },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: dark.surfaceLine },
  rowGlyph: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  rowGlyphText: { fontFamily: family.semibold, fontSize: 16, color: "#14181a" },
  rowLabel: { flex: 1, fontFamily: family.medium, fontSize: 15, color: dark.ink },
  rowLabelActive: { color: dark.accent },
  rowValue: { fontFamily: family.regular, fontSize: 13, color: dark.muted },
  chevron: { fontFamily: family.regular, fontSize: 22, color: dark.muted },
  card: { padding: space.lg, borderRadius: 18, backgroundColor: dark.surface, gap: space.sm },
  walletAddress: { fontFamily: family.regular, fontSize: 12, color: dark.ink },
  action: {
    minHeight: 56,
    borderRadius: 28,
    backgroundColor: dark.surfaceHover,
    alignItems: "center",
    justifyContent: "center",
  },
  actionPrimary: { backgroundColor: dark.accent },
  actionQuiet: { backgroundColor: "transparent" },
  actionPressed: { opacity: 0.8 },
  actionLabel: { fontFamily: family.medium, fontSize: 14, color: dark.ink },
  actionLabelPrimary: { color: dark.onAccent },
  actionLabelQuiet: { color: dark.muted },
  field: {
    fontFamily: family.medium,
    fontSize: 11,
    letterSpacing: track(11, 0.12),
    color: dark.muted,
  },
  input: {
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: 14,
    backgroundColor: dark.surfaceHover,
    fontFamily: family.regular,
    fontSize: 15,
    color: dark.ink,
    marginBottom: space.sm,
  },
  note: {
    fontFamily: family.regular,
    fontSize: 12,
    lineHeight: 12 * 1.6,
    color: dark.muted,
  },
  status: {
    fontFamily: family.regular,
    fontSize: 13,
    lineHeight: 13 * 1.6,
    color: dark.ink,
  },
  statusFailed: { color: dark.red },
  devBanner: { padding: space.md, borderRadius: 14, backgroundColor: dark.accent },
  devBannerText: {
    fontFamily: family.medium,
    fontSize: 11,
    letterSpacing: track(11, 0.08),
    color: dark.onAccent,
    textAlign: "center",
  },
  phraseWords: {
    fontFamily: family.medium,
    fontSize: 15,
    lineHeight: 15 * 1.7,
    letterSpacing: track(15, 0.02),
    color: dark.ink,
  },
});
