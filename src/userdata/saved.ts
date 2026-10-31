// The Saved tab's lists (spec §5.3): user.db keeps entry ids only, so headwords come from canto.db.
import { getEntrySummaries, type EntrySummary } from "../db/searchQueries";
import type { Db } from "../db/types";
import { listFavorites } from "./favorites";
import { listHistory } from "./history";
import type { UserDb } from "./types";

export type SavedHistoryItem =
  | { id: number; kind: "lookup"; entry: EntrySummary }
  | { id: number; kind: "translation"; input: string; output: string };

export interface Saved {
  /** Newest first. */
  favorites: EntrySummary[];
  /** Newest first; id is the history row's. */
  history: SavedHistoryItem[];
}

/** Favorites and history, newest first. Entries canto.db no longer has (after a rebuild) are left out. */
export async function loadSaved(db: Db, userDb: UserDb): Promise<Saved> {
  const [favorites, history] = await Promise.all([listFavorites(userDb), listHistory(userDb)]);
  const lookupIds = history.flatMap((h) => (h.kind === "lookup" ? [h.entryId] : []));
  const entries = await getEntrySummaries(db, [...favorites.map((f) => f.entryId), ...lookupIds]);
  return {
    favorites: favorites.flatMap((f) => entries.get(f.entryId) ?? []),
    history: history.flatMap((h): SavedHistoryItem[] => {
      if (h.kind === "translation") return [{ id: h.id, kind: "translation", input: h.input, output: h.output }];
      const entry = entries.get(h.entryId);
      return entry ? [{ id: h.id, kind: "lookup", entry }] : [];
    }),
  };
}
