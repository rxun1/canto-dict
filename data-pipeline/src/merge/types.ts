// The merged entry model: one Entry per normalized headword key, shaped like canto.db (spec §4.3).
// P1-T14 writes these to SQLite; nothing here knows about SQL.
import type {
  CharReading,
  DialSynPair,
  KfcdRow,
  MoeEntry,
  ReadingRank,
  WordFrequency,
  WordReading,
  WordshkEntry,
} from "../sources/types";

/** Where a reading, Mandarin item, definition or example came from (the `source` column). */
export type RowSource =
  | "rime"
  | "lshk"
  | "unihan"
  | "wordshk-list"
  | "wordshk-dump"
  | "kaifangcidian"
  | "wiktionary"
  | "moe";

/** One reading (readings table). */
export interface EntryReading {
  /** Space-separated syllables, e.g. "hok6 haau6". Loan syllables (see `loan`) may not be Jyutping. */
  readonly jyutping: string;
  /**
   * rime's rank for a rime reading; "variant" for another source's reading of a character rime
   * covers; absent (NULL) for a word, or for a character rime does not cover. Never invented.
   */
  readonly rank?: ReadingRank;
  /** The highest-priority source that gave this reading. */
  readonly source: RowSource;
  /**
   * 0-based indexes into the syllables of loan sounds (words.hk "!es1" in DSE), present only when
   * non-empty. Validation must skip them and audio must not look up clips for them.
   */
  readonly loan?: readonly number[];
}

/** One Mandarin equivalent (mandarin table), de-duplicated on (trad, simp). */
export interface MandarinItem {
  readonly trad: string;
  readonly simp: string;
  /** Every source that gave this pair, in source priority order (Kaifangcidian, then Wiktionary). */
  readonly sources: readonly RowSource[];
}

/**
 * One sense (definitions table). A words.hk sense fills `yue`, an MoE sense fills `zho`; each keeps
 * its verbatim traditional text plus a simplified copy for display (the MoE copy is for personal
 * display only: its licence forbids redistributing it converted).
 */
export interface Definition {
  /** 1-based, counted per entry and per source. */
  readonly sense: number;
  /**
   * Part of speech as the source writes it. words.hk gives several per entry for a few entries
   * (動詞、名詞); they are joined with "、", the separator MoE's own combined values use (代、介).
   */
  readonly pos?: string;
  readonly yue?: string;
  readonly yueSimp?: string;
  readonly zho?: string;
  readonly zhoSimp?: string;
  readonly source: RowSource;
}

/** One example sentence (examples table), tied to a words.hk sense of the same entry. */
export interface Example {
  /** The `sense` of the words.hk definition it belongs to. */
  readonly sense: number;
  readonly yueTrad: string;
  readonly yueSimp: string;
  /** Space-separated syllables, when the source gives a valid reading. */
  readonly jyutping?: string;
  /** 0-based indexes of loan syllables in `jyutping`, present only when non-empty. */
  readonly loan?: readonly number[];
  readonly zho?: string;
  readonly zhoSimp?: string;
  readonly source: RowSource;
}

export interface Entry {
  /** The normalized lookup key the sources were joined on (headwordKey). Unique; entries sort by it. */
  readonly key: string;
  /** Displayed traditional headword: the words.hk spelling when there is one, else rime's, else another source's. */
  readonly trad: string;
  readonly simp: string;
  /** "char" for a one-code-point headword, else "word". */
  readonly kind: "char" | "word";
  /** log10(1 + weight) from rime's essay-cantonese (or freqOverrides); 0 when there is no weight. */
  readonly freq: number;
  /**
   * The other spellings folded into this entry, for search: other sources' spellings of the key
   * (這裡 for 這裏) and the words.hk variant forms linked to it (㨂 for 揀). Sorted; never `trad`.
   */
  readonly aliases: readonly string[];
  readonly readings: readonly EntryReading[];
  readonly mandarin: readonly MandarinItem[];
  readonly definitions: readonly Definition[];
  readonly examples: readonly Example[];
}

/** The parsed sources merge reads. `wordshkDump` is undefined when the optional dump is not configured. */
export interface MergeInputs {
  readonly rimeChars: readonly CharReading[];
  readonly lshk: readonly CharReading[];
  readonly unihan: readonly CharReading[];
  readonly rimeWords: readonly WordReading[];
  readonly wordshkList: readonly WordReading[];
  readonly wordshkDump?: readonly WordshkEntry[];
  readonly kaifangcidian: readonly KfcdRow[];
  readonly wiktionary: readonly DialSynPair[];
  readonly moe: readonly MoeEntry[];
  readonly essay: readonly WordFrequency[];
}

/** A word and a number, for report samples (e.g. a frequent unmatched Kaifangcidian word and its weight). */
export interface WordCount {
  readonly word: string;
  readonly count: number;
}

/** What merge reports for the build report (P1-T16). Every count is over the inputs given. */
export interface MergeStats {
  /** Optional sources that were not supplied, e.g. ["wordshk-dump"]. */
  readonly omitted: readonly string[];
  readonly entries: { readonly char: number; readonly word: number };
  /** Rows per source. A Mandarin item counts once for each of its sources. */
  readonly rows: {
    readonly readings: Partial<Record<RowSource, number>>;
    readonly mandarin: Partial<Record<RowSource, number>>;
    readonly definitions: Partial<Record<RowSource, number>>;
    readonly examples: Partial<Record<RowSource, number>>;
  };
  /** Attach-only sources: what found no entry. */
  readonly unmatched: {
    /** Kaifangcidian rows and distinct words with no entry. */
    readonly kaifangcidianRows: number;
    readonly kaifangcidianWords: number;
    /** The most frequent unmatched Kaifangcidian words (by essay weight), to revisit. */
    readonly kaifangcidianFrequent: readonly WordCount[];
    /** Distinct usable Wiktionary Cantonese forms (no note, not identity) with no entry. */
    readonly wiktionaryForms: number;
    /** MoE headwords with no entry. */
    readonly moeEntries: number;
  };
  readonly keyCollisions: {
    /** Keys whose sources spell them more than one way (e.g. 這裏 / 這裡). */
    readonly keysWithSeveralSpellings: number;
    readonly sample: readonly { readonly key: string; readonly spellings: readonly string[] }[];
  };
  readonly variants: {
    /** words.hk list variantForm rows and their distinct words. */
    readonly listRows: number;
    readonly listWords: number;
    /** Variant words linked from a public dump entry's variants, folded in as aliases. */
    readonly linkedWords: number;
    /** Variant rows/words with no link: dropped. */
    readonly droppedRows: number;
    readonly droppedWords: number;
    /** Of the dropped words, how many still reach an entry through their normalized key (衛生 → 衞生). */
    readonly droppedButKeyMatched: number;
    /** Distinct (entry, variant) aliases added from dump variant links (list rows or not). */
    readonly aliasesFromLinks: number;
  };
  readonly kaifangcidian: {
    /** Mandarin items whose full-width parenthetical annotation was removed, e.g. （婉）性交 → 性交. */
    readonly annotationsRemoved: number;
    /** Items that were only an annotation, dropped. */
    readonly emptyItemsDropped: number;
    /** "…" items dropped as bare fragments (…子, 老…; see isKfcdFragment). */
    readonly fragmentsDropped: number;
  };
  readonly wiktionary: {
    /** Cantonese forms skipped for carrying a usage note (dated, slang, †, …). */
    readonly notedFormsSkipped: number;
    /** Pairs skipped because the Cantonese form is the Mandarin word (same key). */
    readonly identityPairsSkipped: number;
    /** Cantonese forms skipped because either side has an ideographic description character (⿰血聿). */
    readonly describedFormsSkipped: number;
  };
  readonly moe: {
    /** Senses dropped as reading cross-references ("(一)之又音。"), and a sample. */
    readonly sensesDropped: number;
    readonly droppedSample: readonly { readonly word: string; readonly def: string }[];
    /** MoE headwords not attached because another MoE headword with the same key won (剛纔 vs 剛才). */
    readonly shadowedEntries: number;
  };
  /** words.hk list rows and dump headwords left out by merge's explicit exclusion list (J). */
  readonly excludedHeadwordRows: number;
  /** Characters toSimplified leaves unchanged (simplifiedKeep.ts): Cantonese ("hk" text only) and non-BMP (all text). */
  readonly simplifiedKeep: { readonly cantonese: readonly string[]; readonly nonBmp: readonly string[] };
  readonly freq: {
    readonly entriesWithFreq: number;
    /** Overrides applied: the word, its weight, and the essay weight it replaced when the essay had one. */
    readonly overridesUsed: readonly { readonly word: string; readonly weight: number; readonly essayWeight?: number }[];
    /** Override words that matched no entry (a stale table). */
    readonly overridesUnused: readonly string[];
  };
}

export interface MergeResult {
  readonly entries: Entry[];
  readonly stats: MergeStats;
}
