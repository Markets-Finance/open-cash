import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { assetLogoSources } from "shared";
import { dark, family } from "../theme";

type AssetMarkProps = {
  symbol: string;
  size?: number;
  uri?: string;
};

const svgCache = new Map<string, Promise<string | null>>();

function loadSvg(url: string): Promise<string | null> {
  let pending = svgCache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then(async (response) => {
        const text = await response.text();
        return response.ok && text.trimStart().startsWith("<svg") ? text : null;
      })
      .catch(() => null);
    svgCache.set(url, pending);
  }
  return pending;
}

export function AssetMark({ symbol, size = 32, uri }: AssetMarkProps) {
  const sources = uri ? [uri] : assetLogoSources(symbol);
  const key = sources.join(" ");
  const [index, setIndex] = useState(0);
  const [svg, setSvg] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const name = symbol.split(":").pop() ?? symbol;
  const source = sources[index] ?? null;
  const isSvg = source?.endsWith(".svg") ?? false;

  useEffect(() => {
    setIndex(0);
    setSvg(null);
    setLoaded(false);
  }, [key]);

  useEffect(() => {
    if (source === null || !isSvg) return;
    let live = true;
    void loadSvg(source).then((xml) => {
      if (!live) return;
      if (xml === null) setIndex((i) => i + 1);
      else {
        setSvg(xml);
        setLoaded(true);
      }
    });
    return () => {
      live = false;
    };
  }, [source, isSvg]);

  const round = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View style={[styles.mark, round, loaded && !isSvg && styles.markLogo]}>
      {!loaded && <Text style={[styles.markText, { fontSize: size * 0.42 }]}>{name.slice(0, 1).toUpperCase()}</Text>}
      {isSvg && svg !== null && (
        <View style={[styles.logo, round]}>
          <SvgXml xml={svg} width={size} height={size} onError={() => { setLoaded(false); setSvg(null); setIndex((i) => i + 1); }} />
        </View>
      )}
      {source !== null && !isSvg && (
        <Image
          source={{ uri: source }}
          style={[styles.logo, round, { opacity: loaded ? 1 : 0 }]}
          onLoad={() => setLoaded(true)}
          onError={() => setIndex((i) => i + 1)}
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
