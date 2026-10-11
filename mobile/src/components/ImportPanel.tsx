import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { TradingAccount } from "shared";
import { clearImport, importWallet } from "../lib/mera";
import { dark, family, space, touch } from "../theme";

export function ImportPanel({ trader, onDone }: { trader: TradingAccount; onDone: () => void }) {
  const [address, setAddress] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; failed: boolean } | null>(null);
  const imported = trader.source === "imported";

  async function submit() {
    setBusy(true);
    setStatus({ text: "Waiting for your passkey…", failed: false });
    try {
      const done = await importWallet(key, address);
      setKey("");
      setStatus({ text: `Imported ${done}. Signing in with it…`, failed: false });
      onDone();
    } catch (error) {
      setKey("");
      setStatus({ text: error instanceof Error ? error.message : String(error), failed: true });
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await clearImport();
      setStatus({ text: "Removed the imported wallet. Signing in with your passkey account…", failed: false });
      onDone();
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : String(error), failed: true });
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.note}>
        {imported ? `You are using the imported wallet ${trader.address}. Your passkey account is ${trader.passkeyAddress}.` : `You are using your passkey account ${trader.address}. Nothing is imported.`}
      </Text>
      <Text style={styles.note}>
        Paste the private key of a wallet you own. It is encrypted with your passkey and stored only on this device. It is never sent to a server. Use a wallet you can afford to expose to this phone. A testnet wallet is ideal.
      </Text>
      <Text style={styles.label}>ADDRESS YOU EXPECT</Text>
      <TextInput value={address} onChangeText={setAddress} autoCapitalize="none" autoCorrect={false} placeholder="0x…" placeholderTextColor={dark.muted} style={styles.input} />
      <Text style={styles.label}>PRIVATE KEY</Text>
      <TextInput value={key} onChangeText={setKey} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="0x… (64 hex characters)" placeholderTextColor={dark.muted} style={styles.input} />
      <Pressable disabled={busy} onPress={() => void submit()} style={({ pressed }) => [styles.cta, busy && styles.ctaOff, pressed && styles.pressed]}>
        <Text style={styles.ctaLabel}>Import with my passkey</Text>
      </Pressable>
      {imported && (
        <Pressable disabled={busy} onPress={() => void remove()} style={({ pressed }) => [styles.quiet, pressed && styles.pressed]}>
          <Text style={styles.quietLabel}>Use my passkey account instead</Text>
        </Pressable>
      )}
      {status !== null && <Text style={status.failed ? styles.error : styles.ok}>{status.text}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.lg, borderRadius: 24, backgroundColor: dark.surface },
  note: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  label: { fontFamily: family.medium, fontSize: 11, letterSpacing: 1.2, color: dark.muted },
  input: { fontFamily: family.regular, fontSize: 14, color: dark.ink, minHeight: touch, paddingHorizontal: space.md, borderRadius: 14, backgroundColor: "#29312e" },
  cta: { minHeight: touch + space.sm, borderRadius: 999, backgroundColor: dark.accent, alignItems: "center", justifyContent: "center" },
  ctaOff: { opacity: 0.45 },
  ctaLabel: { fontFamily: family.semibold, fontSize: 15, color: dark.onAccent },
  quiet: { minHeight: touch, borderRadius: 999, backgroundColor: "#29312e", alignItems: "center", justifyContent: "center" },
  quietLabel: { fontFamily: family.medium, fontSize: 14, color: dark.ink },
  pressed: { opacity: 0.75 },
  error: { fontFamily: family.regular, fontSize: 13, color: dark.red },
  ok: { fontFamily: family.medium, fontSize: 13, color: dark.green },
});
