// A translation (spec §6.1): the Cantonese (simplified) with each character's Jyutping under it, the
// 离线 / AI tag, and a note when the online step didn't replace the offline result (spec §7).
import { PlatformColor, StyleSheet, Text, View } from "react-native";
import type { Translation } from "../translate";
import { tagStyle } from "./tagStyle";

const SOURCE_TAGS: Readonly<Record<Translation["source"], string>> = { offline: "离线", online: "AI" };
const SETTINGS_LINK = "去设置";

export function TranslationResult({ result, onOpenSettings }: { result: Translation; onOpenSettings: () => void }) {
  const { cantonese, jyutping, source, note } = result;
  const keyProblem = note?.kind === "noKey" || note?.kind === "invalidKey";
  return (
    <View style={styles.result}>
      <View style={styles.chars}>
        {Array.from(cantonese).map((char, i) => (
          <View key={i} style={styles.cell} testID={`char-${i}`}>
            <Text style={styles.char}>{char}</Text>
            {jyutping[i] != null && <Text style={styles.jyutping}>{jyutping[i]}</Text>}
          </View>
        ))}
      </View>
      <View style={styles.meta}>
        <Text style={styles.tag}>{SOURCE_TAGS[source]}</Text>
        {note && <Text style={styles.note}>{note.message}</Text>}
        {keyProblem && (
          <Text accessibilityRole="link" accessibilityLabel={SETTINGS_LINK} onPress={onOpenSettings} style={styles.link}>
            {SETTINGS_LINK}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  result: { gap: 10 },
  chars: { flexDirection: "row", flexWrap: "wrap", rowGap: 8 },
  cell: { alignItems: "center", minWidth: 28, paddingHorizontal: 1 },
  char: { fontSize: 28, color: PlatformColor("label") },
  jyutping: { fontSize: 12, color: PlatformColor("secondaryLabel") },
  meta: { flexDirection: "row", alignItems: "center", gap: 8 },
  tag: tagStyle,
  note: { flexShrink: 1, fontSize: 14, color: PlatformColor("secondaryLabel") },
  link: { fontSize: 14, color: PlatformColor("link") },
});
