import type { UserDb } from "./types";

/** A favorited entry; addedAt is epoch milliseconds. */
export interface Favorite {
  entryId: number;
  addedAt: number;
}

/** Whether the entry is a favorite. */
export async function isFavorite(db: UserDb, entryId: number): Promise<boolean> {
  return (await db.first("SELECT 1 FROM favorites WHERE entry_id = ?", [entryId])) !== null;
}

/** Adds the entry to favorites, or removes it if already there; returns whether it is now a favorite. */
export async function toggleFavorite(db: UserDb, entryId: number, now: number = Date.now()): Promise<boolean> {
  if (await isFavorite(db, entryId)) {
    await db.run("DELETE FROM favorites WHERE entry_id = ?", [entryId]);
    return false;
  }
  await db.run("INSERT OR IGNORE INTO favorites (entry_id, added_at) VALUES (?, ?)", [entryId, now]);
  return true;
}

/** All favorites, newest first (ties: the higher entry id first; entry_id is the rowid). */
export function listFavorites(db: UserDb): Promise<Favorite[]> {
  return db.all<Favorite>("SELECT entry_id AS entryId, added_at AS addedAt FROM favorites ORDER BY added_at DESC, entry_id DESC");
}
