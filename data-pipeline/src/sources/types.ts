export type ReadingRank = "default" | "common" | "rare" | "obsolete";

export interface CharReading {
  readonly char: string;
  readonly jyutping: string;
  readonly rank?: ReadingRank;
}

/**
 * One reading of a word from rime-cantonese's words dict: one Jyutping syllable per character.
 * No weight field: the pinned file's rows are `word<TAB>code` only (rows are ordered by code,
 * not by frequency), so there is no usable frequency data to carry.
 */
export interface WordReading {
  readonly word: string;
  readonly syllables: readonly string[];
  /**
   * 0-based indexes into `syllables` of loan pronunciations (words.hk writes them with a leading
   * "!", e.g. "!es1" in DSE). Those syllables are stored WITHOUT the "!" and may not be valid
   * Jyutping (es1), so consumers must not validate them as such. Present only when non-empty.
   */
  readonly loanSyllables?: readonly number[];
  /**
   * Set (to true) only when words.hk marked the row with a trailing "*": the word is a variant
   * spelling (異體字) of a standard word, e.g. 㨂 for 揀. The "*" is stripped from `word`.
   */
  readonly variantForm?: true;
}

/**
 * One reading of a words.hk dump headword. Same "!" loan convention as WordReading: loan
 * syllables are stored without the "!" and indexed by `loanSyllables` (present only when
 * non-empty). The syllable count is NOT checked against the word: words.hk headwords include
 * Latin-letter words (e.g. "gym房", "rapper") whose letters do not map one-to-one to syllables.
 */
export type WordshkHeadword = Pick<WordReading, "word" | "syllables" | "loanSyllables">;

/** An example sentence from a words.hk `<eg>` block. English (eng:) lines are never kept. */
export interface WordshkExample {
  /** The Cantonese sentence (yue: line), with #link markers stripped and without its Jyutping. */
  readonly yue: string;
  /** The yue: line's trailing "(…)" Jyutping as syllables, punctuation dropped; absent when the line has none or it had an invalid syllable (reported). */
  readonly jyutping?: readonly string[];
  /** 0-based indexes into `jyutping` of "!" loan syllables (stored without the "!"). */
  readonly loanSyllables?: readonly number[];
  /** The block's Mandarin (zho:) sentence as written (only #link markers and its Jyutping removed). */
  readonly zho?: string;
}

/** One sense of a words.hk entry: its Cantonese explanation and examples. */
export interface WordshkSense {
  /** The yue: explanation (continuation lines joined with "\n"), #link markers stripped. */
  readonly yue: string;
  readonly examples: readonly WordshkExample[];
}

/**
 * A public entry from the words.hk full dump. words.hk puts the (pos:…) and (label:…) tags once
 * per entry, before all senses, so they live on the entry, not on each sense.
 */
export interface WordshkEntry {
  readonly id: number;
  readonly headwords: readonly WordshkHeadword[];
  /** Alternative written forms (異體字) from the variants column, e.g. 㨂 for 揀; no readings. */
  readonly variants: readonly string[];
  /** Parts of speech in file order, e.g. ["動詞", "名詞"]. */
  readonly pos: readonly string[];
  /** Usage labels in file order, e.g. ["書面語"]. */
  readonly labels: readonly string[];
  readonly senses: readonly WordshkSense[];
}

/** One Mandarin equivalent in both scripts, as the source writes them (e.g. 沒有 / 没有). */
export interface MandarinEquivalent {
  readonly trad: string;
  readonly simp: string;
}

/**
 * One row of Kaifangcidian's Cantonese dictionary: a colloquial Cantonese word in both scripts, its
 * reading converted from the file's Yale to Jyutping (one syllable per character), and its Mandarin
 * equivalents (e.g. 冇 -> 没有, 没, 无). `mandarin` is empty when the source gives none. Both scripts
 * come from the source's own traditional and simplified files, so no script conversion is needed.
 *
 * Rows are NOT unique per (word, reading): 919 such keys repeat with different Mandarin equivalents
 * (one row per sense), and Mandarin items may carry annotations like （婉）性交 or "…" placeholders.
 * Consumers (merge) must handle both.
 */
export interface KfcdRow {
  /** Traditional headword (from the ft file). */
  readonly word: string;
  /** Simplified headword (from the jt file). */
  readonly wordSimp: string;
  readonly syllables: readonly string[];
  readonly mandarin: readonly MandarinEquivalent[];
}

/**
 * One Written Standard Chinese (Mandarin) word and its Cantonese equivalents, from a Wiktionary
 * dialectal-synonyms table (Module:zh/data/dial-syn/<word>), e.g. 沒有 -> 冇, 冇有. Forms are
 * traditional characters, as Wiktionary writes them; Cantonese forms come from the Hong Kong,
 * Guangzhou and Macau rows only, in that order, de-duplicated, with Wiktionary's annotations
 * (":dated", "_1" etymology numbers, [[links]]) stripped.
 *
 * A table with several Written Standard forms gives one pair per form, all with the same
 * Cantonese list; tables for different senses of the same word (張, 張-2, …) give separate pairs,
 * so `mandarin` is not unique.
 *
 * License: Wiktionary text is CC BY-SA 4.0 (dual-licensed with the GFDL); this app uses it for
 * personal, offline use only.
 */
export interface DialSynPair {
  readonly mandarin: string;
  readonly cantonese: readonly string[];
}
