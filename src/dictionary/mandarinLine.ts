// The entry screen's Mandarin line (spec §5.2), in fallback order: (1) the mandarin table's
// equivalents; (2) the first MoE definition (definitions.zho); (3) the first words.hk Cantonese
// explanation (definitions.yue), which the screen labels 粤语释义. Pure logic.
import type { Entry } from "../db/entries";

/** Labels a words.hk Cantonese explanation shown where Mandarin would be (spec §5.2). */
export const YUE_GLOSS_LABEL = "粤语释义";

export interface ScriptText {
  trad: string;
  simp: string;
}

export type MandarinLine =
  /** Every Mandarin equivalent, in the order the pipeline ranked them. */
  | { source: "mandarin"; words: ScriptText[] }
  /** The first MoE definition. */
  | ({ source: "zho" } & ScriptText)
  /** The first words.hk explanation: Cantonese, not Mandarin (粤语释义). */
  | ({ source: "yue" } & ScriptText);

/** The Mandarin line for an entry, or null when it has no equivalent, MoE definition or words.hk explanation. */
export function mandarinLine(entry: Pick<Entry, "mandarin" | "definitions">): MandarinLine | null {
  if (entry.mandarin.length > 0) {
    return { source: "mandarin", words: entry.mandarin.map(({ trad, simp }) => ({ trad, simp })) };
  }
  for (const d of entry.definitions) {
    if (d.zho !== null) return { source: "zho", trad: d.zho, simp: d.zhoSimp ?? d.zho };
  }
  for (const d of entry.definitions) {
    if (d.yue !== null) return { source: "yue", trad: d.yue, simp: d.yueSimp ?? d.yue };
  }
  return null;
}
