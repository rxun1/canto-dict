// Jyutping syllable validation and splitting. Pure TypeScript: no Node or React Native imports,
// because both the data pipeline and the app import this file.
import { ATTESTED_SYLLABLES } from "./syllableList";

/**
 * Sentence-final particles that some sources write outside the standard table
 * (e.g. la1, ga3). Keep this list small and explicit; it widens what counts as Jyutping.
 * Most are also attested in rime char.csv; listing them here keeps them valid even if a
 * future data refresh drops them.
 */
export const PARTICLES: readonly string[] = ["a", "aa", "ga", "gaa", "la", "laa", "ma", "maa", "me", "ne", "o", "wo", "ze", "zaa"];

const TONE_DIGIT = /[1-6]/;
const MAX_BASE_LENGTH = Math.max(...ATTESTED_SYLLABLES.map((s) => s.length), ...PARTICLES.map((s) => s.length));
const BASES: ReadonlySet<string> = new Set([...ATTESTED_SYLLABLES, ...PARTICLES]);

/** True for a toneless base that is an attested syllable or a listed particle. */
function isBase(base: string): boolean {
  return BASES.has(base);
}

/** True for a base plus a single tone digit 1-6, e.g. "sik1". Lowercase only. */
export function isValidSyllable(text: string): boolean {
  const match = /^([a-z]+)([1-6])$/.exec(text);
  return match !== null && isBase(match[1]);
}

/** Lowercase, trim, and collapse internal whitespace to single spaces. */
export function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Remove tone digits 1-6. */
export function stripTones(text: string): string {
  return text.replace(/[1-6]/g, "");
}

/** Split one space-free chunk into syllables (greedy longest match, backtracking), or null. */
function splitChunk(chunk: string, start: number): string[] | null {
  if (start === chunk.length) return [];
  const maxEnd = Math.min(chunk.length, start + MAX_BASE_LENGTH);
  for (let end = maxEnd; end > start; end--) {
    if (!isBase(chunk.slice(start, end))) continue;
    // An optional tone digit may follow the base.
    const withTone = end < chunk.length && TONE_DIGIT.test(chunk[end]) ? end + 1 : end;
    const rest = splitChunk(chunk, withTone);
    if (rest) return [chunk.slice(start, withTone), ...rest];
  }
  return null;
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
    const parts = splitChunk(chunk, 0);
    if (!parts) return null;
    result.push(...parts);
  }
  return result;
}
