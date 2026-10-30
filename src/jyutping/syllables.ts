// Jyutping syllable validation and splitting. Pure TypeScript: no Node or React Native imports,
// because both the data pipeline and the app import this file.
import { ATTESTED_SYLLABLES } from "./syllableList";
import { PARTICLES, TONED_SYLLABLE, TONE_DIGIT, TONE_DIGITS_GLOBAL } from "./pattern";

const MAX_BASE_LENGTH = Math.max(...ATTESTED_SYLLABLES.map((s) => s.length), ...PARTICLES.map((s) => s.length));
const BASES: ReadonlySet<string> = new Set([...ATTESTED_SYLLABLES, ...PARTICLES]);

/** True for a base (attested syllable or particle) plus a single tone digit 1-6, e.g. "sik1". Lowercase only. */
export function isValidSyllable(text: string): boolean {
  const match = TONED_SYLLABLE.exec(text);
  return match !== null && BASES.has(match[1]);
}

/** Lowercase, trim, and collapse internal whitespace to single spaces. */
export function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Remove tone digits 1-6. */
export function stripTones(text: string): string {
  return text.replace(TONE_DIGITS_GLOBAL, "");
}

/**
 * Split one space-free chunk into syllables (greedy longest match, backtracking), or null.
 * Failed start positions are memoized, so this is O(length x MAX_BASE_LENGTH).
 */
function splitChunk(chunk: string): string[] | null {
  const failedAt = new Set<number>();
  const splitFrom = (start: number): string[] | null => {
    if (start === chunk.length) return [];
    if (failedAt.has(start)) return null;
    for (let end = Math.min(chunk.length, start + MAX_BASE_LENGTH); end > start; end--) {
      if (!BASES.has(chunk.slice(start, end))) continue;
      // An optional tone digit may follow the base.
      const next = end < chunk.length && TONE_DIGIT.test(chunk[end]) ? end + 1 : end;
      const rest = splitFrom(next);
      if (rest) return [chunk.slice(start, next), ...rest];
    }
    failedAt.add(start);
    return null;
  };
  return splitFrom(0);
}

/**
 * Split text into Jyutping syllables, keeping any tone digits given.
 * "sikfaan" -> ["sik","faan"]; "sik6 faan6" -> ["sik6","faan6"]. Null if it is not Jyutping.
 */
export function splitSyllables(text: string): string[] | null {
  const normalized = normalize(text);
  if (normalized === "") return null;
  const result: string[] = [];
  for (const chunk of normalized.split(" ")) {
    const parts = splitChunk(chunk);
    if (!parts) return null;
    result.push(...parts);
  }
  return result;
}
