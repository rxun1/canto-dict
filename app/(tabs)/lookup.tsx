// Lookup tab (spec §5.1): a search field over a list of ranked entries; a row opens its entry.
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { memo, useCallback, useState } from "react";
import { FlatList, PlatformColor, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useDb } from "../../src/db/expoDb";
import { YUE_GLOSS_LABEL } from "../../src/dictionary/mandarinLine";
import type { SearchResult } from "../../src/dictionary/search";
import { useSearch } from "../../src/dictionary/useSearch";

const HINT = "输入汉字或粤拼";

export default function LookupScreen() {
  const db = useDb();
  const router = useRouter();
  const [text, setText] = useState("");
  const { hint, results } = useSearch(db, text);

  const openEntry = useCallback((id: number) => router.push({ pathname: "/entry/[id]", params: { id: String(id) } }), [router]);
  const renderItem = useCallback(({ item }: { item: SearchResult }) => <ResultRow result={item} onPress={openEntry} />, [openEntry]);

  return (
    <View style={styles.screen}>
      <View style={styles.searchField}>
        <SymbolView name="magnifyingglass" tintColor={PlatformColor("secondaryLabel")} size={17} />
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="汉字或粤拼"
          placeholderTextColor={PlatformColor("placeholderText")}
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          accessibilityLabel="查字"
        />
      </View>
      {hint ? (
        <Text style={styles.hint}>{HINT}</Text>
      ) : (
        <FlatList
          data={results}
          keyExtractor={keyOf}
          renderItem={renderItem}
          ItemSeparatorComponent={Separator}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
    </View>
  );
}

const keyOf = (result: SearchResult) => String(result.id);

const Separator = () => <View style={styles.separator} />;

const ResultRow = memo(function ResultRow({ result, onPress }: { result: SearchResult; onPress: (id: number) => void }) {
  const { id, trad, simp, jyutping, gloss } = result;
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

const ROW_PADDING = 16;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: ROW_PADDING,
    marginVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: PlatformColor("tertiarySystemFill"),
  },
  input: { flex: 1, paddingVertical: 8, fontSize: 17, color: PlatformColor("label") },
  hint: { marginTop: 32, textAlign: "center", fontSize: 17, color: PlatformColor("secondaryLabel") },
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
