// Loads an entry for the entry screen (spec §5.2): the entry, its Mandarin line and, for a word,
// each of its characters with the char entry it links to.
import { useEffect, useState } from "react";
import { findCharEntries, getEntry, type Entry } from "../db/entries";
import type { Db } from "../db/types";
import { HAN } from "./classify";
import { mandarinLine, type MandarinLine } from "./mandarinLine";

/** One character of a word: shown simplified; `id` is its own entry, or null when it has none. */
export interface WordChar {
  trad: string;
  simp: string;
  id: number | null;
}

export type EntryState =
  | { status: "loading" }
  | { status: "missing" }
  /** The DB query failed (logged with console.warn). */
  | { status: "error" }
  | { status: "ready"; entry: Entry; mandarin: MandarinLine | null; chars: WordChar[] };

/**
 * A word's Han characters with their char entries (non-Han ones, as in gym房, are skipped). A
 * character is shown as its entry's simplified form, else as the word's simplified character at the
 * same position when the two spellings have the same length.
 */
async function wordChars(db: Db, entry: Entry): Promise<WordChar[]> {
  if (entry.kind !== "word") return [];
  const trad = Array.from(entry.trad);
  const simp = Array.from(entry.simp);
  const found = await findCharEntries(db, trad.filter((c) => HAN.test(c)));
  return trad.flatMap((c, i) => {
    if (!HAN.test(c)) return [];
    const own = found.get(c);
    const fallback = simp.length === trad.length ? simp[i] : c;
    return [{ trad: c, simp: own?.simp ?? fallback, id: own?.id ?? null }];
  });
}

/** The entry with this id; a load started for an id the screen has since left is dropped. */
export function useEntry(db: Db, id: number): EntryState {
  const [state, setState] = useState<EntryState>({ status: "loading" });

  useEffect(() => {
    let stale = false;
    setState({ status: "loading" });
    (async () => {
      const entry = Number.isInteger(id) ? await getEntry(db, id) : null;
      if (entry === null) return { status: "missing" } as const;
      return { status: "ready", entry, mandarin: mandarinLine(entry), chars: await wordChars(db, entry) } as const;
    })().then(
      (next) => {
        if (!stale) setState(next);
      },
      (error: unknown) => {
        console.warn("Loading entry failed", error);
        if (!stale) setState({ status: "error" });
      },
    );
    return () => {
      stale = true;
    };
  }, [db, id]);

  return state;
}
