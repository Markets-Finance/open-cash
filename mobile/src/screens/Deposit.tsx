import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { depositPermitTypedData, minDepositUsdc, toUsdcUnits, type TradingAccount } from "shared";
import { TabBar, tabBarHeight, type TabKey } from "../components/TabBar";
import { QrCode } from "../components/QrCode";
import { RoundButton, ToneCard, tone } from "../components/ui";
import { backendUrl } from "../lib/config";
import { hlNetwork } from "../lib/hl";
import { loadAccountDesk } from "../lib/market";
import { dark, family, space, touch } from "../theme";

const permitTtlSeconds = 20 * 60;
const pollMs = 5_000;
const pollTries = 24;

type PermitParams = { nonce: string; balanceUsdc: number; minDepositUsdc: number };

type DepositProps = {
  trader: TradingAccount;
  onBack: () => void;
  onSelectTab: (key: TabKey) => void;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backendUrl}${path}`, init);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

export function Deposit({ trader, onBack, onSelectTab }: DepositProps) {
  const insets = useSafeAreaInsets();
  const [params, setParams] = useState<PermitParams | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<{ text: string; failed: boolean } | null>(null);

  async function loadParams() {
    try {
      setParams(await api<PermitParams>(`/deposit/permit-params?network=${hlNetwork}&owner=${trader.address}`));
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : String(error), failed: true });
    }
  }

  useEffect(() => {
    void loadParams();
  }, [trader.address]);

  const value = Number(amount) || 0;
  const blocked = busy
    ? "Depositing…"
    : params === null
      ? "Loading…"
      : value < minDepositUsdc
        ? `Minimum ${minDepositUsdc} USDC`
        : value > params.balanceUsdc
          ? "More than you have on Arbitrum"
          : null;

  async function submit() {
    if (!params) return;
    setBusy(true);
    try {
      const units = toUsdcUnits(value);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + permitTtlSeconds);
      setStatus({ text: "Waiting for your passkey…", failed: false });
      const typedData = depositPermitTypedData({ network: hlNetwork, owner: trader.address, usd: units, nonce: BigInt(params.nonce), deadline });
      const signature = await trader.account.signTypedData(typedData);
      setStatus({ text: "Sending your deposit…", failed: false });
      await api<{ hash: string }>("/deposit/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network: hlNetwork, user: trader.address, usd: units.toString(), deadline: deadline.toString(), signature }),
      });
      const before = (await loadAccountDesk(trader.address, true)).equity;
      for (let attempt = 0; attempt < pollTries; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
        const equity = (await loadAccountDesk(trader.address, true)).equity;
        if (equity > before) {
          setStatus({ text: `Deposited. Your account now holds $${equity.toFixed(2)}.`, failed: false });
          setAmount("");
          void loadParams();
          return;
        }
      }
      setStatus({ text: "Sent. It can take a few minutes to show up.", failed: false });
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
          <Text style={styles.title}>DEPOSIT</Text>
        </View>

        <ToneCard>
          <Text style={styles.label}>STEP 1: SEND USDC ON ARBITRUM{hlNetwork === "testnet" ? " SEPOLIA" : ""} TO</Text>
          <View style={styles.qrWrap}>
            <QrCode value={trader.address} size={168} />
          </View>
          <Text style={styles.address} selectable>
            {trader.address}
          </Text>
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(trader.address);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            }}
            style={({ pressed }) => [styles.copy, pressed && styles.pressed]}
          >
            <Text style={styles.copyLabel}>{copied ? "Copied" : "Copy address"}</Text>
          </Pressable>
        </ToneCard>

        <ToneCard>
          <Text style={styles.label}>STEP 2: MOVE IT INTO YOUR TRADING ACCOUNT</Text>
          <Text style={styles.muted}>
            USDC on Arbitrum: {params === null ? "…" : params.balanceUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 })}. We pay the network fee, so you need no ETH.
          </Text>
          <View style={styles.payRow}>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={String(minDepositUsdc)} placeholderTextColor={dark.muted} style={styles.amount} />
            <Pressable onPress={() => setAmount(String(Math.floor((params?.balanceUsdc ?? 0) * 100) / 100))} style={({ pressed }) => [styles.copyChip, pressed && styles.pressed]}>
              <Text style={styles.copyLabel}>Max</Text>
            </Pressable>
          </View>
          <Pressable
            disabled={blocked !== null}
            onPress={() => void submit()}
            style={({ pressed }) => [styles.cta, blocked !== null && styles.ctaOff, pressed && styles.pressed]}
          >
            <Text style={styles.ctaLabel}>{blocked ?? `Deposit ${value} USDC`}</Text>
          </Pressable>
          {status !== null && <Text style={status.failed ? styles.error : styles.ok}>{status.text}</Text>}
          <Text style={styles.muted}>Deposits under {minDepositUsdc} USDC are lost by the bridge, so the app blocks them. Credit arrives in about a minute.</Text>
        </ToneCard>
      </ScrollView>
      <TabBar active="home" onSelect={onSelectTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: dark.paper },
  content: { paddingHorizontal: space.lg, gap: space.lg },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52 },
  title: { flex: 1, fontFamily: family.semibold, fontSize: 30, letterSpacing: -1.2, color: dark.ink },
  error: { fontFamily: family.regular, fontSize: 13, lineHeight: 19, color: dark.red },
  muted: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  onColorMuted: { fontFamily: family.regular, fontSize: 12, color: "rgba(20, 24, 26, 0.7)" },
  label: { fontFamily: family.medium, fontSize: 11, letterSpacing: 1.2, color: dark.muted },
  labelOnColor: { fontFamily: family.medium, fontSize: 11, letterSpacing: 1.2, color: "rgba(20, 24, 26, 0.7)" },
  payRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  amount: { flex: 1, fontFamily: family.medium, fontSize: 36, letterSpacing: -1.5, color: dark.ink, padding: 0 },
  getAmount: { flex: 1, fontFamily: family.medium, fontSize: 36, letterSpacing: -1.5, color: tone.ink },
  assetButton: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: 999, backgroundColor: tone.raised },
  assetSymbol: { fontFamily: family.semibold, fontSize: 14, color: dark.ink },
  assetChain: { fontFamily: family.regular, fontSize: 11, color: dark.muted },
  chevron: { fontFamily: family.medium, fontSize: 18, color: dark.muted },
  input: { fontFamily: family.regular, fontSize: 14, color: dark.ink, minHeight: touch, paddingHorizontal: space.md, borderRadius: 14, backgroundColor: tone.raised },
  pills: { flexDirection: "row", gap: space.xs },
  pill: { minHeight: touch - 6, paddingHorizontal: space.md, borderRadius: 999, backgroundColor: "rgba(255, 255, 255, 0.35)", alignItems: "center", justifyContent: "center" },
  pillActive: { backgroundColor: tone.ink },
  pillLabel: { fontFamily: family.medium, fontSize: 12, color: tone.ink },
  pillLabelActive: { color: tone.paper },
  facts: { gap: space.sm },
  fact: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: space.md, borderRadius: 16, backgroundColor: tone.raised },
  factValue: { fontFamily: family.semibold, fontSize: 15, color: dark.ink },
  addressBox: { gap: space.md },
  qrWrap: { alignSelf: "center", padding: space.md, borderRadius: 20, backgroundColor: "#ffffff" },
  address: { fontFamily: family.medium, fontSize: 13, lineHeight: 20, color: dark.ink, textAlign: "center" },
  copy: { minHeight: touch + space.sm, borderRadius: 999, backgroundColor: tone.raised, alignItems: "center", justifyContent: "center" },
  copyLabel: { fontFamily: family.semibold, fontSize: 14, color: dark.ink },
  warn: { fontFamily: family.medium, fontSize: 13, lineHeight: 19, color: tone.butter },
  end: { padding: space.md, borderRadius: 16, backgroundColor: tone.raised, gap: 4 },
  endLabel: { fontFamily: family.medium, fontSize: 11, letterSpacing: 1.2, color: dark.muted },
  endValue: { fontFamily: family.semibold, fontSize: 20, letterSpacing: -0.6, color: dark.ink },
  step: { flexDirection: "row", gap: space.md, alignItems: "flex-start" },
  stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: tone.violet, alignItems: "center", justifyContent: "center" },
  stepNumber: { fontFamily: family.semibold, fontSize: 13, color: tone.ink },
  stepTitle: { fontFamily: family.semibold, fontSize: 14, color: dark.ink },
  cta: { minHeight: 56, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: tone.coral },
  ctaOff: { opacity: 0.4 },
  ctaLabel: { fontFamily: family.semibold, fontSize: 16, color: tone.ink },
  search: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: touch + space.sm, paddingHorizontal: space.lg, borderRadius: 999, backgroundColor: tone.card },
  searchGlyph: { fontFamily: family.medium, fontSize: 20, color: dark.muted },
  searchInput: { flex: 1, fontFamily: family.regular, fontSize: 15, color: dark.ink, paddingVertical: 0 },
  option: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 64, paddingHorizontal: space.lg, borderRadius: 20, backgroundColor: tone.card },
  optionName: { fontFamily: family.semibold, fontSize: 15, color: dark.ink },
  ok: { fontFamily: family.medium, fontSize: 13, lineHeight: 19, color: dark.green },
  copyChip: { minHeight: touch, paddingHorizontal: space.lg, borderRadius: 999, backgroundColor: tone.raised, justifyContent: "center" },
});
