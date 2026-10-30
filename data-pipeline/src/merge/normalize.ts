import OpenCC from "opencc-js";
import { isSingleCodePoint } from "../sources/codePoints";

/**
 * The traditional-character convention a text is written in, which picks its OpenCC config:
 * "hk" for the Cantonese sources (words.hk, rime, LSHK, Unihan; rime mixes in HK forms such as 綫),
 * "tw" for the Taiwan sources (MoE, and Wiktionary's Mandarin words: 著涼, 睪丸).
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
 * word (為/爲, 台/臺, 着/著 zoek6, 群/羣, …), and OpenCC's phrase tables keep zyu3 著 (著名, 顯著).
 *
 * A single character is its own key: character-level OpenCC maps 台→臺, 著→着 and 針→鍼, which would
 * merge different characters with different readings.
 */
export function headwordKey(word: string): string {
  return isSingleCodePoint(word) ? word : HK_TO_STANDARD(TW_TO_STANDARD(word));
}

/**
 * Simplified form of a traditional text for display (OpenCC hk→cn or tw→cn). Characters without a
 * simplified form (嘅, 冇, 喺) come back unchanged.
 */
export function toSimplified(text: string, script: Script): string {
  return TO_SIMPLIFIED[script](text);
}
