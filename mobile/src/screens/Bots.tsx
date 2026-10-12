import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Bot, BotMode } from "shared";
import { HeadlineBox } from "../components/HeadlineBox";
import { Mark } from "../components/Mark";
import { LiveBots } from "../components/LiveBots";
import { PaperBots } from "../components/PaperBots";
import { StrategyLab } from "../components/StrategyLab";
import { TabBar, tabBarHeight, type TabKey } from "../components/TabBar";
import { CardTitle, RoundButton, ScreenTitle, SelectPill, Switcher, Tag, ToneCard, tone } from "../components/ui";
import { draftBot, removeBot, setBotEnabled, subscribeBots, updateBotRules } from "../lib/bots";
import { hlNetwork } from "../lib/hl";
import { publishStrategy } from "../lib/ranks";
import { dark, family, space, touch } from "../theme";

const explorer = hlNetwork === "mainnet" ? "https://app.hyperliquid.xyz/explorer/tx/" : "https://app.hyperliquid-testnet.xyz/explorer/tx/";

const ideas = [
  { text: "long ETH short BTC 2x $100 stop 8%", fill: tone.sky },
  { text: "long ETH 3x $50 stop 6% tp 12%", fill: tone.lime },
  { text: "short SOL 2x $80 stop 10%", fill: tone.butter },
];

function usd(value: number): string {
  return `${value < 0 ? "−" : ""}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusDot(bot: Bot): string {
  if (bot.status === "watching" || bot.status === "open") return dark.green;
  if (bot.status === "halted" || bot.status === "stopped") return dark.red;
  return dark.muted;
}

type BotsProps = { name?: string; labSymbol?: string | null; onSelectTab: (key: TabKey) => void; onOpenAsset: (symbol: string) => void };

export function Bots({ name, labSymbol, onSelectTab, onOpenAsset }: BotsProps) {
  const insets = useSafeAreaInsets();
  const [bots, setBots] = useState<Bot[]>([]);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<BotMode>("guard");
  const [hint, setHint] = useState<string | null>(null);
  const showError = (error: unknown) => setHint(error instanceof Error ? error.message : String(error));
  const [view, setView] = useState<"strategies" | "agent">("strategies");
  const [liveKey, setLiveKey] = useState(0);

  useEffect(() => subscribeBots(setBots), []);

  async function create() {
    setHint(null);
    if (prompt.trim() === "") {
      setHint("Describe a trade first, or tap one of the ideas.");
      return;
    }
    try {
      const problem = await draftBot(prompt, mode);
      if (problem) setHint(problem);
      else {
        setPrompt("");
        setHint("Bot added below. Press Start to run it.");
      }
    } catch (error) {
      setHint(error instanceof Error ? error.message : String(error));
    }
  }

  const running = bots.filter((bot) => bot.enabled).length;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm, paddingBottom: tabBarHeight + insets.bottom + space.xl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenTitle title="Bots" right={<Tag label={`${running} running`} dot={running > 0 ? dark.green : dark.muted} />} />
        <View style={styles.depositNote}>
          <Text style={styles.depositNoteText}>Deposit at least $10 before starting a bot. Hyperliquid's smallest order is $10, so a bot can't place a trade with less.</Text>
        </View>

        <Switcher
          items={[
            { key: "strategies", label: "Strategies", dot: tone.butter, count: 4 },
            { key: "agent", label: "Agent", dot: tone.violet, count: bots.length },
          ]}
          value={view}
          onChange={setView}
        />

        {view === "strategies" && (
          <>
            <StrategyLab initialSymbol={labSymbol} onOpenAsset={onOpenAsset} onLive={() => setLiveKey((k) => k + 1)} />
            <PaperBots onOpenAsset={onOpenAsset} />
            <LiveBots refreshKey={liveKey} onOpenAsset={onOpenAsset} />
          </>
        )}

        {view === "agent" && (
        <>
        <ToneCard>
          <CardTitle>Agent</CardTitle>
          <View style={styles.messageRow}>
            <View style={styles.avatar}>
              <Mark size={20} tint={dark.onAccent} />
            </View>
            <View style={styles.bubble}>
              <Text style={styles.bubbleText}>
                Hi{name ? `, ${name}` : ""}. Tell me a trade in one line. I turn it into a card with a stop, and a bot guards it while the app is open.
                {bots.length > 0 ? ` You have ${bots.length} bot${bots.length === 1 ? "" : "s"} set up.` : ""}
              </Text>
            </View>
          </View>

          <HeadlineBox mode={mode} />

          <View style={styles.ideas}>
            {ideas.map((idea) => (
              <Pressable
                key={idea.text}
                onPress={() => setPrompt(idea.text)}
                style={({ pressed }) => [styles.idea, { backgroundColor: idea.fill }, pressed && styles.pressed]}
              >
                <Text style={styles.ideaText}>{idea.text}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.modes}>
            <SelectPill label="Guard" active={mode === "guard"} onPress={() => setMode("guard")} />
            <SelectPill label="Auto" active={mode === "auto"} onPress={() => setMode("auto")} />
            <Text style={styles.modeNote} numberOfLines={2}>
              {mode === "guard" ? "Closes at your stop or target." : "Opens on funding carry, then guards."}
            </Text>
          </View>

          <View style={styles.inputRow}>
            <RoundButton glyph="+" label="Create bot" fill={tone.coral} onPress={() => void create()} />
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              placeholder="Describe a trade to start"
              placeholderTextColor={dark.muted}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={() => void create()}
              style={styles.input}
            />
          </View>
          {hint !== null && <Text style={styles.hint}>{hint}</Text>}
        </ToneCard>

        <Text style={styles.section}>YOUR BOTS</Text>
        {bots.length === 0 ? (
          <Text style={styles.empty}>No bots yet. Describe a trade above or start a paper bot.</Text>
        ) : (
          bots.map((bot) => (
            <ToneCard key={bot.id}>
              <View style={styles.botHead}>
                <Text style={styles.botName} numberOfLines={1}>
                  {bot.name.toUpperCase()}
                </Text>
                <Tag label={bot.mode === "auto" ? "Auto" : "Guard"} />
                <Tag label={bot.status} dot={statusDot(bot)} />
              </View>
              <View style={styles.tags}>
                {bot.card.legs.map((leg) => (
                  <Pressable key={`${leg.symbol}-${leg.direction}`} onPress={() => onOpenAsset(leg.symbol)} accessibilityLabel={`Trade ${leg.symbol}`}>
                    <Tag label={`${leg.direction === "long" ? "Long" : "Short"} ${leg.symbol} ${leg.leverage}x ↗`} dot={leg.direction === "long" ? dark.green : dark.red} />
                  </Pressable>
                ))}
              </View>
              <View style={styles.stats}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Margin</Text>
                  <Text style={styles.statValue}>{usd(bot.card.marginUsd)}</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Stop</Text>
                  <Text style={styles.statValue}>{bot.card.stopLossPct}%</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Realised</Text>
                  <Text style={[styles.statValue, { color: bot.realizedPnlUsd >= 0 ? dark.green : dark.red }]}>{usd(bot.realizedPnlUsd)}</Text>
                </View>
              </View>

              {bot.mode === "auto" && (
                <View style={styles.rules}>
                  <View style={styles.rule}>
                    <Text style={styles.statLabel}>Min carry %</Text>
                    <TextInput
                      defaultValue={String(bot.rules.minCarryAprPct)}
                      keyboardType="numbers-and-punctuation"
                      onEndEditing={(event) => void updateBotRules(bot.id, { minCarryAprPct: Number(event.nativeEvent.text) || 0 }).catch(showError)}
                      style={styles.smallInput}
                    />
                  </View>
                  <View style={styles.rule}>
                    <Text style={styles.statLabel}>Opens / day</Text>
                    <TextInput
                      defaultValue={String(bot.rules.maxOpensPerDay)}
                      keyboardType="number-pad"
                      onEndEditing={(event) => void updateBotRules(bot.id, { maxOpensPerDay: Math.max(1, Number(event.nativeEvent.text) || 1) }).catch(showError)}
                      style={styles.smallInput}
                    />
                  </View>
                </View>
              )}

              {bot.lastCheck !== null && (
                <Text style={styles.muted}>
                  Checked {new Date(bot.lastCheck.at).toLocaleTimeString()}: {bot.lastCheck.message}
                </Text>
              )}

              {bot.log.slice(0, 4).map((entry) => (
                <Pressable
                  key={`${entry.at}-${entry.message}`}
                  disabled={!entry.txHash}
                  onPress={() => entry.txHash && void Linking.openURL(`${explorer}${entry.txHash}`)}
                >
                  <Text style={[styles.log, entry.level === "error" && styles.down, entry.level === "action" && styles.logAction]}>
                    {new Date(entry.at).toLocaleTimeString()} {entry.message}
                    {entry.txHash ? " · tx" : ""}
                  </Text>
                </Pressable>
              ))}

              <View style={styles.actions}>
                <Pressable
                  onPress={() => void setBotEnabled(bot.id, !bot.enabled).catch(showError)}
                  style={({ pressed }) => [styles.action, { backgroundColor: bot.enabled ? tone.paper : tone.coral }, pressed && styles.pressed]}
                >
                  <Text style={styles.actionLabel}>{bot.enabled ? "Stop" : "Start"}</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    void publishStrategy(bot.card)
                      .then((shared) => setHint(`Shared as strategy ${shared.id}. It appears under Ranks in Bins.`))
                      .catch((error) => setHint(error instanceof Error ? error.message : String(error)))
                  }
                  style={({ pressed }) => [styles.action, styles.actionQuiet, pressed && styles.pressed]}
                >
                  <Text style={styles.actionQuietLabel}>Share</Text>
                </Pressable>
                <Pressable onPress={() => void removeBot(bot.id).catch(showError)} style={({ pressed }) => [styles.action, styles.actionQuiet, pressed && styles.pressed]}>
                  <Text style={styles.actionQuietLabel}>Delete</Text>
                </Pressable>
              </View>
            </ToneCard>
          ))
        )}
        </>
        )}
      </ScrollView>

      <TabBar active="bots" onSelect={onSelectTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: dark.paper },
  content: { paddingHorizontal: space.lg, gap: space.lg },
  pressed: { opacity: 0.75 },
  messageRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: tone.violet, alignItems: "center", justifyContent: "center" },
  bubble: { flex: 1, padding: space.md, borderRadius: 20, borderTopLeftRadius: 6, backgroundColor: tone.raised },
  bubbleText: { fontFamily: family.regular, fontSize: 14, lineHeight: 21, color: dark.ink },
  ideas: { alignItems: "flex-end", gap: space.sm },
  idea: { paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: 999 },
  ideaText: { fontFamily: family.medium, fontSize: 13, color: tone.ink },
  modes: { flexDirection: "row", alignItems: "center", gap: space.sm },
  modeNote: { flex: 1, fontFamily: family.regular, fontSize: 12, lineHeight: 16, color: dark.muted },
  inputRow: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.xs, borderRadius: 999, backgroundColor: dark.paper },
  input: { flex: 1, minHeight: touch, fontFamily: family.regular, fontSize: 14, color: dark.ink, paddingHorizontal: space.sm },
  hint: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  section: { fontFamily: family.semibold, fontSize: 22, letterSpacing: -0.8, color: dark.ink, marginTop: space.sm },
  empty: { fontFamily: family.regular, fontSize: 13, color: dark.muted },
  botHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  botName: { flex: 1, fontFamily: family.semibold, fontSize: 18, letterSpacing: -0.6, color: dark.ink },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  stats: { flexDirection: "row", gap: space.sm },
  stat: { flex: 1, padding: space.md, borderRadius: 18, backgroundColor: tone.raised, gap: 2 },
  statLabel: { fontFamily: family.regular, fontSize: 11, color: dark.muted },
  statValue: { fontFamily: family.medium, fontSize: 15, color: dark.ink },
  rules: { flexDirection: "row", gap: space.sm },
  rule: { flex: 1, gap: space.xs },
  smallInput: { fontFamily: family.regular, fontSize: 14, color: dark.ink, padding: space.sm, borderRadius: 12, backgroundColor: tone.raised },
  muted: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  depositNote: { padding: space.md, borderRadius: 16, backgroundColor: "rgba(123, 115, 240, 0.16)" },
  depositNoteText: { fontFamily: family.regular, fontSize: 13, lineHeight: 19, color: dark.ink },
  log: { fontFamily: family.regular, fontSize: 11, color: dark.muted },
  logAction: { color: dark.ink },
  down: { color: dark.red },
  actions: { flexDirection: "row", gap: space.sm },
  action: { flex: 1, minHeight: touch + space.xs, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontFamily: family.semibold, fontSize: 14, color: tone.ink },
  actionQuiet: { backgroundColor: tone.raised },
  actionQuietLabel: { fontFamily: family.medium, fontSize: 14, color: dark.muted },
});
