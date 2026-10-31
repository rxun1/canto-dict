import OpenCC from "opencc-js";
import { isSingleCodePoint } from "../sources/codePoints";
import { CANTONESE_KEEP, NON_BMP_KEEP, XI_HEADWORDS, XI_TEXT_PHRASES } from "./simplifiedKeep";

/**
 * What kind of text toSimplified converts (headwordKey ignores it): its language, which picks the
 * keep-list (simplifiedKeep.ts), and the variant table its traditional forms are read with, which
 * picks the OpenCC config.
 * - "yue": Cantonese in Hong Kong forms, OpenCC hk→cn (衞生 → 卫生; tw→cn would leave 衞), keeping
 *   CANTONESE_KEEP (係, 嗰, 餸) and NON_BMP_KEEP, except that 係 becomes 系 inside XI_TEXT_PHRASES
 *   (關係 → 关系). Used for the words.hk dump's definitions and example sentences.
 * - "headword": "yue" for the displayed headword (from words.hk, rime, LSHK or Unihan); a headword
 *   in XI_HEADWORDS (基尼係數) is converted whole, its 係 becoming 系.
 * - "zho-hk": Mandarin in Hong Kong forms, OpenCC hk→cn keeping NON_BMP_KEEP only (關係 → 关系).
 *   Used for the Mandarin translations of words.hk examples.
 * - "zho-tw": Mandarin in Taiwan forms, OpenCC tw→cn keeping NON_BMP_KEEP only; tw→cn reads 著 the
 *   Taiwan way (著急 → 着急; hk→cn keeps 著急). Used for MoE definitions and Wiktionary's Mandarin
 *   words (著涼 → 着凉).
 * Kaifangcidian supplies its own simplified forms and is not converted.
 */
export type TextKind = "headword" | "yue" | "zho-hk" | "zho-tw";

const HK_TO_STANDARD = OpenCC.Converter({ from: "hk", to: "t" });
const TW_TO_STANDARD = OpenCC.Converter({ from: "tw", to: "t" });
const HK_TO_SIMPLIFIED = OpenCC.Converter({ from: "hk", to: "cn" });
const TW_TO_SIMPLIFIED = OpenCC.Converter({ from: "tw", to: "cn" });

const NON_BMP_KEEP_SET: ReadonlySet<string> = new Set(NON_BMP_KEEP);

/** Per kind: the OpenCC converter and the characters left as they are. */
const YUE_KEEP: ReadonlySet<string> = new Set([...CANTONESE_KEEP, ...NON_BMP_KEEP]);
const KINDS: Readonly<Record<TextKind, { readonly convert: (text: string) => string; readonly keep: ReadonlySet<string> }>> = {
  headword: { convert: HK_TO_SIMPLIFIED, keep: YUE_KEEP },
  yue: { convert: HK_TO_SIMPLIFIED, keep: YUE_KEEP },
  "zho-hk": { convert: HK_TO_SIMPLIFIED, keep: NON_BMP_KEEP_SET },
  "zho-tw": { convert: TW_TO_SIMPLIFIED, keep: NON_BMP_KEEP_SET },
};

/**
 * The lookup key entries are joined on. Only the key is folded; stored texts keep their spelling.
 *
 * A word (two or more code points) is folded to OpenCC standard traditional through BOTH variant
 * tables, Taiwan then Hong Kong (tw→t, then hk→t), whatever its source. No source sticks to one
 * convention: words.hk lists both 着急 and 著急 (and 無綫 and 無線, as rime does),
 * Kaifangcidian writes Taiwan forms (床, 麵, 裡, 著), and MoE writes 這裡/衛生/麵包/電線/著急 for the
 * HK 這裏/衞生/麪包/電綫/着急. Folding every source the same way makes the key one function of the
 * spelling, so two sources that agree on a spelling always agree on its key. On the pinned data, 1,128
 * keys collect more than one rime/words.hk spelling; every one checked is a variant spelling of one
 * word (為/爲, 台/臺, 着/著 zoek6, 群/羣, …).
 *
 * zyu3 著 ("write", "notable") keeps its 著 in the key only in words OpenCC's tw→t phrase table
 * lists (著名, 顯著, 著作, 名著); elsewhere tw→t turns 著 into 着 as for zoek6 (土著 → 土着,
 * 原著 → 原着, 論著 → 論着). That changes only the key, and every spelling of such a word folds the
 * same way, so its sources still join. On the pinned data 13 zyu3 words get a 着 key this way and
 * none of them meets a 着-spelled word.
 *
 * A single character is its own key: character-level OpenCC maps 台→臺, 著→着 and 針→鍼, which would
 * merge different characters with different readings.
 */
export function headwordKey(word: string): string {
  return isSingleCodePoint(word) ? word : HK_TO_STANDARD(TW_TO_STANDARD(word));
}

/** XI_TEXT_PHRASES as one alternation, captured so String.split keeps the matches (CJK only: no escaping). */
const XI_TEXT_PATTERN = new RegExp(`(${XI_TEXT_PHRASES.join("|")})`, "u");
const XI_HEADWORD_SET: ReadonlySet<string> = new Set(XI_HEADWORDS);

/** A simplified text, and the 係 phrases (XI_TEXT_PHRASES, XI_HEADWORDS) it converted, in text order. */
export interface Simplified {
  readonly text: string;
  readonly xiPhrases: readonly string[];
}

/** Converts `text` in runs between characters of `keep`, which stay as they are. */
function convertAround(text: string, convert: (text: string) => string, keep: ReadonlySet<string>): string {
  let simplified = "";
  let run = "";
  for (const char of text) {
    if (!keep.has(char)) {
      run += char;
      continue;
    }
    simplified += convert(run) + char;
    run = "";
  }
  return simplified + convert(run);
}

/**
 * Simplified form of a traditional text for display (see TextKind). Characters without a
 * simplified form (嘅, 冇, 喺) come back unchanged, and so do the kind's keep-list characters.
 * The text is converted in runs between kept characters (and 係 phrases), so a run never sees
 * those neighbours. That gives the same output as converting the whole text and then restoring
 * the kept characters on every text merge converts from the pinned sources with the words.hk dump
 * (all-1793304301.csv.gz): the 283,310 headwords, words.hk definitions, examples and their
 * Mandarin translations, MoE definitions and Wiktionary Mandarin words (checked 2026-10-30).
 */
export function simplify(text: string, kind: TextKind): Simplified {
  const { convert, keep } = KINDS[kind];
  if (kind === "headword" && XI_HEADWORD_SET.has(text)) {
    return { text: convertAround(text, convert, NON_BMP_KEEP_SET), xiPhrases: [text] };
  }
  if (kind !== "headword" && kind !== "yue") return { text: convertAround(text, convert, keep), xiPhrases: [] };
  // split with a capture group: odd indexes are the phrases.
  const parts = text.split(XI_TEXT_PATTERN);
  return {
    text: parts.map((part, i) => convertAround(part, convert, i % 2 === 1 ? NON_BMP_KEEP_SET : keep)).join(""),
    xiPhrases: parts.filter((_, i) => i % 2 === 1),
  };
}

/** simplify's text alone. */
export function toSimplified(text: string, kind: TextKind): string {
  return simplify(text, kind).text;
}
