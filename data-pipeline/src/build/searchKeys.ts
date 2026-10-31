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
 * Longest reading prefix that gets joined keys. On the pinned sources (no words.hk dump) canto.db is
 * 49.4 MB with no joined keys and 63.1 MB with this limit (224,611 joined rows, next to 155,645 toned
 * and 149,174 toneless). Typing tones on only some syllables is rare, and the first syllables a query
 * types are the ones a prefix match needs.
 */
export const MAX_JOINED_SYLLABLES = 3;

/**
 * Keys for a space-separated reading: toned (sik6faan6), toneless (sikfaan), and joined, the forms
 * with tones on some syllables but not all (sikfaan6), for a query that types only some tones.
 * Joined keys cover only the first MAX_JOINED_SYLLABLES syllables (so sikfaan6 still finds a longer
 * word starting sik6 faan6), and only forms whose last syllable is toned: a form ending toneless
 * (sik6faan) is a prefix of the same form with that tone added, and a toned query prefix-matches
 * every key type. A prefix of n syllables has 2^(n-1) - 1 joined keys.
 *
 * Keys cover the syllables before the first one that is not valid Jyutping. In practice that is a
 * words.hk loan syllable (es1 in DSE di1 es1 ji1; valid loan syllables pass): no query can type it,
 * since input classification only accepts valid syllables, and dropping it would make a false key
 * (di1ji1) while the syllables before it stay a true prefix of the reading (di1). A reading that
 * starts with such a syllable (F5 ef1 ng5) has no keys. A truncated key looks like a complete
 * reading (DSE's di1 equals 地's), so search must not treat key = query as an exact match: exact-match
 * ranking compares readings.jyutping with its spaces removed (spec §5.1).
 */
export function searchKeys(jyutping: string): SearchKey[] {
  const all = jyutping.split(" ");
  const firstInvalid = all.findIndex((s) => !isValidSyllable(s));
  const syllables = firstInvalid === -1 ? all : all.slice(0, firstInvalid);
  if (syllables.length === 0) return [];

  const keys: SearchKey[] = [
    { key: syllables.join(""), type: "toned" },
    { key: stripTones(syllables.join("")), type: "toneless" },
  ];
  const prefix = syllables.slice(0, MAX_JOINED_SYLLABLES);
  // Bit i of `toned` set: syllable i keeps its tone. The last syllable's bit is always set; the
  // all-toned form (the toned key or a prefix of it) is skipped.
  const last = 1 << (prefix.length - 1);
  for (let toned = last; toned < 2 * last - 1; toned++) {
    keys.push({ key: prefix.map((s, i) => (toned & (1 << i) ? s : stripTones(s))).join(""), type: "joined" });
  }
  return keys;
}
