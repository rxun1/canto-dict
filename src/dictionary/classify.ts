// Lookup input classification (spec §5.1): characters, Jyutping (toned or toneless), or not searchable.
// Pure logic; search.ts turns the result into a query.
import { TONE_CLASS, TONE_DIGIT } from "../jyutping/pattern";
import { normalize, splitSyllables } from "../jyutping/syllables";

/** Longer input is truncated to this many characters (code points) before classifying. */
export const MAX_QUERY_LENGTH = 50;

export type Classification =
  /** Contains CJK. `text` has whitespace removed (headwords have none); case is kept. */
  | { kind: "hanzi"; text: string }
  /**
   * Latin that splits into Jyutping. `syllables` are lowercase, each with its tone digit if typed;
   * `key` is them joined without spaces (the search_keys form); `toneless` when no tone was typed.
   */
  | { kind: "jyutping"; syllables: string[]; key: string; toneless: boolean }
  /** Other text: no query; the screen shows the hint. */
  | { kind: "none" }
  /** Blank input: no query and no hint. */
  | { kind: "empty" };

const HAN = /\p{Script=Han}/u;
const WHITESPACE = /\s+/g;
// Pasted separators: nei5-hou2, nei5'hou2 (also curly quotes and the en dash).
const SEPARATORS = /[-–'‘’]/g;
// A tone digit standing alone after a syllable ("sik 6"); it is attached to that syllable.
const LONE_TONE = new RegExp(` (${TONE_CLASS})(?= |$)`, "g");

/** Classify lookup input per spec §5.1. Never throws; NFKC-normalizes and truncates to MAX_QUERY_LENGTH first. */
export function classify(input: string): Classification {
  // NFKC folds full-width forms (ｓｉｋ６, ＡＡ制) to ASCII.
  const trimmed = Array.from(input.normalize("NFKC").trim()).slice(0, MAX_QUERY_LENGTH).join("");
  if (trimmed === "") return { kind: "empty" };
  if (HAN.test(trimmed)) return { kind: "hanzi", text: trimmed.replace(WHITESPACE, "") };

  const cleaned = normalize(trimmed.replace(SEPARATORS, " ")).replace(LONE_TONE, "$1");
  const syllables = splitSyllables(cleaned);
  if (!syllables) return { kind: "none" };
  return {
    kind: "jyutping",
    syllables,
    key: syllables.join(""),
    toneless: !syllables.some((s) => TONE_DIGIT.test(s.slice(-1))),
  };
}
