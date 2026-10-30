import { describeBadSyllable, parseLoanAwareSyllables } from "./jyutpingCell";
import type { WordshkEntry, WordshkExample, WordshkSense } from "./types";

/** The whole entry column of an entry with no content yet. */
const NO_DATA = "未有內容 NO DATA";

const SENSE_SEPARATOR = "----";
const EXPLANATION_MARKER = "<explanation>";
const EXAMPLE_MARKER = "<eg>";

/** The entry's first line: one or more "(name:value)" tags. */
const TAG_LINE = /^(\([A-Za-z]+:[^)]*\))+$/;
const TAG = /\(([A-Za-z]+):([^)]*)\)/g;
/** Tags parsed only to be dropped: synonyms, antonyms, references, images (YAGNI). */
const IGNORED_TAGS: ReadonlySet<string> = new Set(["sim", "ant", "ref", "img"]);

/** A language clause line, e.g. "yue:…", "eng:…", "zho:…"; any other line continues the previous clause. */
const CLAUSE = /^([a-z]{3}):(.*)$/;

/**
 * "#" followed by link text (up to whitespace, punctuation or another "#"), with the optional single
 * space words.hk puts before/after a link to delimit it.
 */
const LINK = /( ?)#([^\s\p{P}#]+)( ?)/gu;
const ASCII_WORD_CHAR = /[A-Za-z0-9]/;

/** Han characters: a trailing "(…)" containing any is a gloss, not Jyutping. */
const HAN = /\p{Script=Han}/u;
const LOOKS_TONED = /[a-z]+[1-6]/;
/**
 * Everything except letters, digits, "!" and whitespace separates Jyutping syllables. "!" survives
 * because a leading "!" is the loan marker (LOAN_PREFIX in jyutpingCell.ts); a trailing "!" is
 * punctuation and is removed per cell (TRAILING_BANGS).
 */
const JYUTPING_SEPARATORS = /[^\sA-Za-z0-9!]/g;
const TRAILING_BANGS = /!+$/;

/** A row-level problem that makes the whole entry unusable; the caller skips the entry. */
export class EntryError extends Error {}

/**
 * Removes words.hk #link markup: "#中華民國 初年" → "中華民國初年", "同 #啲" → "同啲". A space
 * delimiting a link is kept only when the character beyond it (before the space for a leading
 * space, after it for a trailing one) is an ASCII letter or digit: "1 #公里" → "1 公里",
 * "#手機 app" → "手機 app", but "用 #USB 線" → "用USB線".
 */
export function stripLinks(text: string): string {
  return text.replace(LINK, (match, before: string, link: string, after: string, offset: number, whole: string) => {
    const previous = whole[offset - 1];
    const next = whole[offset + match.length];
    const keepBefore = before !== "" && previous !== undefined && ASCII_WORD_CHAR.test(previous);
    const keepAfter = after !== "" && next !== undefined && ASCII_WORD_CHAR.test(next);
    return `${keepBefore ? " " : ""}${link}${keepAfter ? " " : ""}`;
  });
}

/**
 * Splits a trailing "(jyutping)" off an example line. The parenthesis counts as Jyutping only if it
 * holds no Han character and contains something toned (letters then a tone digit).
 */
export function splitJyutping(line: string): { text: string; jyutping?: string } {
  const trimmed = line.trim();
  const open = trimmed.lastIndexOf("(");
  if (!trimmed.endsWith(")") || open === -1) return { text: trimmed };
  const inner = trimmed.slice(open + 1, -1);
  if (HAN.test(inner) || !LOOKS_TONED.test(inner)) return { text: trimmed };
  return { text: trimmed.slice(0, open).trim(), jyutping: inner };
}

/** Jyutping cells of an example parenthesis: punctuation dropped, a trailing "!" is punctuation, a leading "!" a loan marker. */
function jyutpingCells(jyutping: string): string[] {
  return jyutping
    .replace(JYUTPING_SEPARATORS, " ")
    .split(/\s+/)
    .map((cell) => cell.replace(TRAILING_BANGS, ""))
    .filter((cell) => cell !== "");
}

interface ExampleBlock {
  readonly yue: string[];
  readonly zho: string[];
}

/** One example from a yue: line; an invalid Jyutping drops only the Jyutping (reported). */
function parseExample(line: string, zho: string | undefined, report: (message: string) => void): WordshkExample {
  const { text, jyutping } = splitJyutping(line);
  if (text === "") throw new EntryError(`empty yue: line in ${EXAMPLE_MARKER}`);
  const example = { yue: stripLinks(text), ...(zho !== undefined && { zho }) };
  if (jyutping === undefined) return example;
  const parsed = parseLoanAwareSyllables(jyutpingCells(jyutping));
  if (parsed.kind !== "ok") {
    report(`${describeBadSyllable(parsed)} in example Jyutping "${jyutping}"; Jyutping dropped`);
    return example;
  }
  const { syllables, loanSyllables } = parsed;
  return { ...example, jyutping: syllables, ...(loanSyllables.length > 0 && { loanSyllables }) };
}

/**
 * One sense: an optional "<explanation>" line, clause lines (exactly one yue:), then "<eg>" blocks.
 * Each yue: line in a block becomes one example; the block's zho: line (at most one) goes on each.
 * A block without a yue: line (Mandarin- or English-only) yields no example.
 */
function parseSense(lines: readonly string[], report: (message: string) => void): WordshkSense {
  let explanation: string[] | undefined;
  const blocks: ExampleBlock[] = [];
  /** What a continuation line extends: the yue: explanation, an ignored clause, or nothing it may extend. */
  let continues: "explanation" | "ignored" | "none" = "none";

  for (const [index, line] of lines.entries()) {
    if (line === EXPLANATION_MARKER && index === 0) continue;
    if (line === EXPLANATION_MARKER) throw new EntryError(`unexpected ${EXPLANATION_MARKER} inside a sense`);
    if (line === EXAMPLE_MARKER) {
      blocks.push({ yue: [], zho: [] });
      continues = "none";
      continue;
    }
    const clause = CLAUSE.exec(line);
    if (clause === null) {
      if (continues === "explanation") explanation?.push(line);
      else if (continues === "none") throw new EntryError(`unexpected line "${line}"`);
      continue;
    }
    const [, lang, text] = clause;
    const block = blocks.at(-1);
    if (block === undefined) {
      if (lang !== "yue") {
        continues = "ignored";
      } else if (explanation !== undefined) {
        throw new EntryError("two yue: explanations in one sense");
      } else {
        explanation = [text];
        continues = "explanation";
      }
    } else if (lang === "yue" || lang === "zho") {
      if (lang === "zho" && block.zho.length > 0) throw new EntryError(`two zho: lines in one ${EXAMPLE_MARKER}`);
      block[lang].push(text);
      continues = "none";
    } else {
      continues = "ignored";
    }
  }

  if (explanation === undefined) throw new EntryError("sense has no yue: explanation");
  const yue = stripLinks(explanation.join("\n").trim());
  if (yue === "") throw new EntryError("empty yue: explanation");

  const examples = blocks.flatMap((block) => {
    const zho = block.zho.length > 0 ? stripLinks(splitJyutping(block.zho[0]).text) : undefined;
    return block.yue.map((line) => parseExample(line, zho, report));
  });
  return { yue, examples };
}

/**
 * Parses a words.hk entry field (the dump's third column): a tag line such as
 * "(pos:名詞)(label:書面語)(sim:…)", then senses separated by "----" lines. pos/label tags apply to
 * the whole entry; sim/ant/ref/img are dropped. English (eng:) and other non-yue/zho clauses are
 * ignored, and #link markers are stripped from kept text.
 *
 * Throws EntryError when the markup is unusable (no content, no tag line, unknown tag, stray line,
 * sense without yue:, …). Calls `report` for a smaller dropped piece: an example Jyutping with a
 * bad syllable is dropped, the example itself is kept.
 */
export function parseEntryContent(
  content: string,
  report: (message: string) => void,
): Pick<WordshkEntry, "pos" | "labels" | "senses"> {
  if (content === NO_DATA) throw new EntryError(`no content ("${NO_DATA}")`);
  const [tagLine, ...body] = content.split(/\r?\n/);
  if (!TAG_LINE.test(tagLine)) throw new EntryError(`expected a tag line like "(pos:名詞)", got "${tagLine}"`);
  const pos: string[] = [];
  const labels: string[] = [];
  for (const [, name, value] of tagLine.matchAll(TAG)) {
    if (name === "pos") pos.push(value);
    else if (name === "label") labels.push(value);
    else if (!IGNORED_TAGS.has(name)) throw new EntryError(`unknown tag "${name}"`);
  }

  const senseLines: string[][] = [[]];
  for (const line of body) {
    if (line === SENSE_SEPARATOR) senseLines.push([]);
    else senseLines[senseLines.length - 1].push(line);
  }
  return { pos, labels, senses: senseLines.map((lines) => parseSense(lines, report)) };
}
