import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { deleteAccountMessage, listTradingKeys, revokeTradingKey, suppliedUsdc, type TradingAccount } from "shared";
import { backendUrl } from "../lib/config";
import { info, mainExchange } from "../lib/hl";
import { clearImport } from "../lib/mera";
import { loadAccountDesk } from "../lib/market";
import { dark, family, space, touch } from "../theme";

const confirmWord = "DELETE";

function usd(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function DeleteAccountModal({ visible, trader, onClose, onDeleted }: { visible: boolean; trader: TradingAccount; onClose: () => void; onDeleted: () => void }) {
  const [blockers, setBlockers] = useState<string[] | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [word, setWord] = useState("");
  const [ack, setAck] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<{ text: string; failed: boolean } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setBlockers(null);
    setCheckError(null);
    setWord("");
    setAck(false);
    setStatus(null);
    Promise.all([loadAccountDesk(trader.address, true), suppliedUsdc(info, trader.address).catch(() => 0)])
      .then(([desk, lent]) => {
        const list: string[] = [];
        if (desk.positions.length > 0) list.push(`You have ${desk.positions.length} open position${desk.positions.length === 1 ? "" : "s"}. Close ${desk.positions.length === 1 ? "it" : "them"} first.`);
        if (desk.orders.length > 0) list.push(`You have ${desk.orders.length} open order${desk.orders.length === 1 ? "" : "s"}, including stops and targets. Cancel ${desk.orders.length === 1 ? "it" : "them"} first.`);
        if (lent > 0.000001) list.push(`${usd(lent)} is lent as a floor. Close your floors first so the money comes back.`);
        setBlockers(list);
      })
      .catch((error) => setCheckError(error instanceof Error ? error.message : String(error)));
  }, [visible, trader.address]);

  const ready = !running && blockers !== null && blockers.length === 0 && word.trim() === confirmWord && ack;

  async function run() {
    setRunning(true);
    const failures: string[] = [];
    try {
      setStatus({ text: "Revoking trading keys…", failed: false });
      const keys = await listTradingKeys(info, trader.address).catch(() => []);
      for (const key of keys) {
        try {
          await revokeTradingKey(mainExchange(trader), key.name);
        } catch (error) {
          failures.push(`Could not revoke ${key.name || key.address}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      setStatus({ text: "Deleting your data on our server…", failed: false });
      const issuedAt = Date.now();
      const signature = await trader.account.signMessage({ message: deleteAccountMessage(trader.address, issuedAt) });
      const response = await fetch(`${backendUrl}/account/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner: trader.address, issuedAt, signature }) });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? `Server ${response.status}`);
      setStatus({ text: "Wiping this device…", failed: false });
      await clearImport();
      const keysLocal = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith("opencash."));
      for (const key of keysLocal) await AsyncStorage.removeItem(key);
      setStatus({ text: failures.length > 0 ? `Done, with problems: ${failures.join(" ")}` : "Done. Everything is deleted.", failed: failures.length > 0 });
      setTimeout(onDeleted, failures.length > 0 ? 4000 : 1500);
    } catch (error) {
      setRunning(false);
      setStatus({ text: `Stopped: ${error instanceof Error ? error.message : String(error)}. Nothing on this device was wiped.`, failed: true });
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Delete my data?</Text>
            <View style={styles.warn}>
              <Text style={styles.warnTitle}>This cannot be undone.</Text>
              <Text style={styles.warnText}>• Every trading key for your account is revoked, so nothing can place orders for it.</Text>
              <Text style={styles.warnText}>• Your loss limits, saved floors, bots, saved bins, shared strategies, follow records and X link are deleted from our server. Strategies you shared disappear for everyone who followed them.</Text>
              <Text style={styles.warnText}>• The imported wallet, your profile and everything else saved on this device are wiped, and you are signed out.</Text>
            </View>
            <View style={styles.warn}>
              <Text style={styles.warnTitle}>What this does not do.</Text>
              <Text style={styles.warnText}>• Your Hyperliquid account and its funds stay on the exchange. Withdraw first if you want them out.</Text>
              <Text style={styles.warnText}>• Your passkey stays in your password manager. Delete it there yourself. If you delete it while an account still holds funds, you will lose access to that account.</Text>
              <Text style={styles.warnText}>• Anyone who has the private key of an imported wallet still controls that wallet.</Text>
            </View>
            <Text style={styles.muted}>Account: {trader.address}{trader.source === "imported" ? " (imported wallet)" : ""}</Text>
            {checkError !== null ? (
              <Text style={styles.error}>{checkError}. Deleting is disabled until this check works.</Text>
            ) : blockers === null ? (
              <Text style={styles.muted}>Checking for open positions, orders and floors…</Text>
            ) : blockers.length > 0 ? (
              <View style={styles.warn}>
                <Text style={styles.warnTitle}>Not yet.</Text>
                {blockers.map((b) => (
                  <Text key={b} style={styles.warnText}>• {b}</Text>
                ))}
              </View>
            ) : (
              <Text style={styles.muted}>No open positions, orders or floors. You can continue.</Text>
            )}
            <Text style={styles.label}>TYPE {confirmWord} TO CONFIRM</Text>
            <TextInput value={word} onChangeText={setWord} autoCapitalize="characters" autoCorrect={false} style={styles.input} placeholderTextColor={dark.muted} />
            <View style={styles.ackRow}>
              <Switch value={ack} onValueChange={setAck} />
              <Text style={styles.muted}>I understand this cannot be undone.</Text>
            </View>
            <View style={styles.buttons}>
              <Pressable disabled={running} onPress={onClose} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
                <Text style={styles.cancelLabel}>Cancel</Text>
              </Pressable>
              <Pressable disabled={!ready} onPress={() => void run()} style={({ pressed }) => [styles.danger, !ready && styles.off, pressed && styles.pressed]}>
                <Text style={styles.dangerLabel}>Delete my data</Text>
              </Pressable>
            </View>
            {status !== null && <Text style={status.failed ? styles.error : styles.muted}>{status.text}</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: space.lg, backgroundColor: "rgba(0,0,0,0.7)" },
  sheet: { maxHeight: "92%", borderRadius: 24, backgroundColor: dark.surface },
  content: { padding: space.lg, gap: space.md },
  title: { fontFamily: family.semibold, fontSize: 22, color: dark.ink },
  warn: { gap: space.xs, padding: space.md, borderRadius: 14, backgroundColor: "rgba(239, 91, 91, 0.14)" },
  warnTitle: { fontFamily: family.semibold, fontSize: 13, color: "#ffb3b3" },
  warnText: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: "#ffb3b3" },
  muted: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  error: { fontFamily: family.regular, fontSize: 13, lineHeight: 19, color: dark.red },
  label: { fontFamily: family.medium, fontSize: 11, letterSpacing: 1.2, color: dark.muted },
  input: { fontFamily: family.regular, fontSize: 16, color: dark.ink, minHeight: touch, paddingHorizontal: space.md, borderRadius: 14, backgroundColor: "#29312e" },
  ackRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  buttons: { flexDirection: "row", gap: space.sm },
  cancel: { flex: 1, minHeight: touch + space.sm, borderRadius: 999, backgroundColor: "#29312e", alignItems: "center", justifyContent: "center" },
  cancelLabel: { fontFamily: family.semibold, fontSize: 15, color: dark.ink },
  danger: { flex: 1, minHeight: touch + space.sm, borderRadius: 999, backgroundColor: "#ef5b5b", alignItems: "center", justifyContent: "center" },
  dangerLabel: { fontFamily: family.semibold, fontSize: 15, color: "#1a0b0b" },
  off: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
});
