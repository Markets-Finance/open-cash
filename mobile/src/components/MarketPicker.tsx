import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { displaySymbol } from "../lib/market";
import { dark, family, space, touch } from "../theme";
import { AssetMark } from "./AssetMark";

type Row = { kind: "group"; label: string } | { kind: "item"; symbol: string };

export function MarketPicker({ symbols, value, onChange }: { symbols: string[]; value: string; onChange: (symbol: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const rows = useMemo<Row[]>(() => {
    const needle = query.trim().toLowerCase();
    const shown = symbols.filter((s) => needle === "" || s.toLowerCase().includes(needle));
    const crypto = shown.filter((s) => !s.includes(":"));
    const traditional = shown.filter((s) => s.includes(":"));
    return [
      ...(crypto.length > 0 ? [{ kind: "group", label: "Crypto" } as Row, ...crypto.map((symbol) => ({ kind: "item", symbol }) as Row)] : []),
      ...(traditional.length > 0 ? [{ kind: "group", label: "Stocks, commodities and indices" } as Row, ...traditional.map((symbol) => ({ kind: "item", symbol }) as Row)] : []),
    ];
  }, [symbols, query]);

  function choose(symbol: string) {
    onChange(symbol);
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Choose a market" style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <AssetMark symbol={value} size={24} />
        <Text style={styles.buttonLabel}>{displaySymbol(value)}</Text>
        <Text style={styles.caret}>▾</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={styles.backdropTap} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Choose a market</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                <Text style={styles.close}>×</Text>
              </Pressable>
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={`Search ${symbols.length} markets`}
              placeholderTextColor={dark.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.search}
            />
            <FlatList
              data={rows}
              keyExtractor={(row) => (row.kind === "group" ? `g:${row.label}` : row.symbol)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) =>
                item.kind === "group" ? (
                  <Text style={styles.group}>{item.label}</Text>
                ) : (
                  <Pressable onPress={() => choose(item.symbol)} style={({ pressed }) => [styles.item, item.symbol === value && styles.itemOn, pressed && styles.pressed]}>
                    <AssetMark symbol={item.symbol} size={26} />
                    <Text style={styles.itemLabel}>{displaySymbol(item.symbol)}</Text>
                  </Pressable>
                )
              }
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: space.sm, minHeight: touch, paddingHorizontal: space.md, borderRadius: 999, backgroundColor: "#29312e" },
  buttonLabel: { fontFamily: family.semibold, fontSize: 15, color: dark.ink },
  caret: { fontFamily: family.medium, fontSize: 14, color: dark.muted },
  pressed: { opacity: 0.75 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  backdropTap: { flex: 1 },
  sheet: { maxHeight: "75%", paddingTop: space.md, paddingHorizontal: space.lg, paddingBottom: space.xl, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: dark.surface, gap: space.sm },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { fontFamily: family.semibold, fontSize: 18, color: dark.ink },
  close: { fontFamily: family.medium, fontSize: 26, color: dark.muted },
  search: { fontFamily: family.regular, fontSize: 15, color: dark.ink, minHeight: touch, paddingHorizontal: space.md, borderRadius: 14, backgroundColor: "#29312e" },
  group: { marginTop: space.md, marginBottom: space.xs, fontFamily: family.medium, fontSize: 11, letterSpacing: 1.1, color: dark.muted },
  item: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: touch, paddingHorizontal: space.sm, borderRadius: 12 },
  itemOn: { backgroundColor: "#29312e" },
  itemLabel: { fontFamily: family.medium, fontSize: 15, color: dark.ink },
});
