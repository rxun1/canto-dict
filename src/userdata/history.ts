import type { UserDb } from "./types";

/** What to record: an entry the user opened, or a translation they ran. */
export type HistoryInput =
  | { kind: "lookup"; entryId: number }
  | { kind: "translation"; input: string; output: string };

/** A history row; at is epoch milliseconds. */
export type HistoryItem = HistoryInput & { id: number; at: number };

// The schema's CHECKs guarantee the columns each kind needs are non-null.
interface HistoryRow {
  id: number;
  kind: "lookup" | "translation";
  entry_id: number | null;
  input: string | null;
  output: string | null;
  at: number;
}

/** Records an item (`now` is stored as at); the schema's trigger then drops rows beyond HISTORY_LIMIT, oldest first. */
export async function addHistory(db: UserDb, item: HistoryInput, now: number = Date.now()): Promise<void> {
  const [entryId, input, output] = item.kind === "lookup" ? [item.entryId, null, null] : [null, item.input, item.output];
  await db.run("INSERT INTO history (kind, entry_id, input, output, at) VALUES (?, ?, ?, ?, ?)", [item.kind, entryId, input, output, now]);
}

/** All history, newest first (by id, see schema.ts). */
export async function listHistory(db: UserDb): Promise<HistoryItem[]> {
  const rows = await db.all<HistoryRow>("SELECT id, kind, entry_id, input, output, at FROM history ORDER BY id DESC");
  return rows.map(toItem);
}

/** One history row by id (a translation reopened from History), or null when it is gone (cleared, capped). */
export async function getHistoryItem(db: UserDb, id: number): Promise<HistoryItem | null> {
  const row = await db.first<HistoryRow>("SELECT id, kind, entry_id, input, output, at FROM history WHERE id = ?", [id]);
  return row && toItem(row);
}

function toItem(r: HistoryRow): HistoryItem {
  return r.kind === "lookup"
    ? { id: r.id, kind: "lookup", entryId: r.entry_id!, at: r.at }
    : { id: r.id, kind: "translation", input: r.input!, output: r.output!, at: r.at };
}

/** Deletes all history. */
export async function clearHistory(db: UserDb): Promise<void> {
  await db.run("DELETE FROM history");
}
