import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { dark, family, space } from "../theme";
import { tone } from "./ui";

type LeverageSliderProps = {
  value: number;
  max: number;
  onChange: (value: number) => void;
};

const thumb = 30;
const trackHeight = 8;

export function riskColor(value: number, max: number): string {
  const ratio = max > 1 ? (value - 1) / (max - 1) : 0;
  return ratio < 0.34 ? tone.lime : ratio < 0.67 ? tone.butter : tone.coral;
}

export function LeverageSlider({ value, max, onChange }: LeverageSliderProps) {
  const [width, setWidth] = useState(0);
  const span = Math.max(1, width - thumb);
  const ratio = max > 1 ? (Math.min(value, max) - 1) / (max - 1) : 1;
  const color = riskColor(value, max);
  const marks = [...new Set([1, Math.round(max / 3), Math.round((max * 2) / 3), max])].filter((mark) => mark >= 1);

  function slide(x: number) {
    if (width === 0 || max <= 1) return;
    const next = Math.min(1, Math.max(0, (x - thumb / 2) / span));
    const step = Math.round(1 + next * (max - 1));
    if (step !== value) onChange(step);
  }

  return (
    <View style={styles.wrap}>
      <View
        style={styles.touch}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(event) => slide(event.nativeEvent.locationX)}
        onResponderMove={(event) => slide(event.nativeEvent.locationX)}
      >
        <View pointerEvents="none" style={styles.track}>
          <View style={[styles.fill, { width: thumb / 2 + ratio * span, backgroundColor: color }]} />
        </View>
        <View pointerEvents="none" style={[styles.thumb, { left: ratio * span, borderColor: color }]} />
      </View>
      <View style={styles.marks}>
        {marks.map((mark) => (
          <Pressable key={mark} onPress={() => onChange(mark)} hitSlop={8}>
            <Text style={[styles.mark, mark === value && styles.markOn]}>{mark}x</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  touch: { height: 44, justifyContent: "center" },
  track: { height: trackHeight, borderRadius: trackHeight / 2, backgroundColor: tone.card, overflow: "hidden" },
  fill: { height: trackHeight },
  thumb: { position: "absolute", top: 7, width: thumb, height: thumb, borderRadius: thumb / 2, borderWidth: 5, backgroundColor: tone.paper },
  marks: { flexDirection: "row", justifyContent: "space-between" },
  mark: { fontFamily: family.regular, fontSize: 12, color: dark.muted },
  markOn: { fontFamily: family.semibold, color: dark.ink },
});
