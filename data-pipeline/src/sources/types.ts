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
