import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { assetLogoUrl } from "shared";
import { dark, family } from "../theme";

type AssetMarkProps = {
  symbol: string;
  size?: number;
  uri?: string;
};

export function AssetMark({ symbol, size = 32, uri }: AssetMarkProps) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const name = symbol.split(":").pop() ?? symbol;
  const logoUrl = uri ?? assetLogoUrl(symbol);
  const loaded = state === "loaded";

  useEffect(() => setState("loading"), [logoUrl]);

  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size / 2 }, loaded && styles.markLogo]}>
      {!loaded && <Text style={[styles.markText, { fontSize: size * 0.42 }]}>{name.slice(0, 1).toUpperCase()}</Text>}
      {logoUrl !== null && state !== "failed" && (
        <Image
          source={{ uri: logoUrl }}
          style={[styles.logo, { width: size, height: size, borderRadius: size / 2, opacity: loaded ? 1 : 0 }]}
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
        />
      )}
    </View>
  );
}

type LegStackProps = {
  symbols: string[];
  size?: number;
};

export function LegStack({ symbols, size = 26 }: LegStackProps) {
  return (
    <View style={styles.stack}>
      {symbols.slice(0, 4).map((symbol, index) => (
        <View
          key={symbol}
          style={[
            styles.stackItem,
            { marginLeft: index === 0 ? 0 : -size * 0.3, borderRadius: size / 2 + 2 },
          ]}
        >
          <AssetMark symbol={symbol} size={size} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    backgroundColor: dark.surfaceLine,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  markLogo: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e0d9",
  },
  markText: { fontFamily: family.semibold, color: "#fff" },
  logo: { position: "absolute", top: 0, left: 0 },
  stack: { flexDirection: "row" },
  stackItem: { borderWidth: 2, borderColor: dark.surface },
});
