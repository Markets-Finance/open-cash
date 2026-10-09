import { useMemo } from "react";
import { View } from "react-native";
import qrcode from "qrcode-generator";

export function QrCode({ value, size = 188 }: { value: string; size?: number }) {
  const rows = useMemo(() => {
    const code = qrcode(0, "M");
    code.addData(value);
    code.make();
    const count = code.getModuleCount();
    return Array.from({ length: count }, (_, row) => Array.from({ length: count }, (_, col) => code.isDark(row, col)));
  }, [value]);

  const cell = size / rows.length;
  return (
    <View accessibilityLabel="QR code of your address" style={{ width: size, height: size, backgroundColor: "#ffffff", padding: 0 }}>
      {rows.map((cols, row) => (
        <View key={row} style={{ flexDirection: "row", height: cell }}>
          {cols.map((dark, col) => (
            <View key={col} style={{ width: cell, height: cell, backgroundColor: dark ? "#14181a" : "#ffffff" }} />
          ))}
        </View>
      ))}
    </View>
  );
}
