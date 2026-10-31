// An entry as a list row (Lookup results, Saved): headword, traditional when it differs, a reading,
// then a one-line gloss. Tapping it calls onPress with the entry id.
import { memo } from "react";
import { PlatformColor, Pressable, StyleSheet, Text, View } from "react-native";
import type { EntrySummary } from "../db/searchQueries";
import { YUE_GLOSS_LABEL } from "../dictionary/mandarinLine";

export const ROW_PADDING = 16;

export const EntryRow = memo(function EntryRow({ entry, onPress }: { entry: EntrySummary; onPress: (id: number) => void }) {
  const { id, trad, simp, jyutping, gloss } = entry;
  return (
    <Pressable onPress={() => onPress(id)} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.headline}>
        <Text style={styles.simp}>{simp}</Text>
        {trad !== simp && <Text style={styles.trad}>{trad}</Text>}
        {jyutping !== null && <Text style={styles.jyutping}>{jyutping}</Text>}
      </View>
      {gloss !== null && (
        <Text style={styles.gloss} numberOfLines={1}>
          {gloss.source === "yue" && <Text style={styles.glossLabel}>{YUE_GLOSS_LABEL} </Text>}
          {gloss.simp}
        </Text>
      )}
    </Pressable>
  );
});

/** A hairline between rows, for FlatList's ItemSeparatorComponent. */
export const RowSeparator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  row: { paddingHorizontal: ROW_PADDING, paddingVertical: 10, backgroundColor: PlatformColor("systemBackground") },
  rowPressed: { backgroundColor: PlatformColor("systemGray5") },
  headline: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  simp: { fontSize: 22, color: PlatformColor("label") },
  trad: { fontSize: 15, color: PlatformColor("secondaryLabel") },
  jyutping: { fontSize: 15, color: PlatformColor("secondaryLabel") },
  gloss: { marginTop: 2, fontSize: 15, color: PlatformColor("label") },
  glossLabel: { color: PlatformColor("tertiaryLabel") },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: ROW_PADDING, backgroundColor: PlatformColor("separator") },
});
