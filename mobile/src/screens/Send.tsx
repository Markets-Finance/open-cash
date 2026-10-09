import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { withdrawUsd, type TradingAccount } from "shared";
import { TabBar, tabBarHeight, type TabKey } from "../components/TabBar";
import { RoundButton, ToneCard, tone } from "../components/ui";
import { mainExchange } from "../lib/hl";
import { loadAccountDesk } from "../lib/market";
import { dark, family, space, touch } from "../theme";

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

type SendProps = { trader: TradingAccount; onBack: () => void; onSelectTab: (key: TabKey) => void };

export function Send({ trader, onBack, onSelectTab }: SendProps) {
  const insets = useSafeAreaInsets();
  const [available, setAvailable] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; failed: boolean } | null>(null);

  async function refresh() {
    const desk = await loadAccountDesk(trader.address, true).catch(() => null);
    setAvailable(desk ? Math.max(0, desk.equity - desk.positions.reduce((sum, p) => sum + p.marginUsed, 0)) : null);
  }

  useEffect(() => {
    void refresh();
  }, [trader.address]);

  const value = Number(amount) || 0;
  const blocked = busy ? "Withdrawing…" : value <= 0 ? "Enter an amount" : available !== null && value > available ? "More than you have" : null;

  async function submit() {
    setBusy(true);
    setStatus({ text: "Waiting for your passkey…", failed: false });
    try {
      await withdrawUsd(mainExchange(trader), value, trader.address, [trader.address]);
      setStatus({ text: `Withdrawal of ${value} USDC requested. It usually lands within a few minutes.`, failed: false });
      setAmount("");
      void refresh();
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : String(error), failed: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm, paddingBottom: tabBarHeight + insets.bottom + space.xl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <RoundButton glyph="←" label="Back" light onPress={onBack} />
          <Text style={styles.title}>WITHDRAW</Text>
        </View>

        <ToneCard>
          <Text style={styles.label}>AVAILABLE</Text>
          <Text style={styles.balance}>{available === null ? "…" : `$${available.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}</Text>
          <Text style={styles.label}>TO</Text>
          <Text style={styles.muted}>{short(trader.address)} on Arbitrum{" "}Sepolia. Withdrawals only ever go to your own address.</Text>

          <Text style={styles.label}>AMOUNT (USDC)</Text>
          <View style={styles.amountRow}>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={dark.muted} style={styles.amount} />
            <Pressable onPress={() => setAmount(String(Math.floor((available ?? 0) * 100) / 100))} style={({ pressed }) => [styles.maxButton, pressed && styles.pressed]}>
              <Text style={styles.maxLabel}>Max</Text>
            </Pressable>
          </View>

          <Pressable
            disabled={blocked !== null}
            onPress={() => void submit()}
            style={({ pressed }) => [styles.cta, blocked !== null && styles.ctaOff, pressed && styles.pressed]}
          >
            <Text style={styles.ctaLabel}>{blocked ?? `Withdraw ${value} USDC`}</Text>
          </Pressable>
          {status !== null && <Text style={status.failed ? styles.error : styles.ok}>{status.text}</Text>}
        </ToneCard>
      </ScrollView>
      <TabBar active="home" onSelect={onSelectTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: dark.paper },
  content: { paddingHorizontal: space.lg, gap: space.md },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52 },
  title: { flex: 1, fontFamily: family.semibold, fontSize: 30, letterSpacing: -1.2, color: dark.ink },
  label: { fontFamily: family.medium, fontSize: 11, letterSpacing: 1.2, color: dark.muted },
  muted: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  error: { fontFamily: family.regular, fontSize: 13, lineHeight: 19, color: dark.red },
  ok: { fontFamily: family.medium, fontSize: 13, lineHeight: 19, color: dark.green },
  link: { fontFamily: family.medium, fontSize: 13, color: tone.sky },
  option: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 68, paddingHorizontal: space.lg, borderRadius: 24, backgroundColor: tone.card, borderWidth: 2, borderColor: "transparent" },
  optionActive: { borderColor: tone.lime },
  optionName: { fontFamily: family.semibold, fontSize: 15, color: dark.ink },
  balance: { fontFamily: family.semibold, fontSize: 15, color: dark.ink },
  input: { fontFamily: family.regular, fontSize: 14, color: dark.ink, minHeight: touch + space.sm, paddingHorizontal: space.md, borderRadius: 16, backgroundColor: tone.raised },
  amountRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  amount: { flex: 1, fontFamily: family.medium, fontSize: 36, letterSpacing: -1.5, color: dark.ink, padding: 0 },
  maxButton: { minHeight: touch, paddingHorizontal: space.lg, borderRadius: 999, backgroundColor: tone.raised, justifyContent: "center" },
  maxLabel: { fontFamily: family.semibold, fontSize: 13, color: dark.ink },
  cta: { minHeight: 56, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: tone.lime },
  ctaOff: { opacity: 0.4 },
  ctaLabel: { fontFamily: family.semibold, fontSize: 16, color: tone.ink },
});
