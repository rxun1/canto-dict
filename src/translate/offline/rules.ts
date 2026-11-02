// Offline translation step 3 (spec §6): reorder rules over substitute()'s Cantonese output, where
// Mandarin word order survived the phrase table. Each rule is a small pure function over the whole
// text; applyRules runs them in RULES order. Word lists are deliberately short: a rule that misses
// leaves Mandarin order (still readable), a rule that misfires garbles the sentence.

/** Punctuation that ends a clause (full-width and ASCII). */
const PUNCTUATION = "，。！？；：、,.!?;:";
/** Lookahead for the end of a clause, or of the text. */
const CLAUSE_END = `$|[${PUNCTUATION}\\s]`;

/** Common one-character Cantonese verbs, for 了 → 咗 and 先 reordering. */
const VERBS = [
  "食", "飲", "睇", "講", "做", "寫", "讀", "玩", "打", "煮", "聽", "諗", "唱", "跳", "等", "搵", "瞓", "傾",
  "去", "嚟", "返", "走", "行", "坐", "買", "賣", "洗", "學", "開", "用", "試", "揀", "問", "畀", "送", "借",
  "還", "拎", "攞", "搬", "跑", "飛", "著", "換",
];

/**
 * VERBS that 喺 + verb → verb緊 may move. Leaves out verbs that also start common place nouns after 喺
 * (學校, 洗手間, 行人路, 走廊, 開平, 坐位), where the rule would garble 喺學校 into 學緊校.
 */
const PROGRESSIVE_VERBS = VERBS.filter((verb) => !["學", "洗", "行", "走", "開", "坐"].includes(verb));

/** Adjectives a 比 comparison ends with, longest first so 好睇 is tried before 好. */
const ADJECTIVES = [
  "好睇", "好食", "聰明", "開心", "辛苦", "重要", "容易", "犀利",
  "高", "矮", "大", "細", "多", "少", "好", "快", "慢", "平", "貴", "靚", "肥", "瘦", "長", "短",
  "遠", "近", "熱", "凍", "新", "舊", "早", "遲", "重", "輕", "叻", "勁", "難", "易",
];
/** Degree words that may follow the adjective: 高過你好多. */
const DEGREE = ["好多", "少少", "啲"];
/** Characters after 比 that make a word, not a comparison: 比賽, 比較, 比如, 比例, … */
const NOT_COMPARISON = ["賽", "較", "如", "例", "方", "喻", "率", "重", "分", "劃", "起", "得"];

/** Characters before 先 that make a word with it: 首先, 原先, 事先, 優先, 最先, … */
const NOT_BEFORE_FIRST = "首原事優最領率祖預搶早";
/** Sentence-final particles that may follow the verb: 我食先啦. */
const FINAL_PARTICLES = ["啦", "吖", "呀", "喇"];

/** Times of day a clock time follows: 下晝一點. */
const TIMES_OF_DAY = ["上晝", "下晝", "晏晝", "朝早", "夜晚", "凌晨", "中午", "今晚", "聽晚", "琴晚"];
/** What may follow 一點 in a clock time: 一點鐘, 一點半, 一點三. */
const AFTER_CLOCK_ONE = "鐘半正零一二三四五六七八九十兩0-9０-９";

const alternation = (words: readonly string[]) => words.join("|");

const COMPARATIVE = new RegExp(
  `比(?!${alternation(NOT_COMPARISON)})([^${PUNCTUATION}\\s]{1,3}?)(${alternation(ADJECTIVES)})(?=${CLAUSE_END}|${alternation(DEGREE)})`,
  "gu",
);
/** A比B高 → A高過B (the compared noun is 1–3 characters; the adjective must end the clause or take a degree word). */
export const comparative = (text: string): string => text.replace(COMPARATIVE, "$2過$1");

const PROGRESSIVE = new RegExp(`喺(${alternation(PROGRESSIVE_VERBS)})`, "gu");
/** Mandarin 在 + verb, after the phrase table's 在 → 喺: 喺食飯 → 食緊飯. */
export const progressive = (text: string): string => text.replace(PROGRESSIVE, "$1緊");

const VERB_LE = new RegExp(`(${alternation(VERBS)})了`, "gu");
const FINAL_LE = new RegExp(`了(?=${CLAUSE_END})`, "gu");
/** Mandarin 了 (the phrase table leaves it): after a verb → 咗 (食咗); ending a sentence → 喇 (落雨喇). */
export const perfective = (text: string): string => text.replace(VERB_LE, "$1咗").replace(FINAL_LE, "喇");

const FIRST = new RegExp(`(^|[^${NOT_BEFORE_FIRST}])先(${alternation(VERBS)})(?=${CLAUSE_END}|${alternation(FINAL_PARTICLES)})`, "gu");
/** 先 + a clause-final verb → verb先: 你先走 → 你走先. */
export const verbFirst = (text: string): string => text.replace(FIRST, "$1$2先");

const CLOCK_AFTER_TIME = new RegExp(`(${alternation(TIMES_OF_DAY)})一啲`, "gu");
const CLOCK_BEFORE = new RegExp(`一啲(?=[${AFTER_CLOCK_ONE}])`, "gu");
/** The phrase table's 一點 → 一啲 ("a little") is wrong in a clock time: 下晝一啲 → 下晝一點. */
export const clockTime = (text: string): string => text.replace(CLOCK_AFTER_TIME, "$1一點").replace(CLOCK_BEFORE, "一點");

/** The rules in the order applyRules runs them. */
export const RULES: readonly ((text: string) => string)[] = [comparative, progressive, perfective, verbFirst, clockTime];

export function applyRules(text: string): string {
  return RULES.reduce((result, rule) => rule(result), text);
}
