import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { BotMode, StrategyCard } from "shared";
import { addBotFromCard } from "../lib/bots";
import { backendUrl } from "../lib/config";
import { hlNetwork } from "../lib/hl";
import { dark, family, space, touch } from "../theme";

type Translation = {
  card: StrategyCard;
  preview?: { maxLossAtStopUsd: number; issues?: { message?: string; detail?: string }[] };
  approvable?: boolean;
  rationale?: string;
  caveats?: string[];
  dropped?: string[];
  note?: string;
  error?: string;
};

function legsText(card: StrategyCard): string {
  return card.legs.map((leg) => `${leg.direction === "long" ? "Long" : "Short"} ${leg.symbol.split(":").pop()} ${leg.leverage}x`).join(" · ");
}

export function HeadlineBox({ mode }: { mode: BotMode }) {
  const [headline, setHeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Translation | null>(null);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);

  async function translate() {
    setBusy(true);
    setResult(null);
    setMessage({ text: "Reading the headline…", failed: false });
    try {
      const response = await fetch(`${backendUrl}/agent/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headline: headline.trim(), network: hlNetwork, marginUsd: hlNetwork === "testnet" ? 10 : 50 }),
      });
      const body = (await response.json()) as Translation;
      if (response.status === 422) {
        setMessage({ text: `No trade found for that headline. ${body.error ?? ""}`.trim(), failed: false });
        return;
      }
      if (!response.ok || !body.card) throw new Error(body.error ?? `Request failed (${response.status})`);
      setResult(body);
      setMessage(body.note ? { text: body.note, failed: false } : null);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), failed: true });
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!result) return;
    try {
      await addBotFromCard(result.card, mode);
      setMessage({ text: "Bot added below. Press Start to run it.", failed: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), failed: true });
    }
  }

  return (
    <View style={styles.box}>
      <Text style={styles.label}>TURN A HEADLINE INTO A TRADE</Text>
      <TextInput
        value={headline}
        onChangeText={setHeadline}
        placeholder="Oil jumps as peace talks stall"
        placeholderTextColor={dark.muted}
        maxLength={500}
        style={styles.input}
      />
      <Pressable disabled={busy || headline.trim().length < 8} onPress={() => void translate()} style={({ pressed }) => [styles.cta, (busy || headline.trim().length < 8) && styles.ctaOff, pressed && styles.pressed]}>
        {busy ? <ActivityIndicator color={dark.onAccent} /> : <Text style={styles.ctaLabel}>Turn into a trade</Text>}
      </Pressable>
      {message !== null && <Text style={message.failed ? styles.error : styles.muted}>{message.text}</Text>}
      {result !== null && (
        <View style={styles.result}>
          <Text style={styles.cardLegs}>{legsText(result.card)}</Text>
          {result.rationale ? <Text style={styles.muted}>{result.rationale}</Text> : null}
          {result.preview ? <Text style={styles.muted}>Most you can lose at the stop: ${result.preview.maxLossAtStopUsd.toFixed(2)}.</Text> : null}
          {(result.caveats ?? []).map((text) => (
            <Text key={text} style={styles.muted}>{text}</Text>
          ))}
          {result.dropped && result.dropped.length > 0 ? <Text style={styles.muted}>Left out because they are not listed: {result.dropped.join(", ")}.</Text> : null}
          {(result.preview?.issues ?? []).map((issue, i) => (
            <Text key={i} style={styles.muted}>{issue.message ?? issue.detail ?? ""}</Text>
          ))}
          {result.approvable === false ? (
            <Text style={styles.error}>This card has a blocking issue, so it cannot be added.</Text>
          ) : (
            <Pressable onPress={() => void add()} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
              <Text style={styles.ctaLabel}>Add as {mode} bot</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm, padding: space.md, borderRadius: 18, backgroundColor: "#29312e" },
  label: { fontFamily: family.medium, fontSize: 11, letterSpacing: 1.2, color: dark.muted },
  input: { fontFamily: family.regular, fontSize: 14, color: dark.ink, minHeight: touch, paddingHorizontal: space.md, borderRadius: 14, backgroundColor: dark.surface },
  cta: { minHeight: touch, borderRadius: 999, backgroundColor: dark.accent, alignItems: "center", justifyContent: "center" },
  ctaOff: { opacity: 0.45 },
  ctaLabel: { fontFamily: family.semibold, fontSize: 14, color: dark.onAccent },
  pressed: { opacity: 0.75 },
  muted: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  error: { fontFamily: family.regular, fontSize: 13, lineHeight: 19, color: dark.red },
  result: { gap: space.sm },
  cardLegs: { fontFamily: family.semibold, fontSize: 14, color: dark.ink },
});
