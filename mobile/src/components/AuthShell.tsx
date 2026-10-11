import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { family, space } from "../theme";
import { AnimatedMark } from "./AnimatedMark";
import { Mark } from "./Mark";

export type AuthMode = "signin" | "create" | "profile";

type AuthShellProps = {
  mode: AuthMode;
  dev: boolean;
  name: string;
  email: string;
  status: string;
  failed: boolean;
  onName: (value: string) => void;
  onEmail: (value: string) => void;
  onSwitch?: () => void;
  onSubmit: () => void;
  importOpen?: boolean;
  importAddress?: string;
  importKey?: string;
  onImportOpen?: (open: boolean) => void;
  onImportAddress?: (value: string) => void;
  onImportKey?: (value: string) => void;
};

const copy: Record<AuthMode, { title: string; hint: string; go: string }> = {
  signin: { title: "Sign in", hint: "Use your passkey.", go: "Sign in" },
  create: { title: "Create account", hint: "Two details label your passkey.", go: "Create" },
  profile: { title: "Your details", hint: "Saved only on this device.", go: "Save" },
};

const white = "#ffffff";
const line = "rgba(255, 255, 255, 0.14)";

export function AuthShell({ mode, dev, name, email, status, failed, onName, onEmail, onSwitch, onSubmit, importOpen = false, importAddress = "", importKey = "", onImportOpen, onImportAddress, onImportKey }: AuthShellProps) {
  const insets = useSafeAreaInsets();
  const draw = useRef(new Animated.Value(0)).current;
  const fields = mode !== "signin";
  const shown = failed || status.endsWith("…");

  useEffect(() => {
    Animated.timing(draw, { toValue: 1, duration: 1400, delay: 100, easing: Easing.bezier(0.6, 0, 0.2, 1), useNativeDriver: true }).start();
  }, []);

  return (
    <View style={styles.screen}>
      <View style={[styles.hero, { paddingTop: insets.top }]}>
        <Animated.View style={[styles.vertical, { transform: [{ scaleY: draw }] }]} />
        <Animated.View style={[styles.horizontal, { transform: [{ scaleX: draw }] }]} />
        <Animated.View style={[styles.diagonal, { opacity: draw, transform: [{ rotate: "40deg" }] }]} />
        <Animated.View style={[styles.diagonal, { opacity: draw, transform: [{ rotate: "-40deg" }] }]} />
        <View style={[styles.brand, { top: insets.top + space.md }]}>
          <Mark size={18} tint={white} />
          <Text style={styles.brandText}>
            open<Text style={styles.brandDim}>cash</Text>
          </Text>
        </View>
        <AnimatedMark size={140} color={white} startDelayMs={400} />
      </View>

      <View style={[styles.card, { paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.top}>
          {dev ? <Text style={styles.dev}>Dev mode</Text> : <View />}
          {onSwitch && (
            <Pressable onPress={onSwitch} hitSlop={12}>
              <Text style={styles.switch}>{mode === "create" ? "I have an account" : "Create an account"}</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.title}>{copy[mode].title}</Text>
        <Text style={styles.hint}>{copy[mode].hint}</Text>
        {fields && (
          <View style={styles.fields}>
            <View style={styles.field}>
              <Text style={styles.label}>Name</Text>
              <TextInput value={name} onChangeText={onName} placeholder="Ada Lovelace" placeholderTextColor="rgba(255,255,255,0.28)" autoComplete="name" style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                value={email}
                onChangeText={onEmail}
                placeholder="ada@example.com"
                placeholderTextColor="rgba(255,255,255,0.28)"
                autoComplete="email"
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
              />
            </View>
            {mode === "create" && onImportOpen && (
              <Pressable onPress={() => onImportOpen(!importOpen)} hitSlop={8}>
                <Text style={styles.switch}>{importOpen ? "− Skip wallet import" : "+ Have a wallet? Import it"}</Text>
              </Pressable>
            )}
            {mode === "create" && importOpen && (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>Wallet address</Text>
                  <TextInput value={importAddress} onChangeText={onImportAddress} placeholder="0x…" placeholderTextColor="rgba(255,255,255,0.28)" autoCapitalize="none" autoCorrect={false} style={styles.input} />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Private key</Text>
                  <TextInput value={importKey} onChangeText={onImportKey} placeholder="0x… (64 hex characters)" placeholderTextColor="rgba(255,255,255,0.28)" secureTextEntry autoCapitalize="none" autoCorrect={false} style={styles.input} />
                </View>
              </>
            )}
          </View>
        )}
        {mode === "signin" && onImportOpen && (
          <Pressable onPress={() => onImportOpen(true)} hitSlop={8}>
            <Text style={styles.switch}>Have a wallet? Import it</Text>
          </Pressable>
        )}
        <View style={styles.footer}>
          <Text style={[styles.status, failed && styles.statusFailed]} numberOfLines={3}>
            {shown ? status : ""}
          </Text>
          <Pressable onPress={onSubmit} accessibilityRole="button" style={({ pressed }) => [styles.go, pressed && styles.pressed]}>
            <Text style={styles.goLabel}>{copy[mode].go}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" },
  hero: { flex: 0.8, minHeight: 0, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  vertical: { position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, backgroundColor: line },
  horizontal: { position: "absolute", left: 0, right: 0, top: "50%", height: 1, backgroundColor: line },
  diagonal: { position: "absolute", left: "50%", top: "50%", width: 1400, height: 1, marginLeft: -700, backgroundColor: "rgba(255, 255, 255, 0.07)" },
  brand: { position: "absolute", left: space.lg, flexDirection: "row", alignItems: "center", gap: 6 },
  brandText: { fontFamily: family.semibold, fontSize: 20, letterSpacing: -0.8, color: white },
  brandDim: { fontFamily: family.regular, color: "rgba(255, 255, 255, 0.55)" },
  card: { flex: 1.2, backgroundColor: "#121212", borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.sm, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 24 },
  dev: { fontFamily: family.medium, fontSize: 11, letterSpacing: 0.6, color: "#d9d4ff", backgroundColor: "rgba(123, 115, 240, 0.25)", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: "hidden" },
  switch: { fontFamily: family.regular, fontSize: 13, color: "rgba(255, 255, 255, 0.7)" },
  title: { fontFamily: family.light, fontSize: 48, lineHeight: 52, letterSpacing: -2.2, color: white, marginTop: space.md },
  hint: { fontFamily: family.regular, fontSize: 15, color: "rgba(255, 255, 255, 0.55)" },
  fields: { gap: space.md, marginTop: space.sm },
  field: { gap: 4 },
  label: { fontFamily: family.regular, fontSize: 11, color: "rgba(255, 255, 255, 0.55)" },
  input: { fontFamily: family.regular, fontSize: 18, color: white, paddingVertical: 8, paddingHorizontal: 0, borderBottomWidth: 1, borderBottomColor: "rgba(255, 255, 255, 0.28)" },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, marginTop: space.md },
  status: { flex: 1, fontFamily: family.regular, fontSize: 13, color: "rgba(255, 255, 255, 0.6)" },
  statusFailed: { color: "#ec6f5c" },
  go: { width: 84, height: 84, borderRadius: 42, backgroundColor: white, alignItems: "center", justifyContent: "center" },
  goLabel: { fontFamily: family.semibold, fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase", color: "#000000" },
  pressed: { opacity: 0.8 },
});
