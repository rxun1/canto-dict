// Translate tab (spec §6): Mandarin in, Cantonese out with Jyutping, tagged 离线 / AI, read aloud on 🔊.
// Each translation is logged to history; Saved reopens one here with ?historyId=<row id>, restoring the
// stored input and output (no network call).
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect } from "react";
import { PlatformColor, Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { ROW_PADDING } from "../../src/components/EntryRow";
import { ReadAloud } from "../../src/components/ReadAloud";
import { TranslationResult } from "../../src/components/TranslationResult";
import { useDb } from "../../src/db/expoDb";
import { fromHistoryOutput } from "../../src/translate/historyOutput";
import { useTranslator } from "../../src/translate/useTranslator";
import { useUserDb } from "../../src/userdata/expoUserDb";
import { getHistoryItem } from "../../src/userdata/history";

const PLACEHOLDER = "输入普通话";
const TRANSLATE = "翻译";

export default function TranslateScreen() {
  const db = useDb();
  const userDb = useUserDb();
  const router = useRouter();
  const { historyId } = useLocalSearchParams<{ historyId?: string }>();
  const { input, setInput, result, error, run, restore } = useTranslator(db, userDb);

  // Reopens a translation from History, then clears the param so tapping the same row again reopens it again.
  useEffect(() => {
    if (historyId === undefined) return;
    getHistoryItem(userDb, Number(historyId)).then(
      (item) => {
        if (item?.kind === "translation") restore(item.input, fromHistoryOutput(item.output));
      },
      (e: unknown) => console.warn("Reopening a translation failed", e),
    );
    router.setParams({ historyId: undefined });
  }, [historyId, userDb, restore, router]);

  const openSettings = useCallback(() => router.navigate("/settings"), [router]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TextInput
        style={styles.input}
        value={input}
        onChangeText={setInput}
        placeholder={PLACEHOLDER}
        placeholderTextColor={PlatformColor("placeholderText")}
        multiline
        autoCorrect={false}
        spellCheck={false}
        accessibilityLabel={PLACEHOLDER}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={TRANSLATE}
        onPress={run}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.buttonText}>{TRANSLATE}</Text>
      </Pressable>
      {error !== null && <Text style={styles.error}>{error}</Text>}
      {result && (
        <>
          <TranslationResult result={result} onOpenSettings={openSettings} />
          <ReadAloud result={result} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
  content: { padding: ROW_PADDING, gap: 16 },
  input: {
    minHeight: 96,
    padding: 10,
    borderRadius: 10,
    fontSize: 17,
    textAlignVertical: "top",
    color: PlatformColor("label"),
    backgroundColor: PlatformColor("tertiarySystemFill"),
  },
  button: { alignSelf: "flex-end", paddingHorizontal: 20, paddingVertical: 8, borderRadius: 10, backgroundColor: PlatformColor("systemBlue") },
  buttonText: { fontSize: 17, fontWeight: "600", color: "white" },
  pressed: { opacity: 0.5 },
  error: { fontSize: 15, color: PlatformColor("systemRed") },
});
