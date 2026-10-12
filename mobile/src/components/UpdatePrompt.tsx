import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { checkForUpdate, installedVersion, type AppUpdate } from "../lib/updates";
import { dark, family, space } from "../theme";

const recheckMs = 6 * 60 * 60 * 1000;

export function UpdatePrompt() {
  const [update, setUpdate] = useState<AppUpdate | null>(null);
  const dismissed = useRef<string | null>(null);
  const lastCheck = useRef(0);

  useEffect(() => {
    function check() {
      if (Date.now() - lastCheck.current < recheckMs) return;
      lastCheck.current = Date.now();
      checkForUpdate()
        .then((found) => {
          if (found && found.version !== dismissed.current) setUpdate(found);
        })
        .catch(() => {
          lastCheck.current = 0;
        });
    }
    check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => subscription.remove();
  }, []);

  if (update === null) return null;

  function later() {
    dismissed.current = update?.version ?? null;
    setUpdate(null);
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={later}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Text style={styles.title}>Update available</Text>
          <Text style={styles.body}>
            Version {update.version} is ready. You have {installedVersion}. It downloads the new app, then Android asks you to install it. Your account and data stay.
          </Text>
          {update.notes !== "" && (
            <ScrollView style={styles.notes}>
              <Text style={styles.notesText}>{update.notes}</Text>
            </ScrollView>
          )}
          <Pressable
            onPress={() => void Linking.openURL(update.apkUrl).catch(() => Linking.openURL(update.pageUrl))}
            accessibilityRole="button"
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.primaryLabel}>Download update</Text>
          </Pressable>
          <Pressable onPress={later} accessibilityRole="button" style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            <Text style={styles.secondaryLabel}>Later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: dark.scrim, justifyContent: "flex-end", padding: space.md },
  card: { gap: space.sm, padding: space.lg, borderRadius: 28, backgroundColor: dark.surface, borderWidth: 1, borderColor: dark.surfaceLine },
  title: { fontFamily: family.semibold, fontSize: 22, color: dark.ink },
  body: { fontFamily: family.regular, fontSize: 14, lineHeight: 20, color: dark.muted },
  notes: { maxHeight: 160, padding: space.md, borderRadius: 16, backgroundColor: dark.paper },
  notesText: { fontFamily: family.regular, fontSize: 13, lineHeight: 19, color: dark.ink },
  primary: { height: 56, borderRadius: 28, backgroundColor: dark.ink, alignItems: "center", justifyContent: "center", marginTop: space.sm },
  primaryLabel: { fontFamily: family.semibold, fontSize: 16, color: dark.paper },
  secondary: { height: 56, borderRadius: 28, borderWidth: 1, borderColor: dark.line, alignItems: "center", justifyContent: "center" },
  secondaryLabel: { fontFamily: family.semibold, fontSize: 16, color: dark.ink },
  pressed: { opacity: 0.8 },
});
