/** A hand-set essay weight for a very common Cantonese word the essay lacks. */
export interface FreqOverride {
  readonly word: string;
  readonly weight: number;
}

/**
 * Weights for very common Cantonese words that rime's essay-cantonese.txt lacks, mostly because it
 * keeps its own spellings (我地, not 我哋). An override replaces the essay weight of the entry it
 * matches (by displayed spelling, then the entry's other spellings); merge lists every override it
 * used in its stats, with the essay weight it replaced, so a stale one shows up.
 *
 * Weights are on the essay's own scale and come from the essay itself, by one of two rules:
 * - the essay's weight for the same word in another spelling, or
 * - when it has none, the essay's weight for the Mandarin equivalent. That count comes from the
 *   essay's Mandarin corpus, so it undercounts the Cantonese word, but it still puts these words in
 *   the top 10% of the essay (the 90th percentile is 905).
 *
 * There is deliberately no general 哋→地 fallback: it would only rescue 我哋 and would give words
 * such as 輕輕哋 the weight of the Mandarin 輕輕地.
 */
export const FREQ_OVERRIDES: readonly FreqOverride[] = [
  // Same word as the essay's 我地 (55260).
  { word: "我哋", weight: 55260 },
  // The essay has neither 佢哋 nor 佢地: weight of the Mandarin 他們 (18954).
  { word: "佢哋", weight: 18954 },
  // The essay has neither 你哋 nor 你地: weight of the Mandarin 你們 (7830).
  { word: "你哋", weight: 7830 },
  // "here"; the essay has no 呢度: weight of the Mandarin 這裏 (10588).
  { word: "呢度", weight: 10588 },
  // "these"; the essay has no 呢啲: weight of the Mandarin 這些 (5784).
  { word: "呢啲", weight: 5784 },
  // "those"; the essay has no 嗰啲: weight of the Mandarin 那些 (4538).
  { word: "嗰啲", weight: 4538 },
  // "is there / have you"; the essay has no 有冇: weight of the Mandarin 有沒有 (20959).
  { word: "有冇", weight: 20959 },
  // "what"; same word as the essay's 乜嘢 (22691).
  { word: "咩嘢", weight: 22691 },
  // "won't do / not OK"; the essay has no 唔得: weight of the Mandarin 不行 (2491).
  { word: "唔得", weight: 2491 },
  // "a moment"; the essay has no 一陣間: weight of the Mandarin 一會兒 (6205).
  { word: "一陣間", weight: 6205 },
];
