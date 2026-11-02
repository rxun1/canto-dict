// Lookup tab (spec §5.1): a search field over a list of ranked entries; a row opens its entry.
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useState } from "react";
import { FlatList, PlatformColor, StyleSheet, Text, TextInput, View } from "react-native";
import { EntryRow, ROW_PADDING, RowSeparator } from "../../src/components/EntryRow";
import { useDb } from "../../src/db/expoDb";
import type { SearchResult } from "../../src/dictionary/search";
import { useSearch } from "../../src/dictionary/useSearch";

const HINT = "输入汉字或粤拼";

export default function LookupScreen() {
  const db = useDb();
  const router = useRouter();
  const [text, setText] = useState("");
  const { hint, results } = useSearch(db, text);

  const openEntry = useCallback((id: number) => router.push({ pathname: "/entry/[id]", params: { id: String(id) } }), [router]);
  const renderItem = useCallback(({ item }: { item: SearchResult }) => <EntryRow entry={item} onPress={openEntry} />, [openEntry]);

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
          ItemSeparatorComponent={RowSeparator}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
    </View>
  );
}

const keyOf = (result: SearchResult) => String(result.id);

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
});
