import OpenCC from "opencc-js";
import { isSingleCodePoint } from "../sources/codePoints";
import { CANTONESE_KEEP, NON_BMP_KEEP } from "./simplifiedKeep";

/**
 * Which OpenCC traditional → simplified config toSimplified uses (headwordKey ignores it), named
 * after the variant table the text's traditional forms are read with:
 * - "hk": Hong Kong forms, OpenCC hk→cn (衞生 → 卫生; tw→cn would leave 衞). Used for Cantonese
 *   text: the displayed headword (from words.hk, rime, LSHK or Unihan) and the words.hk dump's
 *   definitions, examples and the examples' Mandarin translations.
 * - "tw": Taiwan forms, OpenCC tw→cn, which reads 著 the Taiwan way (著急 → 着急; hk→cn keeps
 *   著急). Used for MoE definitions and Wiktionary's Mandarin words (著涼 → 着凉).
 * Kaifangcidian supplies its own simplified forms and is not converted.
 */
export type Script = "hk" | "tw";

const HK_TO_STANDARD = OpenCC.Converter({ from: "hk", to: "t" });
const TW_TO_STANDARD = OpenCC.Converter({ from: "tw", to: "t" });

const TO_SIMPLIFIED: Readonly<Record<Script, (text: string) => string>> = {
  hk: OpenCC.Converter({ from: "hk", to: "cn" }),
  tw: OpenCC.Converter({ from: "tw", to: "cn" }),
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

/** Characters toSimplified leaves as they are, per script (simplifiedKeep.ts). */
const KEEP: Readonly<Record<Script, ReadonlySet<string>>> = {
  hk: new Set([...CANTONESE_KEEP, ...NON_BMP_KEEP]),
  tw: new Set(NON_BMP_KEEP),
};

/**
 * Simplified form of a traditional text for display (OpenCC hk→cn or tw→cn). Characters without a
 * simplified form (嘅, 冇, 喺) come back unchanged, and so do the keep-list's (simplifiedKeep.ts):
 * 係/嗰/餸 in "hk" text, and in both scripts every character OpenCC would turn into a non-BMP one.
 * The text is converted in runs between kept characters, so a run never sees a kept neighbour;
 * on the pinned data this gives the same output as converting the whole text and then restoring
 * the kept characters.
 */
export function toSimplified(text: string, script: Script): string {
  const convert = TO_SIMPLIFIED[script];
  const keep = KEEP[script];
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
