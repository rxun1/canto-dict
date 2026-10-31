// Saved tab (spec §5.3): Favorites | History segments over user.db, newest first; a row opens its
// entry. History (capped at 500 rows by user.db) has a Clear button. Reloads whenever the tab is
// focused, so favorites and history added on an entry screen show up.
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { FlatList, PlatformColor, Pressable, StyleSheet, Text, View } from "react-native";
import { EntryRow, ROW_PADDING, RowSeparator } from "../../src/components/EntryRow";
import { useDb } from "../../src/db/expoDb";
import type { EntrySummary } from "../../src/db/searchQueries";
import { useUserDb } from "../../src/userdata/expoUserDb";
import { clearHistory } from "../../src/userdata/history";
import { loadSaved, type Saved, type SavedHistoryItem } from "../../src/userdata/saved";

type Segment = "favorites" | "history";

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "favorites", label: "收藏" },
  { key: "history", label: "历史" },
];
const EMPTY: Record<Segment, string> = { favorites: "还没有收藏", history: "还没有历史记录" };
const CLEAR = "清除";
const LOAD_FAILED = "加载失败";

export default function SavedScreen() {
  const db = useDb();
  const userDb = useUserDb();
  const router = useRouter();
  const [segment, setSegment] = useState<Segment>("favorites");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [failed, setFailed] = useState(false);
  // Bumped by each load and by Clear, so a load that started earlier can't put cleared rows back.
  const generation = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const mine = ++generation.current;
      loadSaved(db, userDb).then(
        (next) => {
          if (generation.current !== mine) return;
          setSaved(next);
          setFailed(false);
        },
        (error: unknown) => {
          console.warn("Loading saved failed", error);
          if (generation.current === mine) setFailed(true);
        },
      );
    }, [db, userDb]),
  );

  const clear = useCallback(() => {
    generation.current++;
    clearHistory(userDb).then(
      () => setSaved((s) => s && { ...s, history: [] }),
      (error: unknown) => console.warn("Clearing history failed", error),
    );
  }, [userDb]);

  const openEntry = useCallback((id: number) => router.push({ pathname: "/entry/[id]", params: { id: String(id) } }), [router]);
  const renderFavorite = useCallback(({ item }: { item: EntrySummary }) => <EntryRow entry={item} onPress={openEntry} />, [openEntry]);
  const renderHistory = useCallback(({ item }: { item: SavedHistoryItem }) => <HistoryRow item={item} onPress={openEntry} />, [openEntry]);

  const empty = failed ? (
    <Text style={styles.empty}>{LOAD_FAILED}</Text>
  ) : saved === null ? undefined : (
    <Text style={styles.empty}>{EMPTY[segment]}</Text>
  );
  return (
    <View style={styles.screen}>
      <View style={styles.bar}>
        <View style={styles.segments} accessibilityRole="tablist">
          {SEGMENTS.map(({ key, label }) => (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: segment === key }}
              onPress={() => setSegment(key)}
              style={[styles.segment, segment === key && styles.segmentSelected]}
            >
              <Text style={styles.segmentText}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {segment === "history" && saved !== null && saved.history.length > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel={CLEAR} hitSlop={8} onPress={clear} style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.clear}>{CLEAR}</Text>
          </Pressable>
        )}
      </View>
      {segment === "favorites" ? (
        <FlatList
          testID="saved-list"
          data={saved?.favorites ?? []}
          keyExtractor={favoriteKey}
          renderItem={renderFavorite}
          ItemSeparatorComponent={RowSeparator}
          ListEmptyComponent={empty}
        />
      ) : (
        <FlatList
          testID="saved-list"
          data={saved?.history ?? []}
          keyExtractor={historyKey}
          renderItem={renderHistory}
          ItemSeparatorComponent={RowSeparator}
          ListEmptyComponent={empty}
        />
      )}
    </View>
  );
}

const favoriteKey = (entry: EntrySummary) => String(entry.id);
const historyKey = (item: SavedHistoryItem) => String(item.id);

/** A lookup opens its entry. A translation is shown, input over output. */
function HistoryRow({ item, onPress }: { item: SavedHistoryItem; onPress: (id: number) => void }) {
  return (
    <View testID={`history-${item.id}`}>
      {item.kind === "lookup" ? (
        <EntryRow entry={item.entry} onPress={onPress} />
      ) : (
        // TODO(Plan 3): tapping reopens it on the Translate tab (spec §5.3); Translate isn't built yet.
        <View style={styles.translation}>
          <Text style={styles.translationInput} numberOfLines={1}>
            {item.input}
          </Text>
          <Text style={styles.translationOutput} numberOfLines={1}>
            {item.output}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
  bar: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: ROW_PADDING, marginVertical: 8 },
  segments: { flex: 1, flexDirection: "row", padding: 2, borderRadius: 9, backgroundColor: PlatformColor("tertiarySystemFill") },
  segment: { flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 7 },
  segmentSelected: { backgroundColor: PlatformColor("systemBackground") },
  segmentText: { fontSize: 15, color: PlatformColor("label") },
  clear: { fontSize: 17, color: PlatformColor("link") },
  pressed: { opacity: 0.5 },
  empty: { marginTop: 32, textAlign: "center", fontSize: 17, color: PlatformColor("secondaryLabel") },
  translation: { paddingHorizontal: ROW_PADDING, paddingVertical: 10, gap: 2 },
  translationInput: { fontSize: 15, color: PlatformColor("secondaryLabel") },
  translationOutput: { fontSize: 20, color: PlatformColor("label") },
});
