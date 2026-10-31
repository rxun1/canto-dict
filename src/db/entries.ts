// Entry lookups over canto.db (schema: data-pipeline/src/build/schema.sql). Child rows are read in
// rowid order, which is the order the pipeline inserted them (reading priority, sense order).
import type { Db } from "./types";

/** rime's rank for a character reading; "variant" for another source's reading rime covers. */
export type ReadingRank = "default" | "common" | "rare" | "obsolete" | "variant";

export interface Alias {
  trad: string;
  simp: string;
}

export interface Reading {
  /** Space-separated syllables, e.g. "hok6 haau6". Loan syllables may not be Jyutping. */
  jyutping: string;
  /** Null for a word, or a character reading rime doesn't cover. */
  rank: ReadingRank | null;
  source: string;
  /** 0-based indexes of loan syllables (no audio clip for them); empty when there are none. */
  loan: number[];
}

export interface MandarinItem {
  trad: string;
  simp: string;
  /** In source priority order. */
  sources: string[];
}

/** One sense: words.hk fills yue, MoE fills zho. */
export interface Definition {
  /** 1-based, per entry and per source. */
  sense: number;
  pos: string | null;
  yue: string | null;
  yueSimp: string | null;
  zho: string | null;
  zhoSimp: string | null;
  source: string;
}

export interface Example {
  /** The words.hk definition sense it belongs to. */
  sense: number;
  yueTrad: string;
  yueSimp: string;
  jyutping: string | null;
  /** 0-based indexes of loan syllables in jyutping; empty when there are none. */
  loan: number[];
  zho: string | null;
  zhoSimp: string | null;
  source: string;
}

export interface Entry {
  id: number;
  trad: string;
  simp: string;
  kind: "char" | "word";
  /** log10(1 + weight) from rime's frequency list; 0 when unknown. */
  freq: number;
  /** Other spellings folded into the entry. */
  aliases: Alias[];
  readings: Reading[];
  mandarin: MandarinItem[];
  definitions: Definition[];
  examples: Example[];
}

/** A comma-separated column (loan indexes, mandarin sources) as a list; NULL or "" is empty. */
const splitList = (value: string | null): string[] => (value ? value.split(",") : []);
const loanIndexes = (value: string | null): number[] => splitList(value).map(Number);

type EntryRow = Pick<Entry, "id" | "trad" | "simp" | "kind" | "freq">;
type ReadingRow = { jyutping: string; rank: ReadingRank | null; source: string; loan: string | null };
type MandarinRow = { trad: string; simp: string; sources: string };
type ExampleRow = Omit<Example, "loan"> & { loan: string | null };

/** The entry with this id and all its child rows, or null when there is none. */
export async function getEntry(db: Db, id: number): Promise<Entry | null> {
  const entry = await db.first<EntryRow>("SELECT id, trad, simp, kind, freq FROM entries WHERE id = ?", [id]);
  if (entry === null) return null;
  const [aliases, readings, mandarin, definitions, examples] = await Promise.all([
    db.all<Alias>("SELECT trad, simp FROM aliases WHERE entry_id = ? ORDER BY rowid", [id]),
    db.all<ReadingRow>("SELECT jyutping, rank, source, loan FROM readings WHERE entry_id = ? ORDER BY rowid", [id]),
    db.all<MandarinRow>("SELECT word_trad AS trad, word_simp AS simp, sources FROM mandarin WHERE entry_id = ? ORDER BY rowid", [id]),
    db.all<Definition>(
      `SELECT sense, pos, yue, yue_simp AS yueSimp, zho, zho_simp AS zhoSimp, source
       FROM definitions WHERE entry_id = ? ORDER BY rowid`,
      [id],
    ),
    db.all<ExampleRow>(
      `SELECT sense, yue_trad AS yueTrad, yue_simp AS yueSimp, jyutping, loan, zho, zho_simp AS zhoSimp, source
       FROM examples WHERE entry_id = ? ORDER BY rowid`,
      [id],
    ),
  ]);
  return {
    ...entry,
    aliases,
    readings: readings.map((r) => ({ ...r, loan: loanIndexes(r.loan) })),
    mandarin: mandarin.map((m) => ({ ...m, sources: splitList(m.sources) })),
    definitions,
    examples: examples.map((x) => ({ ...x, loan: loanIndexes(x.loan) })),
  };
}
