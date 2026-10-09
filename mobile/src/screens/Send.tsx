import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isAddress } from "viem";
import type { TradingAccount } from "shared";
import { AssetMark } from "../components/AssetMark";
import { TabBar, tabBarHeight, type TabKey } from "../components/TabBar";
import { RoundButton, ToneCard, tone } from "../components/ui";
import { loadAccount, loadCollateralBalance, loadNativeBalance, sendAsset, withdrawFromPerpl } from "../lib/perpl";
import { dark, family, space, touch } from "../theme";

type Source = "wallet-ausd" | "wallet-mon" | "perpl";

const explorer = "https://testnet.monadexplorer.com/tx/";

const sources: { key: Source; label: string; sub: string; symbol: string; unit: string }[] = [
  { key: "wallet-ausd", label: "Wallet AUSD", sub: "In your OpenCash address", symbol: "USDC", unit: "AUSD" },
  { key: "wallet-mon", label: "Wallet MON", sub: "Also pays network fees", symbol: "MON", unit: "MON" },
  { key: "perpl", label: "Perpl account", sub: "Withdraws, then sends on", symbol: "BTC", unit: "AUSD" },
];

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

type SendProps = { trader: TradingAccount; onBack: () => void; onSelectTab: (key: TabKey) => void };

export function Send({ trader, onBack, onSelectTab }: SendProps) {
  const insets = useSafeAreaInsets();
  const [source, setSource] = useState<Source>("wallet-ausd");
  const [balances, setBalances] = useState<Record<Source, number | null>>({ "wallet-ausd": null, "wallet-mon": null, perpl: null });
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; failed: boolean; hash?: string } | null>(null);

  async function refresh() {
    const [ausd, mon, account] = await Promise.all([
      loadCollateralBalance(trader.address).catch(() => null),
      loadNativeBalance(trader.address).catch(() => null),
      loadAccount(trader.address).catch(() => null),
    ]);
    setBalances({ "wallet-ausd": ausd, "wallet-mon": mon, perpl: account?.balance ?? 0 });
  }

  useEffect(() => {
    void refresh();
  }, [trader.address]);

  const current = sources.find((entry) => entry.key === source)!;
  const have = balances[source];
  const value = Number(amount) || 0;
  const validTo = isAddress(to.trim());
  const reserve = source === "wallet-mon" ? 0.01 : 0;
  const max = have === null ? 0 : Math.max(0, have - reserve);

  const blocked = busy
    ? "Sending…"
    : !validTo
      ? "Enter a Monad address"
      : value <= 0
        ? "Enter an amount"
        : have !== null && value > have
          ? "More than you have"
          : null;

  async function submit() {
    setBusy(true);
    setStatus({ text: "Waiting for your passkey…", failed: false });
    try {
      let hash: string;
      if (source === "perpl") {
        hash = await withdrawFromPerpl(trader, { to: to.trim(), amount: value }, (step) =>
          setStatus({ text: step === "withdraw" ? "Withdrawn from Perpl. Sending…" : "Sent.", failed: false }),
        );
      } else {
        hash = await sendAsset(trader, { asset: source === "wallet-mon" ? "MON" : "AUSD", to: to.trim(), amount: value });
      }
      setStatus({ text: `Sent ${value} ${current.unit} to ${short(to.trim())}.`, failed: false, hash });
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
          <Text style={styles.title}>SEND</Text>
        </View>

        <Text style={styles.label}>SEND FROM</Text>
        {sources.map((entry) => (
          <Pressable key={entry.key} onPress={() => setSource(entry.key)} style={[styles.option, source === entry.key && styles.optionActive]}>
            <AssetMark symbol={entry.symbol} size={32} />
            <View style={styles.flex}>
              <Text style={styles.optionName}>{entry.label}</Text>
              <Text style={styles.muted}>{entry.sub}</Text>
            </View>
            <Text style={styles.balance}>{balances[entry.key] === null ? "…" : `${balances[entry.key]!.toLocaleString(undefined, { maximumFractionDigits: 4 })}`}</Text>
          </Pressable>
        ))}

        <ToneCard>
          <Text style={styles.label}>TO ADDRESS</Text>
          <TextInput value={to} onChangeText={setTo} autoCapitalize="none" autoCorrect={false} placeholder="0x… any Monad address" placeholderTextColor={dark.muted} style={styles.input} />
          {to.trim() !== "" && !validTo && <Text style={styles.error}>That is not a valid Monad address.</Text>}

          <Text style={styles.label}>AMOUNT ({current.unit})</Text>
          <View style={styles.amountRow}>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={dark.muted} style={styles.amount} />
            <Pressable onPress={() => setAmount(String(max))} style={({ pressed }) => [styles.maxButton, pressed && styles.pressed]}>
              <Text style={styles.maxLabel}>Max</Text>
            </Pressable>
          </View>

          <Text style={styles.muted}>Only send on the Monad network. Funds sent to a wrong address cannot be recovered. This is Monad testnet.</Text>

          <Pressable
            disabled={blocked !== null}
            onPress={() => void submit()}
            style={({ pressed }) => [styles.cta, blocked !== null && styles.ctaOff, pressed && styles.pressed]}
          >
            <Text style={styles.ctaLabel}>{blocked ?? `Send ${value} ${current.unit}`}</Text>
          </Pressable>
          {status !== null && <Text style={status.failed ? styles.error : styles.ok}>{status.text}</Text>}
          {status?.hash && (
            <Pressable onPress={() => void Linking.openURL(`${explorer}${status.hash}`)}>
              <Text style={styles.link}>View transaction ↗</Text>
            </Pressable>
          )}
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
