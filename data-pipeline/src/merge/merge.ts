// Merge: a pure function from parsed source rows to Entry objects plus the stats the build report
// prints. No I/O here; loadMergeInputs (load.ts) gathers the inputs.
import type { CharReading, KfcdRow, MandarinEquivalent, MoeEntry, ReadingRank, WordReading, WordshkEntry } from "../sources/types";
import { isSingleCodePoint } from "../sources/codePoints";
import { throwIfProblems, type Problem } from "../sources/problems";
import { FREQ_OVERRIDES } from "./freqOverrides";
import { headwordKey, toSimplified } from "./normalize";
import { CANTONESE_KEEP, NON_BMP_KEEP } from "./simplifiedKeep";
import type { Definition, Entry, EntryReading, Example, MandarinItem, MergeInputs, MergeResult, MergeStats, RowSource, WordCount } from "./types";

/**
 * Reading sources in priority order: rime > LSHK > Unihan for characters (spec §4.1), then words.hk
 * (its list before its dump). Word readings come from rime words, the list and dump headwords, in
 * that order; a one-character words.hk headword adds to its character entry.
 */
const READING_SOURCE_PRIORITY: readonly RowSource[] = ["rime", "lshk", "unihan", "wordshk-list", "wordshk-dump"];

/** Sources whose spelling is displayed, in preference order: words.hk (HK forms), then rime, then the others. */
const DISPLAY_SOURCE_PRIORITY: readonly RowSource[] = ["wordshk-dump", "wordshk-list", "rime", "lshk", "unihan"];

/** How many items report samples list. */
export const STATS_SAMPLE_SIZE = 20;

/** Readings sort by rank in this order within a source; unranked readings come last. */
const RANK_ORDER: readonly ReadingRank[] = ["default", "common", "rare", "obsolete", "variant"];

/**
 * A full-width parenthetical in a Kaifangcidian Mandarin item: a register label such as （婉）
 * (euphemism) in （婉）性交, or an object hint such as （房子） in 蓋（房子）. Neither is part of the
 * Mandarin word, so it is removed (KFCD is CC BY, not ND, so cleaning is allowed).
 */
const KFCD_ANNOTATION = /（[^）]*）/g;

/** Joins a words.hk entry's several parts of speech (動詞、名詞), as MoE's own combined values do (代、介). */
const POS_SEPARATOR = "、";

/** The optional source a build can run without. */
const WORDSHK_DUMP_SOURCE: RowSource = "wordshk-dump";

/**
 * An ideographic description character (U+2FF0–U+2FFF): Wiktionary spells a character Unicode
 * lacks as its description (⿰血聿, the Mandarin word it pairs with 淋巴), which is no word to show.
 */
const IDEOGRAPHIC_DESCRIPTION = /[\u2FF0-\u2FFF]/u;

/** MoE's names for a reading other than the sense's own: 又音 (alternative), 讀音 (literary), 語音 (colloquial). */
const READING_NOTE = "(?:又音|讀音|語音)";

/**
 * A definition that is nothing but a pointer at another reading: an optional sense number ("(一)",
 * "(一)1.2.", "1、2、4"), then 之 or 的 and the reading note: "(一)之又音。", "1、2、4的語音。".
 */
const WHOLE_DEFINITION_READING_NOTE = new RegExp(`^(?:\\([一二三四五六七八九十]+\\))?[\\d、.]*[之的]${READING_NOTE}。$`);

/** One sentence ending in "的又音/讀音/語音。": "雙棒兒的雙的語音。" (the reading of 雙 in 雙棒兒). */
const ONE_SENTENCE_READING_NOTE = new RegExp(`^[^。]*的${READING_NOTE}。$`);

/** Code-unit order: deterministic and locale-independent. */
const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const rankIndex = (rank: ReadingRank | undefined): number => (rank === undefined ? RANK_ORDER.length : RANK_ORDER.indexOf(rank));

/** A reading as one source gives it, before de-duplication. */
interface ReadingCandidate {
  readonly jyutping: string;
  readonly rank?: ReadingRank;
  readonly source: RowSource;
  readonly loan?: readonly number[];
}

/**
 * A Kaifangcidian Mandarin item without its （…） annotations (（婉）性交 → 性交, 蓋（房子） → 蓋), or ""
 * when nothing else is left. "…" placeholders are kept (see isKfcdFragment for the items dropped).
 */
export function cleanKfcdItem(item: string): string {
  return item.replace(KFCD_ANNOTATION, "").trim();
}

/** Kaifangcidian's placeholder for the words a Mandarin pattern leaves open (又…又…). */
const KFCD_PLACEHOLDER = "…";

/** A "…" item needs this many characters besides the placeholders to mean something on its own. */
const KFCD_PATTERN_MIN_WORD_LENGTH = 2;

/**
 * True for a Kaifangcidian "…" item that is a bare fragment: fewer than two characters left once
 * the placeholders are removed (…子 and …人 for 佬, 老… for 生晒, 就… for 咪). Such an affix means
 * nothing without the words that fill the gap, and each of these rows has a plain equivalent too
 * (佬: 男人, 漢子). Items with two or more characters are kept, on one side of the gap or both:
 * 又…又… (兼夾), 就…吧 (一於), 在…之間 (介乎), 不太… (唔係幾); there the words are the meaning.
 * The rule drops 7 of Kaifangcidian's 68 "…" items. An item without "…" is never a fragment.
 */
export function isKfcdFragment(item: string): boolean {
  if (!item.includes(KFCD_PLACEHOLDER)) return false;
  return [...item.replaceAll(KFCD_PLACEHOLDER, "")].length < KFCD_PATTERN_MIN_WORD_LENGTH;
}

/**
 * True for an MoE definition that only makes sense next to its reading, which canto.db does not
 * store: a whole-definition pointer ("(一)之又音。", by far the commonest form), or, for a
 * one-character headword, a one-sentence note on the character's reading inside a word
 * ("雙棒兒的雙的語音。"). Multi-character headwords are exempt from the second form because their
 * real definitions can end that way (口音: "帶有各民族或地方特色的語音。"), as is any definition with
 * more than one sentence (後人: "後代的子孫。即(一)1.的語音。"). MoeSense.heteronym is no help: the
 * pointer sits under heteronym 0 as often as not (我: "(一)之讀音。").
 */
export function isReadingCrossReference(word: string, def: string): boolean {
  return WHOLE_DEFINITION_READING_NOTE.test(def) || (isSingleCodePoint(word) && ONE_SENTENCE_READING_NOTE.test(def));
}

/** A Kaifangcidian row reduced to what merge keeps: cleaned Mandarin items and a content sort key. */
interface KfcdAttachment {
  /** Syllables, then the raw items: rows repeated per sense sort the same whatever the input order. */
  readonly sortKey: string;
  readonly mandarin: readonly MandarinEquivalent[];
}

/** Everything gathered for one key before it becomes an Entry. */
class EntryBuilder {
  /** Each spelling the sources use for this key, with the sources that use it. */
  readonly spellings = new Map<string, Set<RowSource>>();
  readonly readings: ReadingCandidate[] = [];
  /** The lowest words.hk dump entry id that uses each dump spelling (the display tie-break). */
  readonly firstDumpId = new Map<string, number>();
  readonly kfcd: KfcdAttachment[] = [];
  /** Mandarin words Wiktionary gives this entry as a Cantonese form of (reversed pairs). */
  readonly wiktionary: string[] = [];
  /** words.hk dump entries with a headword of this key, by id (a dump entry can list two spellings of one key). */
  readonly dumpEntries = new Map<number, WordshkEntry>();
  readonly moe: MoeEntry[] = [];
  /** words.hk variant forms linked to this entry by a dump entry's variants (㨂 for 揀). */
  readonly variantAliases = new Set<string>();

  constructor(readonly key: string) {}

  addSpelling(spelling: string, source: RowSource): void {
    let sources = this.spellings.get(spelling);
    if (sources === undefined) this.spellings.set(spelling, (sources = new Set()));
    sources.add(source);
  }

  spelledBy(source: RowSource): string[] {
    return [...this.spellings].filter(([, sources]) => sources.has(source)).map(([spelling]) => spelling).sort(byCodeUnits);
  }
}

/**
 * Readings de-duplicated by Jyutping in priority order. Sources come in READING_SOURCE_PRIORITY
 * order and, within a source, by rank then Jyutping, so input order never matters. A character rime
 * covers keeps rime's ranks, and another source's reading rime lacks becomes "variant"; a character
 * rime lacks gets unranked readings. Nothing is ever promoted to default.
 */
function finishReadings(builder: EntryBuilder): EntryReading[] {
  const rimeCovers = builder.readings.some((r) => r.source === "rime");
  const ordered = [...builder.readings].sort(
    (a, b) =>
      READING_SOURCE_PRIORITY.indexOf(a.source) - READING_SOURCE_PRIORITY.indexOf(b.source) ||
      rankIndex(a.rank) - rankIndex(b.rank) ||
      byCodeUnits(a.jyutping, b.jyutping),
  );
  const isChar = isSingleCodePoint(builder.key);
  const kept = new Map<string, { reading: EntryReading; loan: Set<number> }>();
  for (const candidate of ordered) {
    const loan = kept.get(candidate.jyutping)?.loan ?? new Set<number>();
    // A loan mark from any source applies to those syllables wherever they appear.
    for (const index of candidate.loan ?? []) loan.add(index);
    if (kept.has(candidate.jyutping)) continue;
    const rank = candidate.source === "rime" ? candidate.rank : isChar && rimeCovers ? "variant" : undefined;
    kept.set(candidate.jyutping, {
      reading: { jyutping: candidate.jyutping, ...(rank !== undefined && { rank }), source: candidate.source },
      loan,
    });
  }
  return [...kept.values()].map(({ reading, loan }) =>
    loan.size === 0 ? reading : { ...reading, loan: [...loan].sort((a, b) => a - b) },
  );
}

/**
 * The displayed traditional headword: a words.hk spelling when there is one (a dump headword before
 * a list word, the lowest dump id first), else rime's, else LSHK's or Unihan's; ties go to code-unit order.
 */
function chooseTrad(builder: EntryBuilder): string {
  for (const source of DISPLAY_SOURCE_PRIORITY) {
    const spellings = builder.spelledBy(source);
    if (source === "wordshk-dump") {
      spellings.sort((a, b) => builder.firstDumpId.get(a)! - builder.firstDumpId.get(b)! || byCodeUnits(a, b));
    }
    if (spellings.length > 0) return spellings[0];
  }
  throw new Error(`merge: entry ${builder.key} has no spelling from an entry-creating source`);
}

/**
 * Mandarin items: Kaifangcidian's (rows in content order, items in row order), then Wiktionary's
 * (in code-unit order), de-duplicated on (trad, simp) with their sources merged. Wiktionary gives
 * traditional only (Taiwan forms such as 著涼), so its simplified form comes from OpenCC tw→cn.
 */
function finishMandarin(builder: EntryBuilder): MandarinItem[] {
  const items = new Map<string, { trad: string; simp: string; sources: RowSource[] }>();
  const add = (trad: string, simp: string, source: RowSource): void => {
    const pairKey = `${trad}\t${simp}`;
    let item = items.get(pairKey);
    if (item === undefined) items.set(pairKey, (item = { trad, simp, sources: [] }));
    if (!item.sources.includes(source)) item.sources.push(source);
  };
  for (const row of [...builder.kfcd].sort((a, b) => byCodeUnits(a.sortKey, b.sortKey))) {
    for (const { trad, simp } of row.mandarin) add(trad, simp, "kaifangcidian");
  }
  for (const word of [...builder.wiktionary].sort(byCodeUnits)) add(word, toSimplified(word, "tw"), "wiktionary");
  return [...items.values()];
}

/**
 * The MoE entry for a key: MoE headwords are unique, but variant spellings fold together (剛才 and
 * 剛纔 are both MoE headwords). Prefer the displayed spelling, then another entry-creating
 * source's spelling, then code-unit order.
 */
function chooseMoe(builder: EntryBuilder, trad: string): MoeEntry | undefined {
  const spelledByCreator = (word: string): boolean => [...(builder.spellings.get(word) ?? [])].some((s) => DISPLAY_SOURCE_PRIORITY.includes(s));
  const rank = (e: MoeEntry): number => (e.word === trad ? 0 : spelledByCreator(e.word) ? 1 : 2);
  return [...builder.moe].sort((a, b) => rank(a) - rank(b) || byCodeUnits(a.word, b.word))[0];
}

interface MoeDropStats {
  sensesDropped: number;
  readonly droppedSample: { word: string; def: string }[];
}

/**
 * words.hk senses (yue) from the entry's dump entries in id order, then the chosen MoE entry's senses
 * (zho) minus reading cross-references; `sense` counts from 1 per source. Each text keeps its
 * verbatim traditional form plus a simplified copy. Examples follow their words.hk sense.
 */
function finishDefinitions(builder: EntryBuilder, moe: MoeEntry | undefined, drops: MoeDropStats): { definitions: Definition[]; examples: Example[] } {
  const definitions: Definition[] = [];
  const examples: Example[] = [];
  let sense = 0;
  for (const dumpEntry of [...builder.dumpEntries.values()].sort((a, b) => a.id - b.id)) {
    const pos = dumpEntry.pos.length > 0 ? dumpEntry.pos.join(POS_SEPARATOR) : undefined;
    for (const { yue, examples: senseExamples } of dumpEntry.senses) {
      sense++;
      definitions.push({ sense, ...(pos !== undefined && { pos }), yue, yueSimp: toSimplified(yue, "hk"), source: WORDSHK_DUMP_SOURCE });
      for (const example of senseExamples) {
        examples.push({
          sense,
          yueTrad: example.yue,
          yueSimp: toSimplified(example.yue, "hk"),
          ...(example.jyutping !== undefined && { jyutping: example.jyutping.join(" ") }),
          ...(example.loanSyllables !== undefined && example.loanSyllables.length > 0 && { loan: example.loanSyllables }),
          ...(example.zho !== undefined && { zho: example.zho, zhoSimp: toSimplified(example.zho, "hk") }),
          source: WORDSHK_DUMP_SOURCE,
        });
      }
    }
  }
  let moeSense = 0;
  for (const { pos, def } of moe?.senses ?? []) {
    const word = moe!.word;
    if (isReadingCrossReference(word, def)) {
      drops.sensesDropped++;
      if (drops.droppedSample.length < STATS_SAMPLE_SIZE) drops.droppedSample.push({ word, def });
      continue;
    }
    moeSense++;
    definitions.push({ sense: moeSense, ...(pos !== undefined && { pos }), zho: def, zhoSimp: toSimplified(def, "tw"), source: "moe" });
  }
  return { definitions, examples };
}

/** What an entry's frequency rests on: an essay weight, an override, or nothing. */
interface Weight {
  readonly weight?: number;
  /** The override word used, and the essay weight it replaced, if any. */
  readonly override?: { readonly word: string; readonly essayWeight?: number };
}

/**
 * The entry's weight: the displayed trad first, then rime's spellings of the key (the essay is
 * rime's and keeps its spellings), then the other sources' spellings, all in code-unit order. When
 * none of these has a weight, the heaviest essay word with the entry's key stands in: the essay
 * spells many words in a form no source uses (張床 for 張牀, 族羣 for 族群). An override
 * (freqOverrides.ts) for any of the entry's spellings wins over the essay.
 */
function findWeight(
  builder: EntryBuilder,
  trad: string,
  weights: ReadonlyMap<string, number>,
  keyWeights: ReadonlyMap<string, number>,
  overrides: ReadonlyMap<string, number>,
): Weight {
  const rime = builder.spelledBy("rime");
  const others = [...builder.spellings.keys()].filter((s) => !rime.includes(s)).sort(byCodeUnits);
  const candidates = [...new Set([trad, ...rime, ...others])];
  const essayWeight = candidates.map((s) => weights.get(s)).find((w) => w !== undefined) ?? keyWeights.get(builder.key);
  const overrideWord = candidates.find((s) => overrides.has(s));
  if (overrideWord !== undefined) {
    return { weight: overrides.get(overrideWord), override: { word: overrideWord, ...(essayWeight !== undefined && { essayWeight }) } };
  }
  return { weight: essayWeight };
}

/** The heaviest essay weight per headword key, for words the essay spells another way. */
function weightsByKey(essay: MergeInputs["essay"]): Map<string, number> {
  const byKey = new Map<string, number>();
  for (const { word, weight } of essay) {
    const key = headwordKey(word);
    byKey.set(key, Math.max(weight, byKey.get(key) ?? weight));
  }
  return byKey;
}

/** Adds one to `counts[source]`. */
function count<K extends string>(counts: Partial<Record<K, number>>, source: K): void {
  counts[source] = (counts[source] ?? 0) + 1;
}

const kfcdSortKey = (row: KfcdRow): string =>
  [row.syllables.join(" "), ...row.mandarin.map(({ trad, simp }) => `${trad}/${simp}`)].join("\t");

/** The words with an essay weight, heaviest first (ties in code-unit order), at most STATS_SAMPLE_SIZE. */
function mostFrequent(words: Iterable<string>, weights: ReadonlyMap<string, number>): WordCount[] {
  return [...words]
    .flatMap((word) => {
      const weight = weights.get(word);
      return weight === undefined ? [] : [{ word, count: weight }];
    })
    .sort((a, b) => b.count - a.count || byCodeUnits(a.word, b.word))
    .slice(0, STATS_SAMPLE_SIZE);
}

/**
 * Structural problems in the inputs: what the parsers guarantee and merge relies on (a char row is
 * one code point; dump ids, MoE headwords and essay words are unique). Positions are 1-based
 * indexes into the named input array.
 */
function inputProblems(inputs: MergeInputs): Problem[] {
  const problems: Problem[] = [];
  const at = (index: number, message: string): void => {
    problems.push({ line: index + 1, unit: "entry", message });
  };
  for (const name of ["rimeChars", "lshk", "unihan"] as const) {
    inputs[name].forEach((row, i) => {
      if (!isSingleCodePoint(row.char)) at(i, `${name}: character must be one code point: "${row.char}"`);
    });
  }
  const duplicates = <T>(name: string, rows: readonly T[], id: (row: T) => string | number, what: string): void => {
    const seen = new Set<string | number>();
    rows.forEach((row, i) => {
      if (seen.has(id(row))) at(i, `${name}: duplicate ${what} ${id(row)}`);
      seen.add(id(row));
    });
  };
  duplicates("wordshkDump", inputs.wordshkDump ?? [], (e) => e.id, "words.hk dump id");
  duplicates("moe", inputs.moe, (e) => e.word, "MoE headword");
  duplicates("essay", inputs.essay, (e) => e.word, "essay word");
  return problems;
}

export function merge(inputs: MergeInputs): MergeResult {
  throwIfProblems("merge inputs", inputProblems(inputs));
  const builders = new Map<string, EntryBuilder>();
  const builderFor = (key: string): EntryBuilder => {
    let builder = builders.get(key);
    if (builder === undefined) builders.set(key, (builder = new EntryBuilder(key)));
    return builder;
  };

  const charSources: [RowSource, readonly CharReading[]][] = [
    ["rime", inputs.rimeChars],
    ["lshk", inputs.lshk],
    ["unihan", inputs.unihan],
  ];
  for (const [source, rows] of charSources) {
    for (const row of rows) {
      const builder = builderFor(headwordKey(row.char));
      builder.addSpelling(row.char, source);
      builder.readings.push({ jyutping: row.jyutping, rank: row.rank, source });
    }
  }

  const addWordReading = (row: Pick<WordReading, "word" | "syllables" | "loanSyllables">, source: RowSource): EntryBuilder => {
    const builder = builderFor(headwordKey(row.word));
    builder.addSpelling(row.word, source);
    builder.readings.push({
      jyutping: row.syllables.join(" "),
      source,
      ...(row.loanSyllables !== undefined && { loan: row.loanSyllables }),
    });
    return builder;
  };
  for (const row of inputs.rimeWords) addWordReading(row, "rime");
  // variantForm rows (㨂 for 揀) never become headwords; they fold in as aliases through dump links.
  for (const row of inputs.wordshkList) if (row.variantForm !== true) addWordReading(row, "wordshk-list");
  for (const dumpEntry of inputs.wordshkDump ?? []) {
    for (const headword of dumpEntry.headwords) {
      const builder = addWordReading(headword, "wordshk-dump");
      builder.dumpEntries.set(dumpEntry.id, dumpEntry);
      const first = builder.firstDumpId.get(headword.word);
      if (first === undefined || dumpEntry.id < first) builder.firstDumpId.set(headword.word, dumpEntry.id);
    }
  }

  // words.hk variant forms fold in only through public dump links: OpenCC does not fold 異體字 (㨂→揀).
  let aliasesFromLinks = 0;
  const linkedVariants = new Set<string>();
  for (const dumpEntry of inputs.wordshkDump ?? []) {
    for (const variant of dumpEntry.variants) {
      linkedVariants.add(variant);
      for (const key of new Set(dumpEntry.headwords.map((h) => headwordKey(h.word)))) {
        const aliases = builders.get(key)!.variantAliases;
        if (!aliases.has(variant)) aliasesFromLinks++;
        aliases.add(variant);
      }
    }
  }
  const variantRows = inputs.wordshkList.filter((row) => row.variantForm === true);
  const droppedVariantRows = variantRows.filter((row) => !linkedVariants.has(row.word));
  const droppedVariantWords = new Set(droppedVariantRows.map((row) => row.word));

  // Attach-only sources: they add to existing entries and never create one.
  const weights = new Map(inputs.essay.map(({ word, weight }) => [word, weight]));
  const kfcdStats = { annotationsRemoved: 0, emptyItemsDropped: 0, fragmentsDropped: 0 };
  let kfcdUnmatchedRows = 0;
  const kfcdUnmatchedWords = new Set<string>();
  for (const row of inputs.kaifangcidian) {
    const mandarin: MandarinEquivalent[] = [];
    for (const item of row.mandarin) {
      const trad = cleanKfcdItem(item.trad);
      const simp = cleanKfcdItem(item.simp);
      if (trad !== item.trad || simp !== item.simp) kfcdStats.annotationsRemoved++;
      if (trad === "" || simp === "") kfcdStats.emptyItemsDropped++;
      else if (isKfcdFragment(trad) || isKfcdFragment(simp)) kfcdStats.fragmentsDropped++;
      else mandarin.push({ trad, simp });
    }
    const builder = builders.get(headwordKey(row.word));
    if (builder === undefined) {
      kfcdUnmatchedRows++;
      kfcdUnmatchedWords.add(row.word);
      continue;
    }
    builder.addSpelling(row.word, "kaifangcidian");
    builder.kfcd.push({ sortKey: kfcdSortKey(row), mandarin });
  }

  const wiktStats = { notedFormsSkipped: 0, identityPairsSkipped: 0, describedFormsSkipped: 0 };
  const wiktUnmatchedForms = new Set<string>();
  for (const pair of inputs.wiktionary) {
    const mandarinKey = headwordKey(pair.mandarin);
    for (const { form, note } of pair.cantonese) {
      if (IDEOGRAPHIC_DESCRIPTION.test(pair.mandarin) || IDEOGRAPHIC_DESCRIPTION.test(form)) {
        wiktStats.describedFormsSkipped++;
        continue;
      }
      if (note !== undefined) {
        wiktStats.notedFormsSkipped++;
        continue;
      }
      const key = headwordKey(form);
      if (key === mandarinKey) {
        wiktStats.identityPairsSkipped++;
        continue;
      }
      const builder = builders.get(key);
      if (builder === undefined) {
        wiktUnmatchedForms.add(form);
        continue;
      }
      builder.addSpelling(form, "wiktionary");
      builder.wiktionary.push(pair.mandarin);
    }
  }

  let moeUnmatched = 0;
  for (const moeEntry of inputs.moe) {
    const builder = builders.get(headwordKey(moeEntry.word));
    if (builder === undefined) {
      moeUnmatched++;
      continue;
    }
    builder.addSpelling(moeEntry.word, "moe");
    builder.moe.push(moeEntry);
  }

  const keyWeights = weightsByKey(inputs.essay);
  const overrides = new Map(FREQ_OVERRIDES.map(({ word, weight }) => [word, weight]));
  const overridesUsed: { word: string; weight: number; essayWeight?: number }[] = [];
  const readingCounts: Partial<Record<RowSource, number>> = {};
  const definitionCounts: Partial<Record<RowSource, number>> = {};
  const exampleCounts: Partial<Record<RowSource, number>> = {};
  const moeDrops: MoeDropStats = { sensesDropped: 0, droppedSample: [] };
  let moeShadowed = 0;
  const mandarinCounts: Partial<Record<RowSource, number>> = {};
  const collisions: { key: string; spellings: string[] }[] = [];
  const entries: Entry[] = [...builders.values()]
    .sort((a, b) => byCodeUnits(a.key, b.key))
    .map((builder) => {
      const trad = chooseTrad(builder);
      const spellings = [...builder.spellings.keys()].sort(byCodeUnits);
      if (spellings.length > 1) collisions.push({ key: builder.key, spellings });
      const aliases = [...new Set([...spellings, ...builder.variantAliases])].filter((s) => s !== trad).sort(byCodeUnits);
      const readings = finishReadings(builder);
      for (const r of readings) count(readingCounts, r.source);
      const mandarin = finishMandarin(builder);
      for (const item of mandarin) for (const source of item.sources) count(mandarinCounts, source);
      if (builder.moe.length > 1) moeShadowed += builder.moe.length - 1;
      const { definitions, examples } = finishDefinitions(builder, chooseMoe(builder, trad), moeDrops);
      for (const d of definitions) count(definitionCounts, d.source);
      for (const e of examples) count(exampleCounts, e.source);
      const { weight, override } = findWeight(builder, trad, weights, keyWeights, overrides);
      if (override !== undefined) overridesUsed.push({ word: override.word, weight: weight!, ...(override.essayWeight !== undefined && { essayWeight: override.essayWeight }) });
      return {
        key: builder.key,
        trad,
        simp: toSimplified(trad, "hk"),
        kind: isSingleCodePoint(trad) ? "char" : "word",
        freq: weight === undefined ? 0 : Math.log10(1 + weight),
        aliases,
        readings,
        mandarin,
        definitions,
        examples,
      } satisfies Entry;
    });

  const stats: MergeStats = {
    omitted: inputs.wordshkDump === undefined ? [WORDSHK_DUMP_SOURCE] : [],
    entries: { char: entries.filter((e) => e.kind === "char").length, word: entries.filter((e) => e.kind === "word").length },
    rows: { readings: readingCounts, mandarin: mandarinCounts, definitions: definitionCounts, examples: exampleCounts },
    unmatched: {
      kaifangcidianRows: kfcdUnmatchedRows,
      kaifangcidianWords: kfcdUnmatchedWords.size,
      kaifangcidianFrequent: mostFrequent(kfcdUnmatchedWords, weights),
      wiktionaryForms: wiktUnmatchedForms.size,
      moeEntries: moeUnmatched,
    },
    keyCollisions: { keysWithSeveralSpellings: collisions.length, sample: collisions.slice(0, STATS_SAMPLE_SIZE) },
    variants: {
      listRows: variantRows.length,
      listWords: new Set(variantRows.map((row) => row.word)).size,
      linkedWords: new Set(variantRows.filter((row) => linkedVariants.has(row.word)).map((row) => row.word)).size,
      droppedRows: droppedVariantRows.length,
      droppedWords: droppedVariantWords.size,
      droppedButKeyMatched: [...droppedVariantWords].filter((word) => builders.has(headwordKey(word))).length,
      aliasesFromLinks,
    },
    kaifangcidian: kfcdStats,
    wiktionary: wiktStats,
    moe: { ...moeDrops, shadowedEntries: moeShadowed },
    simplifiedKeep: { cantonese: CANTONESE_KEEP, nonBmp: NON_BMP_KEEP },
    freq: {
      entriesWithFreq: entries.filter((e) => e.freq > 0).length,
      overridesUsed: overridesUsed.sort((a, b) => byCodeUnits(a.word, b.word)),
      overridesUnused: [...overrides.keys()].filter((word) => !overridesUsed.some((used) => used.word === word)).sort(byCodeUnits),
    },
  };
  return { entries, stats };
}
