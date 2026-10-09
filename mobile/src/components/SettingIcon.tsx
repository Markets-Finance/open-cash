import { StyleSheet, View } from "react-native";

export type SettingIconKind = "profile" | "wallet" | "history" | "lock" | "globe" | "exit";

const ink = "#14181a";

export function SettingIcon({ kind, cut }: { kind: SettingIconKind; cut: string }) {
  if (kind === "profile") {
    return (
      <View style={styles.box}>
        <View style={styles.head} />
        <View style={styles.shoulders} />
      </View>
    );
  }
  if (kind === "wallet") {
    return (
      <View style={styles.box}>
        <View style={styles.walletBack} />
        <View style={styles.wallet}>
          <View style={[styles.clasp, { backgroundColor: cut }]} />
        </View>
      </View>
    );
  }
  if (kind === "history") {
    return (
      <View style={styles.box}>
        <View style={styles.clock} />
        <View style={styles.handUp} />
        <View style={styles.handRight} />
      </View>
    );
  }
  if (kind === "lock") {
    return (
      <View style={styles.box}>
        <View style={styles.shackle} />
        <View style={styles.lockBody}>
          <View style={[styles.keyhole, { backgroundColor: cut }]} />
        </View>
      </View>
    );
  }
  if (kind === "globe") {
    return (
      <View style={styles.box}>
        <View style={styles.globe} />
        <View style={styles.meridian} />
        <View style={styles.equator} />
      </View>
    );
  }
  return (
    <View style={styles.box}>
      <View style={styles.bracket} />
      <View style={styles.arrowShaft} />
      <View style={styles.arrowHead} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  head: { position: "absolute", top: 1, width: 9, height: 9, borderRadius: 5, backgroundColor: ink },
  shoulders: { position: "absolute", bottom: 1, width: 18, height: 9, borderTopLeftRadius: 9, borderTopRightRadius: 9, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: ink },
  walletBack: { position: "absolute", top: 2, width: 14, height: 5, borderRadius: 2, backgroundColor: ink, opacity: 0.55 },
  wallet: { position: "absolute", bottom: 2, width: 20, height: 14, borderRadius: 4, backgroundColor: ink, alignItems: "flex-end", justifyContent: "center", paddingRight: 3 },
  clasp: { width: 5, height: 5, borderRadius: 3 },
  clock: { position: "absolute", width: 20, height: 20, borderRadius: 10, borderWidth: 2.5, borderColor: ink },
  handUp: { position: "absolute", top: 5, width: 2.5, height: 7, borderRadius: 1, backgroundColor: ink },
  handRight: { position: "absolute", left: 11, top: 11, width: 5, height: 2.5, borderRadius: 1, backgroundColor: ink },
  shackle: { position: "absolute", top: 1, width: 11, height: 11, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderWidth: 2.5, borderBottomWidth: 0, borderColor: ink },
  lockBody: { position: "absolute", bottom: 1, width: 18, height: 12, borderRadius: 4, backgroundColor: ink, alignItems: "center", justifyContent: "center" },
  keyhole: { width: 4, height: 4, borderRadius: 2 },
  globe: { position: "absolute", width: 20, height: 20, borderRadius: 10, borderWidth: 2.2, borderColor: ink },
  meridian: { position: "absolute", width: 8, height: 20, borderRadius: 4, borderWidth: 2, borderColor: ink },
  equator: { position: "absolute", width: 20, height: 2, backgroundColor: ink },
  bracket: { position: "absolute", left: 1, width: 10, height: 18, borderTopLeftRadius: 3, borderBottomLeftRadius: 3, borderWidth: 2.5, borderRightWidth: 0, borderColor: ink },
  arrowShaft: { position: "absolute", left: 8, width: 12, height: 2.5, borderRadius: 1, backgroundColor: ink },
  arrowHead: { position: "absolute", right: 1, width: 7, height: 7, borderTopWidth: 2.5, borderRightWidth: 2.5, borderColor: ink, transform: [{ rotate: "45deg" }] },
});
