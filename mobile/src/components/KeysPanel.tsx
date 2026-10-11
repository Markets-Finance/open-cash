import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { listTradingKeys, revokeTradingKey, type TradingAccount, type TradingKey } from "shared";
import { privateKeyToAccount } from "viem/accounts";
import { hlNetwork, info, mainExchange } from "../lib/hl";
import { dark, family, space, touch } from "../theme";

export function KeysPanel({ trader }: { trader: TradingAccount }) {
  const [keys, setKeys] = useState<TradingKey[] | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; failed: boolean } | null>(null);
  const storageKey = `opencash.hl.agent.${hlNetwork}.${trader.address.toLowerCase()}`;

  async function load() {
    try {
      setKeys(await listTradingKeys(info, trader.address));
      const stored = (await AsyncStorage.getItem(storageKey)) as `0x${string}` | null;
      setMine(stored ? privateKeyToAccount(stored).address.toLowerCase() : null);
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : String(error), failed: true });
    }
  }

  useEffect(() => {
    void load();
  }, [trader.address]);

  async function revoke(key: TradingKey) {
    setBusy(true);
    setStatus({ text: `Revoking ${key.name || "the key"}…`, failed: false });
    try {
      await revokeTradingKey(mainExchange(trader), key.name);
      if (key.address.toLowerCase() === mine) await AsyncStorage.removeItem(storageKey);
      setStatus({ text: "Revoked. That key can no longer place orders.", failed: false });
      await load();
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : String(error), failed: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.note}>These keys can place and cancel orders for your account. They cannot withdraw. Each device you trade from creates its own. Revoke any you no longer use.</Text>
      {keys === null ? <Text style={styles.note}>Loading…</Text> : keys.length === 0 ? <Text style={styles.note}>No trading keys yet. One is created the first time you place an order.</Text> : keys.map((key) => (
        <View key={key.address} style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.name}>{key.name || "Unnamed key"}{key.address.toLowerCase() === mine ? " · this device" : ""}</Text>
            <Text style={styles.note}>{key.address.slice(0, 8)}…{key.address.slice(-6)}{key.validUntil ? ` · expires ${new Date(key.validUntil).toLocaleDateString()}` : ""}</Text>
          </View>
          <Pressable disabled={busy} onPress={() => void revoke(key)} style={({ pressed }) => [styles.revoke, pressed && styles.pressed]}>
            <Text style={styles.revokeLabel}>Revoke</Text>
          </Pressable>
        </View>
      ))}
      {status !== null && <Text style={status.failed ? styles.error : styles.ok}>{status.text}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.lg, borderRadius: 24, backgroundColor: dark.surface },
  note: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  flex: { flex: 1 },
  name: { fontFamily: family.semibold, fontSize: 14, color: dark.ink },
  revoke: { minHeight: touch - 6, paddingHorizontal: space.lg, borderRadius: 999, backgroundColor: "#29312e", justifyContent: "center" },
  revokeLabel: { fontFamily: family.medium, fontSize: 13, color: dark.ink },
  pressed: { opacity: 0.75 },
  error: { fontFamily: family.regular, fontSize: 13, color: dark.red },
  ok: { fontFamily: family.medium, fontSize: 13, color: dark.green },
});
