import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { dark, family, space } from "../theme";

type LineChartProps = {
  values: number[];
  height: number;
  color: string;
  label: (index: number) => string;
  lines?: { price: number; title: string; color: string; dashed?: boolean }[];
};

const tipWidth = 168;

export function LineChart({ values, height, color, label, lines = [] }: LineChartProps) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const reach = (high - low) / 2 + ((high + low) / 2) * 0.05;
  const shown = lines.filter((l) => Math.abs(l.price - (high + low) / 2) <= reach);
  const all = [...values, ...shown.map((l) => l.price)];
  const min = Math.min(...all);
  const spread = Math.max(...all) - min || 1;
  const xs = values.map((_, i) => (i / (values.length - 1)) * width);
  const ys = values.map((v) => space.sm + (1 - (v - min) / spread) * (height - space.sm * 2));

  const yFor = (price: number) => space.sm + (1 - (price - min) / spread) * (height - space.sm * 2);

  function scrub(x: number) {
    if (width === 0) return;
    setActive(Math.round(Math.min(1, Math.max(0, x / width)) * (values.length - 1)));
  }

  return (
    <View
      style={{ height }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => scrub(event.nativeEvent.locationX)}
      onResponderMove={(event) => scrub(event.nativeEvent.locationX)}
      onResponderRelease={() => setActive(null)}
    >
      {width > 0 &&
        xs.slice(1).map((x, i) => {
          const dx = x - xs[i];
          const dy = ys[i + 1] - ys[i];
          const length = Math.hypot(dx, dy);
          return (
            <View
              key={i}
              pointerEvents="none"
              style={[
                styles.segment,
                {
                  backgroundColor: color,
                  width: length,
                  left: (xs[i] + x) / 2 - length / 2,
                  top: (ys[i] + ys[i + 1]) / 2 - 1,
                  transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
                },
              ]}
            />
          );
        })}
      {width > 0 &&
        shown.map((line) => (
          <View key={line.title} pointerEvents="none" style={[styles.refLine, { top: yFor(line.price), borderTopColor: line.color, borderStyle: line.dashed ? "dashed" : "solid" }]}>
            <Text style={[styles.refText, { color: line.color }]} numberOfLines={1}>
              {line.title}
            </Text>
          </View>
        ))}
      {active !== null && width > 0 && (
        <>
          <View pointerEvents="none" style={[styles.cross, { left: xs[active] }]} />
          <View
            pointerEvents="none"
            style={[styles.dot, { left: xs[active] - 6, top: ys[active] - 6, borderColor: color }]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.tip,
              { left: Math.min(width - tipWidth, Math.max(0, xs[active] - tipWidth / 2)) },
            ]}
          >
            <Text style={styles.tipText}>{label(active)}</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  refLine: { position: "absolute", left: 0, right: 0, height: 0, borderTopWidth: 1 },
  refText: { position: "absolute", right: 0, top: -14, fontFamily: family.medium, fontSize: 10 },
  segment: { position: "absolute", height: 2, borderRadius: 1 },
  cross: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: dark.line },
  dot: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    backgroundColor: dark.paper,
  },
  tip: {
    position: "absolute",
    top: 0,
    width: tipWidth,
    paddingVertical: space.xs,
    borderRadius: space.sm,
    borderWidth: 1,
    borderColor: dark.line,
    backgroundColor: dark.surfaceHover,
  },
  tipText: { fontFamily: family.medium, fontSize: 11, color: dark.ink, textAlign: "center" },
});
