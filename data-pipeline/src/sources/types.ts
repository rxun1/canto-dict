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
}
