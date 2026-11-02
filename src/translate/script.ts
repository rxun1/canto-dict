import * as OpenCC from "opencc-js";
import { simplifyCantonese } from "../script/simplifiedKeep";

// Built once: each Converter call loads its dictionaries into a new trie.
const SIMPLIFIED_TO_TRADITIONAL = OpenCC.Converter({ from: "cn", to: "t" });
// hk→cn, as data-pipeline simplifies the dictionary's Cantonese text, so it also reads Hong Kong forms (衞 → 卫).
const TRADITIONAL_TO_SIMPLIFIED = OpenCC.Converter({ from: "hk", to: "cn" });

/** Simplified Chinese to OpenCC standard traditional (没有 → 沒有). */
export function toTrad(text: string): string {
  return SIMPLIFIED_TO_TRADITIONAL(text);
}

/**
 * Traditional Cantonese text to simplified for display, the way the dictionary shows it: 係, 嗰, 餸
 * and characters whose simplified form is outside the BMP stay as they are, except 關係 → 关系
 * (src/script/simplifiedKeep.ts). Characters without a simplified form (嘅, 冇, 喺) are unchanged.
 */
export function toSimp(text: string): string {
  return simplifyCantonese(text, TRADITIONAL_TO_SIMPLIFIED).text;
}
