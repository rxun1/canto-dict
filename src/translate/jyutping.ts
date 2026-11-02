// Text → Jyutping per character (spec: always computed locally, dictionary first, to-jyutping
// fallback). Lives here, not in src/jyutping, because that folder stays free of app imports for
// data-pipeline.
import ToJyutping from "to-jyutping";
import { getWordReadings } from "../db/wordReadings";
import type { Db } from "../db/types";
import { HAN } from "../dictionary/classify";
import { isValidSyllable } from "../jyutping/syllables";

/**
 * Longest word tried, in characters. canto.db has longer words (up to 19), but 99.8% of them have
 * 8 or fewer, and each extra character adds a candidate per position to the query.
 */
const MAX_WORD_LENGTH = 8;

/** The first reading with one valid syllable per character, split into syllables. */
function fittingReading(readings: readonly string[] | undefined, length: number): string[] | null {
  for (const reading of readings ?? []) {
    const syllables = reading.split(" ");
    if (syllables.length === length && syllables.every(isValidSyllable)) return syllables;
  }
  return null;
}

/**
 * One Jyutping syllable (or null) per character (code point) of `text`, which should be in
 * traditional characters (run toTrad first). Left to right, the longest canto.db word made only of
 * Han characters takes its reading (by headword or alias spelling); every other character takes
 * to-jyutping's, read over the whole text so its own context rules still apply. Punctuation and
 * Latin are null.
 */
export async function textToJyutping(db: Db, text: string): Promise<(string | null)[]> {
  const chars = Array.from(text);
  const fallback = ToJyutping.getJyutpingList(text).map(([, jyutping]) => jyutping);

  const candidates = new Set<string>();
  for (let start = 0; start < chars.length; start++) {
    // Each run of Han characters from `start`, 2 to MAX_WORD_LENGTH long.
    for (let end = start; end < Math.min(start + MAX_WORD_LENGTH, chars.length) && HAN.test(chars[end]); end++) {
      if (end > start) candidates.add(chars.slice(start, end + 1).join(""));
    }
  }
  const readings = await getWordReadings(db, [...candidates]);

  /** The syllables of the longest word with a fitting reading at `start`, or null. */
  const longestWordAt = (start: number): string[] | null => {
    for (let length = Math.min(MAX_WORD_LENGTH, chars.length - start); length >= 2; length--) {
      const syllables = fittingReading(readings.get(chars.slice(start, start + length).join("")), length);
      if (syllables) return syllables;
    }
    return null;
  };

  const result: (string | null)[] = [];
  while (result.length < chars.length) {
    // A fitting reading has one syllable per character, so result.length is the next character's index.
    const word = longestWordAt(result.length);
    if (word) result.push(...word);
    else result.push(fallback[result.length] ?? null);
  }
  return result;
}
