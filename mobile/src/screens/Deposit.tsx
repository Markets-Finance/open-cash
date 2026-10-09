import * as Clipboard from "expo-clipboard";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { intents, type TradingAccount } from "shared";
import { AssetMark } from "../components/AssetMark";
import { TabBar, tabBarHeight, type TabKey } from "../components/TabBar";
import { QrCode } from "../components/QrCode";
import { RoundButton, Switcher, Tag, ToneCard, tone } from "../components/ui";
import { chainName, createDepositAddress, loadCatalog, loadInfo, loadLanded, loadStatus, previewQuote, type DepositAddress, type Destination, type Info, type Landed, type Source } from "../lib/intents";
import { dark, family, space, touch } from "../theme";

type DepositProps = {
  trader: TradingAccount;
  onBack: () => void;
  onSelectTab: (key: TabKey) => void;
};

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function Deposit({ trader, onBack, onSelectTab }: DepositProps) {
  const insets = useSafeAreaInsets();
  const [sources, setSources] = useState<Source[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [origin, setOrigin] = useState<Source | null>(null);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [amount, setAmount] = useState("100");
  const [refund, setRefund] = useState("");
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const [quote, setQuote] = useState<intents.Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"monad" | "chain">("chain");
  const [copied, setCopied] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [address, setAddress] = useState<DepositAddress | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [state, setState] = useState<string | null>(null);
  const [landed, setLanded] = useState<{ received: Landed[]; success: Landed[] }>({ received: [], success: [] });

  useEffect(() => {
    loadInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

  useEffect(() => {
    setAddress(null);
    setAddressError(null);
  }, [origin?.blockchain]);

  useEffect(() => {
    if (!address) return;
    let live = true;
    const poll = () =>
      address.kind === "persistent"
        ? loadLanded(address.depositAddress).then((next) => live && setLanded(next))
        : loadStatus(address.depositAddress, address.memo).then((next) => live && setState(next));
    void poll();
    const timer = setInterval(() => void poll(), 15_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [address]);

  async function makeAddress() {
    if (!origin) return;
    setCreating(true);
    setAddressError(null);
    try {
      if (!origin) return;
      setAddress(await createDepositAddress({ chain: origin.blockchain, recipient: trader.address, originAsset: origin.assetId, amount: value, decimals: origin.decimals, refundTo }));
    } catch (e) {
      setAddressError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    loadCatalog()
      .then(({ sources: list, destinations: targets }) => {
        setSources(list);
        setDestinations(targets);
        setOrigin(list.find((s) => s.blockchain === "eth" && s.symbol === "USDC") ?? list[0] ?? null);
        setDestination(targets.find((t) => t.symbol === "USDC") ?? targets[0] ?? null);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  const evm = origin ? intents.isEvmChain(origin.blockchain) : true;
  const refundTo = evm ? trader.address : refund.trim();
  const value = Number(amount) || 0;

  useEffect(() => {
    setQuote(null);
    setProblem(null);
    if (!origin || !destination || value <= 0) return;
    if (!evm && refundTo.length < 8) {
      setProblem(`Enter your ${chainName(origin.blockchain)} address so a failed swap can be refunded.`);
      return;
    }
    setQuoting(true);
    let live = true;
    const timer = setTimeout(() => {
      previewQuote({ origin, destination, amount: value, recipient: trader.address, refundTo })
        .then((next) => live && setQuote(next))
        .catch((e) => live && setProblem(e instanceof Error ? e.message : String(e)))
        .finally(() => live && setQuoting(false));
    }, 600);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [origin, destination, value, refundTo, evm, trader.address]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = needle === "" ? sources : sources.filter((s) => s.symbol.toLowerCase().includes(needle) || chainName(s.blockchain).toLowerCase().includes(needle));
    return list.slice(0, 60);
  }, [sources, search]);

  const cost = quote ? intents.costBps(quote) : null;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm, paddingBottom: tabBarHeight + insets.bottom + space.xl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <RoundButton glyph="←" label="Back" light onPress={() => (picking ? setPicking(false) : onBack())} />
          <Text style={styles.title}>{picking ? "PICK ASSET" : "DEPOSIT"}</Text>
          <Tag label={info?.provider === "aurora" ? "Aurora Intents" : "No Aurora key"} dot={info?.provider === "aurora" ? dark.green : tone.butter} />
        </View>

        {!picking && (
          <Switcher
            items={[
              { key: "chain", label: "Another chain", dot: tone.violet },
              { key: "monad", label: "From Monad", dot: tone.lime },
            ]}
            value={mode}
            onChange={setMode}
          />
        )}

        {!picking && mode === "monad" && (
          <ToneCard>
            <Text style={styles.label}>YOUR MONAD ADDRESS</Text>
            <View style={styles.qrWrap}>
              <QrCode value={trader.address} />
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
            <Text style={styles.warn}>Send only on the Monad network. USDC, USDT0, AUSD and MON are fine. Anything sent on another network will not arrive.</Text>
            <Text style={styles.muted}>Perpl trades in AUSD. USDC and USDT0 are converted to AUSD in the app before they become margin.</Text>
          </ToneCard>
        )}

        {mode === "chain" && loadError !== null && <Text style={styles.error}>{loadError}. Start the backend and try again.</Text>}
        {mode === "chain" && loadError === null && origin === null && <ActivityIndicator color={dark.ink} />}

        {picking ? (
          <>
            <View style={styles.search}>
              <Text style={styles.searchGlyph}>⌕</Text>
              <TextInput value={search} onChangeText={setSearch} placeholder="Search token or chain" placeholderTextColor={dark.muted} autoCorrect={false} style={styles.searchInput} />
            </View>
            {shown.map((source) => (
              <Pressable
                key={source.assetId}
                onPress={() => {
                  setOrigin(source);
                  setPicking(false);
                  setSearch("");
                }}
                style={({ pressed }) => [styles.option, pressed && styles.pressed]}
              >
                <AssetMark symbol={source.symbol} size={32} />
                <View style={styles.flex}>
                  <Text style={styles.optionName}>{source.symbol}</Text>
                  <Text style={styles.muted}>{chainName(source.blockchain)}</Text>
                </View>
                <Text style={styles.muted}>${source.price >= 1 ? source.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : source.price.toFixed(4)}</Text>
              </Pressable>
            ))}
          </>
        ) : (
          mode === "chain" &&
          origin &&
          destination && (
            <>
              <ToneCard>
                <Text style={styles.label}>YOU PAY</Text>
                <View style={styles.payRow}>
                  <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={styles.amount} placeholder="0" placeholderTextColor={dark.muted} />
                  <Pressable onPress={() => setPicking(true)} accessibilityRole="button" style={({ pressed }) => [styles.assetButton, pressed && styles.pressed]}>
                    <AssetMark symbol={origin.symbol} size={28} />
                    <View>
                      <Text style={styles.assetSymbol}>{origin.symbol}</Text>
                      <Text style={styles.assetChain}>{chainName(origin.blockchain)}</Text>
                    </View>
                    <Text style={styles.chevron}>⌄</Text>
                  </Pressable>
                </View>
                {!evm && (
                  <>
                    <Text style={styles.label}>REFUND ADDRESS ON {chainName(origin.blockchain).toUpperCase()}</Text>
                    <TextInput value={refund} onChangeText={setRefund} autoCapitalize="none" autoCorrect={false} placeholder="Where to return funds if the swap fails" placeholderTextColor={dark.muted} style={styles.input} />
                  </>
                )}
              </ToneCard>

              <ToneCard fill={tone.violet}>
                <Text style={styles.labelOnColor}>YOU GET ON MONAD</Text>
                <View style={styles.payRow}>
                  <Text style={styles.getAmount}>{quoting ? "…" : quote ? Number(quote.amountOutFormatted).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—"}</Text>
                  <View style={styles.pills}>
                    {destinations.map((target) => (
                      <Pressable key={target.assetId} onPress={() => setDestination(target)} style={[styles.pill, destination.assetId === target.assetId && styles.pillActive]}>
                        <Text style={[styles.pillLabel, destination.assetId === target.assetId && styles.pillLabelActive]}>{target.symbol}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <Text style={styles.onColorMuted}>Lands in your OpenCash address {short(trader.address)}</Text>
              </ToneCard>

              <ToneCard>
                <Text style={styles.label}>THIS SWAP</Text>
                {quoting && <ActivityIndicator color={dark.ink} />}
                {problem !== null && <Text style={styles.error}>{problem}</Text>}
                {quote !== null && (
                  <View style={styles.facts}>
                    <View style={styles.fact}>
                      <Text style={styles.muted}>Cost</Text>
                      <Text style={styles.factValue}>{cost === null ? "—" : `${(cost / 100).toFixed(2)}%`}</Text>
                    </View>
                    <View style={styles.fact}>
                      <Text style={styles.muted}>Arrives in</Text>
                      <Text style={styles.factValue}>about {quote.timeEstimate}s</Text>
                    </View>
                    <View style={styles.fact}>
                      <Text style={styles.muted}>At least</Text>
                      <Text style={styles.factValue}>{(Number(quote.minAmountOut) / 10 ** destination.decimals).toLocaleString(undefined, { maximumFractionDigits: 4 })} {destination.symbol}</Text>
                    </View>
                  </View>
                )}
                {quote !== null && (
                  <View style={styles.end}>
                    <Text style={styles.endLabel}>YOU END WITH ABOUT</Text>
                    <Text style={styles.endValue}>${Number(quote.amountOutUsd).toFixed(2)} of Perpl margin</Text>
                    <Text style={styles.muted}>Before the small USDC to AUSD conversion cost, which is not quoted yet.</Text>
                  </View>
                )}
                {address === null ? (
                  <Pressable
                    disabled={!info?.persistent || creating}
                    onPress={() => void makeAddress()}
                    style={({ pressed }) => [styles.cta, (!info?.persistent || creating) && styles.ctaOff, pressed && styles.pressed]}
                  >
                    <Text style={styles.ctaLabel}>{creating ? "Creating…" : info?.persistent ? `Get my ${chainName(origin.blockchain)} deposit address` : "Needs an Aurora key"}</Text>
                  </Pressable>
                ) : (
                  <View style={styles.addressBox}>
                    <Text style={styles.label}>SEND {evm ? "ON ANY EVM CHAIN" : chainName(origin.blockchain).toUpperCase()} TO</Text>
                    <View style={styles.qrWrap}>
                      <QrCode value={address.depositAddress} size={168} />
                    </View>
                    <Text style={styles.address} selectable>
                      {address.depositAddress}
                    </Text>
                    {address.memo ? <Text style={styles.warn}>Memo required: {address.memo}</Text> : null}
                    {address.kind === "persistent" ? (
                      <Text style={styles.muted}>This address is yours and stays the same. Send any supported token any time. It arrives on Monad as USDC in your OpenCash address.</Text>
                    ) : (
                      <>
                        <Text style={styles.warn}>
                          One-time address. Send exactly {address.amountIn} {origin.symbol}
                          {address.deadline ? ` before ${new Date(address.deadline).toLocaleTimeString()}` : ""}.
                        </Text>
                        <Text style={styles.muted}>You get about {address.amountOut} USDC on Monad. Status: {state ?? "waiting for your deposit"}.</Text>
                      </>
                    )}
                    {landed.received.length + landed.success.length > 0 && (
                      <Text style={styles.muted}>
                        Received {landed.received.length} · delivered {landed.success.length}
                      </Text>
                    )}
                  </View>
                )}
                {addressError !== null && <Text style={styles.error}>{addressError}</Text>}
                {info !== null && !info.persistent && <Text style={styles.muted}>Quotes are live, but deposit addresses need an Aurora key from studio.aurora.dev in the backend.</Text>}
              </ToneCard>

              <ToneCard>
                <Text style={styles.label}>HOW IT WORKS</Text>
                {[
                  ["1", "You send from your own wallet", "To a one-time address on the chain you chose. We show it with a countdown."],
                  ["2", "Aurora brings it to Monad", "Usually under a minute. It arrives as USDC in your OpenCash address."],
                  ["3", "The app converts it to AUSD", "Perpl margin is AUSD, so this happens automatically."],
                  ["4", "It goes into Perpl", "Then you can open a bin or a position."],
                ].map(([n, title, body]) => (
                  <View key={n} style={styles.step}>
                    <View style={styles.stepDot}>
                      <Text style={styles.stepNumber}>{n}</Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.stepTitle}>{title}</Text>
                      <Text style={styles.muted}>{body}</Text>
                    </View>
                  </View>
                ))}
              </ToneCard>
            </>
          )
        )}
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
});
