import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { tweetText, type LinkChallenge, type TradingAccount, type VerifiedLink } from "shared";
import { backendUrl } from "../lib/config";
import { dark, family, space, touch } from "../theme";

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${backendUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data;
}

export function XVerify({ trader }: { trader: TradingAccount }) {
  const [handle, setHandle] = useState("");
  const [challenge, setChallenge] = useState<LinkChallenge | null>(null);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; failed: boolean }>({ text: "Prove this address is yours on X. It adds your handle to the leaderboard.", failed: false });

  useEffect(() => {
    fetch(`${backendUrl}/identity?address=${trader.address}`)
      .then((response) => (response.ok ? (response.json() as Promise<VerifiedLink>) : null))
      .then((link) => link && setStatus({ text: `Verified as @${link.handle}.`, failed: false }))
      .catch(() => {});
  }, [trader.address]);

  async function getProof() {
    setBusy(true);
    try {
      const issued = await post<{ challenge: LinkChallenge; message: string }>("/identity/challenge", { address: trader.address, handle });
      const signature = await trader.account.signMessage({ message: issued.message });
      setChallenge(issued.challenge);
      setText(tweetText(issued.challenge, signature));
      setStatus({ text: "Post it, then paste the link below. Expires in 15 minutes.", failed: false });
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : String(error), failed: true });
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!challenge) return;
    setBusy(true);
    try {
      const link = await post<VerifiedLink>("/identity/verify", { challengeId: challenge.id, tweetUrl: url.trim() });
      setChallenge(null);
      setText("");
      setStatus({ text: `Verified as @${link.handle}.`, failed: false });
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : String(error), failed: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={status.failed ? styles.error : styles.note}>{status.text}</Text>
      <TextInput value={handle} onChangeText={setHandle} autoCapitalize="none" autoCorrect={false} placeholder="@yourhandle" placeholderTextColor={dark.muted} style={styles.input} />
      <Pressable disabled={busy || handle.trim().length < 2} onPress={() => void getProof()} style={({ pressed }) => [styles.cta, (busy || handle.trim().length < 2) && styles.ctaOff, pressed && styles.pressed]}>
        <Text style={styles.ctaLabel}>Get proof</Text>
      </Pressable>
      {challenge !== null && (
        <>
          <Text style={styles.note}>1. Post this exactly as it is. 2. Paste the link to your post.</Text>
          <Text selectable style={styles.proof}>{text}</Text>
          <Pressable onPress={() => void Linking.openURL(`https://x.com/intent/post?text=${encodeURIComponent(text)}`)} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
            <Text style={styles.ctaLabel}>Post on X</Text>
          </Pressable>
          <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} placeholder="https://x.com/you/status/…" placeholderTextColor={dark.muted} style={styles.input} />
          <Pressable disabled={busy || url.trim().length < 10} onPress={() => void verify()} style={({ pressed }) => [styles.cta, (busy || url.trim().length < 10) && styles.ctaOff, pressed && styles.pressed]}>
            <Text style={styles.ctaLabel}>Verify</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.lg, borderRadius: 24, backgroundColor: dark.surface },
  note: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  error: { fontFamily: family.regular, fontSize: 13, lineHeight: 19, color: dark.red },
  input: { fontFamily: family.regular, fontSize: 15, color: dark.ink, minHeight: touch, paddingHorizontal: space.md, borderRadius: 14, backgroundColor: "#29312e" },
  proof: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.ink, padding: space.md, borderRadius: 14, backgroundColor: "#29312e" },
  cta: { minHeight: touch, borderRadius: 999, backgroundColor: dark.accent, alignItems: "center", justifyContent: "center" },
  ctaOff: { opacity: 0.45 },
  ctaLabel: { fontFamily: family.semibold, fontSize: 14, color: dark.onAccent },
  pressed: { opacity: 0.75 },
});
