import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { currentOwner } from "../lib/bots";
import { followStrategy, loadBoard, loadStrategies, type Board, type StrategyRow } from "../lib/ranks";
import { dark, family, space, touch } from "../theme";
import { money, pct } from "./labShared";

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function Ranks({ onOpenAsset }: { onOpenAsset?: (symbol: string) => void }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [strategies, setStrategies] = useState<StrategyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const mine = currentOwner()?.toLowerCase();

  useEffect(() => {
    let live = true;
    loadBoard().then((b) => live && setBoard(b)).catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    loadStrategies().then((s) => live && setStrategies(s.rows)).catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, []);

  async function follow(row: StrategyRow) {
    setStatus(null);
    try {
      await followStrategy(row);
      setStatus(`Following ${row.name}. An Auto bot was added in Bots. Press Start there.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <View style={styles.wrap}>
      {error !== null && <Text style={styles.error}>{error}</Text>}
      {status !== null && <Text style={styles.muted}>{status}</Text>}

      <Text style={styles.label}>TOP TRADERS</Text>
      {board === null && error === null && <ActivityIndicator color={dark.ink} />}
      {board !== null && (
        <Text style={styles.muted}>
          Perpl on Monad {board.network}, last {board.windowHours} hours. Net PnL after fees and funding, from on-chain events. Needs 5 closed trades and $1,000 volume.
        </Text>
      )}
      {board !== null && board.rows.length === 0 && <Text style={styles.muted}>No account has met the minimum yet.</Text>}
      {board?.rows.map((row) => (
        <View key={row.accountId} style={styles.row}>
          <Text style={styles.rank}>{row.rank}</Text>
          <View style={styles.rowBody}>
            <Text style={styles.name}>{row.handle ? `@${row.handle} ✓` : row.address ? short(row.address) : `Account ${row.accountId}`}</Text>
            <Text style={styles.muted}>
              {(row.winRate * 100).toFixed(0)}% wins · {row.closedTrades} trades · ${Math.round(row.volumeUsd).toLocaleString()} volume
            </Text>
          </View>
          <Text style={[styles.value, row.netPnlUsd < 0 && styles.down]}>{money(row.netPnlUsd)}</Text>
        </View>
      ))}

      <Text style={[styles.label, styles.gap]}>STRATEGIES</Text>
      <Text style={styles.muted}>Ranked by the median return of followers, author excluded, once two followers have closed trades.</Text>
      {strategies !== null && strategies.length === 0 && <Text style={styles.muted}>No strategies shared yet.</Text>}
      {strategies?.map((row) => (
        <View key={row.strategyId} style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.name}>{row.rank ? `#${row.rank} ` : ""}{row.name}</Text>
            <Text style={[styles.value, (row.medianRoiPct ?? 0) < 0 && styles.down]}>
              {row.medianRoiPct === null ? "needs 2 followers" : pct(row.medianRoiPct)}
            </Text>
          </View>
          <View style={styles.legRow}>
            {row.card.legs.map((leg) => (
              <Pressable key={`${leg.symbol}-${leg.direction}`} disabled={!onOpenAsset} onPress={() => onOpenAsset?.(leg.symbol)} style={styles.legChip}>
                <Text style={styles.legChipText}>
                  {leg.direction === "long" ? "Long" : "Short"} {leg.symbol} {leg.leverage}x
                </Text>
              </Pressable>
            ))}
            <Text style={styles.muted}>stop {row.card.stopLossPct}%</Text>
          </View>
          <Text style={styles.muted}>
            {row.authorHandle ? `@${row.authorHandle} ✓` : short(row.author)} · {row.followers} followers · follower PnL {money(row.totalFollowerPnlUsd)}
          </Text>
          {row.author.toLowerCase() === mine ? (
            <Text style={styles.muted}>Yours</Text>
          ) : (
            <Pressable onPress={() => void follow(row)} style={styles.follow}>
              <Text style={styles.followLabel}>Follow</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  label: { fontFamily: family.medium, fontSize: 11, letterSpacing: 1.3, color: dark.muted },
  gap: { marginTop: space.lg },
  muted: { fontFamily: family.regular, fontSize: 12, lineHeight: 18, color: dark.muted },
  error: { fontFamily: family.regular, fontSize: 12, color: dark.red },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: 18, backgroundColor: dark.surface },
  rank: { width: 24, fontFamily: family.medium, fontSize: 14, color: dark.muted },
  rowBody: { flex: 1, gap: 2 },
  name: { fontFamily: family.semibold, fontSize: 14, color: dark.ink },
  value: { fontFamily: family.medium, fontSize: 15, color: dark.ink },
  down: { color: dark.red },
  card: { padding: space.lg, borderRadius: 18, backgroundColor: dark.surface, gap: space.sm },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm },
  legRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs },
  legChip: { paddingVertical: 6, paddingHorizontal: space.md, borderRadius: 999, backgroundColor: "#29312e" },
  legChipText: { fontFamily: family.medium, fontSize: 12, color: dark.ink },
  follow: { minHeight: touch, borderRadius: 999, backgroundColor: dark.accent, alignItems: "center", justifyContent: "center" },
  followLabel: { fontFamily: family.semibold, fontSize: 14, color: dark.onAccent },
});
