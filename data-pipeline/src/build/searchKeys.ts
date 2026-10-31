// The search_keys rows of one reading (spec §5.1). A Jyutping query has its spaces removed and is
// prefix-matched against these keys: a toneless query (sik, sikfaan) against toneless keys, a query
// with tone digits (sik6, sik6 faan6, sikfaan6) against all of them.
import { isValidSyllable, stripTones } from "../../../src/jyutping/syllables";

export type SearchKeyType = "toned" | "toneless" | "joined";

export interface SearchKey {
  readonly key: string;
  readonly type: SearchKeyType;
}

/**
 * Keys for a space-separated reading: toned (sik6faan6), toneless (sikfaan), and joined, the forms
 * with tones on some syllables but not all (sikfaan6), for a query that types only some tones. The
 * joined form toneless on the last syllable alone (sik6faan) is left out: it is a prefix of the toned
 * key, which a toned query already prefix-matches. A reading of n syllables has 2^n - 3 joined keys,
 * so only readings of 2 to MAX_JOINED_SYLLABLES syllables get them.
 *
 * Keys cover the syllables before the first one that is not valid Jyutping. In practice that is a
 * words.hk loan syllable (es1 in DSE di1 es1 ji1, valid loan syllables pass): no query can type it,
 * since input classification only accepts valid syllables, and dropping it would make a false key
 * (di1ji1) while the syllables before it stay a true prefix of the reading (di1). A reading that
 * starts with such a syllable (F5 ef1 ng5) has no keys.
 */
/**
 * Longest reading that gets joined keys. On the pinned sources (no words.hk dump) canto.db is 49.5 MB
 * with no joined keys, 52.3 MB with a limit of 2, 60.2 MB with 3, 83.6 MB with 4, and 284 MB with
 * no limit (idioms of 8+ syllables have hundreds each). Typing tones on only some syllables is rare
 * enough that 3 is the most worth paying for.
 */
export const MAX_JOINED_SYLLABLES = 3;

export function searchKeys(jyutping: string): SearchKey[] {
  const all = jyutping.split(" ");
  const firstInvalid = all.findIndex((s) => !isValidSyllable(s));
  const syllables = firstInvalid === -1 ? all : all.slice(0, firstInvalid);
  if (syllables.length === 0) return [];

  const toneless = syllables.map(stripTones);
  const keys: SearchKey[] = [
    { key: syllables.join(""), type: "toned" },
    { key: toneless.join(""), type: "toneless" },
  ];
  if (syllables.length > MAX_JOINED_SYLLABLES) return keys;
  // Bit i of `toned` set: syllable i keeps its tone. 0 (toneless) and all bits (toned) are done above.
  const all1 = (1 << syllables.length) - 1;
  const lastToneless = all1 >> 1;
  for (let toned = 1; toned < all1; toned++) {
    if (toned === lastToneless) continue;
    keys.push({ key: syllables.map((s, i) => (toned & (1 << i) ? s : toneless[i])).join(""), type: "joined" });
  }
  return keys;
}
