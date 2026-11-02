// The offline translator's phrase table (spec §4.5): reversed Kaifangcidian and Wiktionary pairs plus
// the curated list, one Cantonese replacement per Mandarin key. Source rows are copied from the pinned sources.
import Database from "better-sqlite3";
import OpenCC from "opencc-js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPhraseTable, type PhraseRow } from "../src/build/phraseTable";
import { writeDb } from "../src/build/writeDb";
import { headwordKey } from "../src/merge/normalize";
import type { Entry } from "../src/merge/types";
import type { DialSynPair, KfcdRow } from "../src/sources/types";
import { CURATED_PAIRS, type CuratedPair } from "../../src/translate/offline/curated";

/** The app's toTrad (src/translate/script.ts): phrase_map keys must be what it produces. */
const toTrad = OpenCC.Converter({ from: "cn", to: "t" });

/** A minimal entry: only the key, the displayed spelling and the frequency matter here. */
const entry = (trad: string, freq = 0, key = headwordKey(trad)): Entry => ({
  key,
  trad,
  simp: trad,
  kind: [...trad].length === 1 ? "char" : "word",
  freq,
  aliases: [],
  readings: [],
  mandarin: [],
  definitions: [],
  examples: [],
});

const kfcd = (word: string, mandarin: readonly (readonly [trad: string, simp: string])[]): KfcdRow => ({
  word,
  wordSimp: word,
  syllables: [],
  mandarin: mandarin.map(([trad, simp]) => ({ trad, simp })),
});

const KFCD_MOUJAU = kfcd("冇有", [["沒有", "没有"]]);
const KFCD_NIDOU = kfcd("呢度", [["這邊", "这边"], ["這兒", "这儿"], ["這裡", "这里"], ["這面", "这面"], ["這個地方", "这个地方"]]);
const KFCD_GIMGAAP = kfcd("兼夾", [["而且", "而且"], ["加上", "加上"], ["並且", "并且"], ["再加", "再加"], ["又…又…", "又…又…"]]);
const KFCD_JATJYU = kfcd("一於", [["堅決", "坚决"], ["一定要", "一定要"], ["怎麼也", "怎么也"], ["說定了", "说定了"], ["就…吧", "就…吧"]]);
const KFCD_NISYU = kfcd("呢處", [["這邊", "这边"], ["這兒", "这儿"], ["這裡", "这里"], ["這面", "这面"], ["這個地方", "这个地方"]]);
const KFCD_ZUNGJI = kfcd("鍾意", [["喜歡", "喜欢"]]);

const WIKT_MEIYOU: DialSynPair = { mandarin: "沒有", cantonese: [{ form: "冇" }, { form: "冇有" }] };
const WIKT_ZELI: DialSynPair = { mandarin: "這裡", cantonese: [{ form: "呢度" }, { form: "呢處" }, { form: "依度" }, { form: "依處" }] };
const WIKT_ZHAOLIANG: DialSynPair = { mandarin: "著涼", cantonese: [{ form: "冷嚫" }, { form: "凍嚫" }] };
const WIKT_KUNNAN: DialSynPair = { mandarin: "困難", cantonese: [{ form: "難" }, { form: "惡", note: "†" }] };
const WIKT_DIK: DialSynPair = { mandarin: "的", cantonese: [{ form: "嘅", note: "†" }] };
const WIKT_XIEXIE: DialSynPair = { mandarin: "謝謝", cantonese: [{ form: "唔該", note: "†" }, { form: "多謝", note: "§" }, { form: "thank you" }] };
const WIKT_BENCHI: DialSynPair = { mandarin: "奔馳", cantonese: [{ form: "平治", note: "formal" }, { form: "Benz" }] };
const WIKT_TUSHUGUAN: DialSynPair = { mandarin: "圖書館", cantonese: [{ form: "圖書館" }, { form: "拉把" }, { form: "拉記" }] };
const WIKT_TU: DialSynPair = { mandarin: "土", cantonese: [{ form: "泥" }] };

const NO_CURATED: readonly CuratedPair[] = [];

/** buildPhraseTable's rows as "mandarin → cantonese (source)" strings, for readable expectations. */
function table(...args: Parameters<typeof buildPhraseTable>): string[] {
  return buildPhraseTable(...args).rows.map((r) => `${r.mandarinTrad} → ${r.cantoneseTrad} (${r.source})`);
}

describe("buildPhraseTable", () => {
  it("adds reversed Kaifangcidian and Wiktionary pairs, keyed by Mandarin", () => {
    expect(table({ kaifangcidian: [KFCD_ZUNGJI], wiktionary: [WIKT_ZHAOLIANG] }, [], NO_CURATED)).toEqual([
      "喜歡 → 鍾意 (kaifangcidian)",
      "着涼 → 冷嚫 (wiktionary)",
    ]);
  });

  it("lets curated pairs win over both sources, and Wiktionary over Kaifangcidian", () => {
    const sources = { kaifangcidian: [KFCD_MOUJAU, KFCD_NIDOU], wiktionary: [WIKT_MEIYOU, WIKT_ZELI] };
    expect(table(sources, [], NO_CURATED)).toEqual(expect.arrayContaining(["沒有 → 冇 (wiktionary)", "這裏 → 呢度 (wiktionary)"]));
    const curated: CuratedPair[] = [["没有", "冇"], ["这里", "呢處"]];
    expect(table(sources, [], curated)).toEqual(expect.arrayContaining(["沒有 → 冇 (curated)", "這裏 → 呢處 (curated)"]));
  });

  it("keys every source by OpenCC cn→t of the simplified Mandarin, the app's toTrad", () => {
    // Kaifangcidian 這裡 (simplified 这里) and Wiktionary's Taiwan form 著涼 both get toTrad's spelling.
    const rows = buildPhraseTable({ kaifangcidian: [KFCD_NIDOU], wiktionary: [WIKT_ZHAOLIANG] }, [], [["什么", "乜嘢"]]).rows;
    const keys = rows.map((r) => r.mandarinTrad);
    expect(keys).toEqual(expect.arrayContaining([toTrad("这里"), toTrad("着凉"), toTrad("什么")]));
    expect(keys).toEqual(expect.arrayContaining(["這裏", "着涼", "什麼"]));
    expect(keys).not.toContain("這裡");
    expect(keys).not.toContain("著涼");
  });

  it("uses only Wiktionary Cantonese forms without a usage note: any note excludes the form", () => {
    // 的 → 嘅:† (a per-table footnote symbol) gives nothing; 困難 skips 惡:† but keeps 難.
    expect(table({ kaifangcidian: [], wiktionary: [WIKT_DIK, WIKT_KUNNAN] }, [], NO_CURATED)).toEqual(["困難 → 難 (wiktionary)"]);
    // A form with a note never wins, even when listed first: the first form without a note does (稀框框 here, 罉 in 鍋's table).
    const firstNoted: DialSynPair = { mandarin: "稀溜溜", cantonese: [{ form: "稀寥寥", note: "↓" }, { form: "稀冧冧", note: "↓" }, { form: "稀框框" }] };
    expect(table({ kaifangcidian: [], wiktionary: [firstNoted] }, [], NO_CURATED)).toEqual(["稀溜溜 → 稀框框 (wiktionary)"]);
    const { stats } = buildPhraseTable({ kaifangcidian: [], wiktionary: [WIKT_DIK, WIKT_KUNNAN, firstNoted] }, [], NO_CURATED);
    expect(stats.wiktionaryNotedForms).toBe(4);
  });

  it("never uses Kaifangcidian items containing … (patterns like 又…又…)", () => {
    const rows = buildPhraseTable({ kaifangcidian: [KFCD_GIMGAAP, KFCD_JATJYU], wiktionary: [] }, [], NO_CURATED).rows;
    expect(rows.filter((r) => r.mandarinTrad.includes("…") || r.cantoneseTrad.includes("…"))).toEqual([]);
    expect(rows.map((r) => r.mandarinTrad)).toEqual(["一定要", "並且", "再加", "加上", "堅決", "怎麼也", "而且", "說定了"]);
    expect(buildPhraseTable({ kaifangcidian: [KFCD_GIMGAAP, KFCD_JATJYU], wiktionary: [] }, [], NO_CURATED).stats.kaifangcidianPatternItems).toBe(2);
  });

  it("never uses Wiktionary forms or Mandarin words containing … either", () => {
    const gaosu: DialSynPair = { mandarin: "告訴", cantonese: [{ form: "話……知" }, { form: "話畀……知" }] };
    const yu: DialSynPair = { mandarin: "愈……愈……", cantonese: [{ form: "越……越……" }] };
    const { rows, stats } = buildPhraseTable({ kaifangcidian: [], wiktionary: [gaosu, yu] }, [], NO_CURATED);
    expect(rows).toEqual([]);
    expect(stats.wiktionaryPatternForms).toBe(3);
  });

  it("skips Cantonese forms without a Han character (thank you, Benz)", () => {
    expect(table({ kaifangcidian: [], wiktionary: [WIKT_XIEXIE, WIKT_BENCHI] }, [], NO_CURATED)).toEqual([]);
  });

  it("takes single-character Mandarin keys from the curated list only", () => {
    // 土 → 泥 would turn 土地 into 泥地; 是 → 係 is curated.
    const wiktShi: DialSynPair = { mandarin: "是", cantonese: [{ form: "係" }] };
    expect(table({ kaifangcidian: [], wiktionary: [WIKT_TU, wiktShi] }, [], [["是", "係"]])).toEqual(["是 → 係 (curated)"]);
    expect(buildPhraseTable({ kaifangcidian: [], wiktionary: [WIKT_TU, wiktShi] }, [], NO_CURATED).stats.singleCharacterKeys).toBe(2);
  });

  it("drops Kaifangcidian's one-character answers to longer Mandarin keys, but not Wiktionary's", () => {
    // 山 for 海島 and 卡 for 火車車廂 are senses of very general words; 火車卡 says it in full.
    const shan = kfcd("山", [["島", "岛"], ["海島", "海岛"], ["島嶼", "岛屿"]]);
    const kaa = kfcd("卡", [["車廂", "车厢"], ["車皮", "车皮"], ["火車車廂", "火车车厢"]]);
    const fochekaa = kfcd("火車卡", [["車廂", "车厢"], ["車皮", "车皮"], ["火車車廂", "火车车厢"]]);
    const dongxi: DialSynPair = { mandarin: "東西", cantonese: [{ form: "嘢" }] };
    const { rows, stats } = buildPhraseTable({ kaifangcidian: [shan, kaa, fochekaa], wiktionary: [dongxi] }, [], NO_CURATED);
    expect(rows.map((r) => `${r.mandarinTrad} → ${r.cantoneseTrad} (${r.source})`)).toEqual([
      "東西 → 嘢 (wiktionary)",
      "火車車廂 → 火車卡 (kaifangcidian)",
      "車廂 → 火車卡 (kaifangcidian)",
      "車皮 → 火車卡 (kaifangcidian)",
    ]);
    expect(stats.kaifangcidianSingleCharacterAnswers).toBe(5);
  });

  it("picks the first-listed form (Wiktionary table, Kaifangcidian row), then the Cantonese word's frequency, then code point order", () => {
    // Wiktionary lists 冇 before 冇有 whatever their frequencies.
    const entries = [entry("冇", 1), entry("冇有", 5)];
    expect(table({ kaifangcidian: [], wiktionary: [WIKT_MEIYOU] }, entries, NO_CURATED)).toEqual(["沒有 → 冇 (wiktionary)"]);
    // Kaifangcidian: the gloss listed earlier in its row wins. 唔夠老友 glosses 不夠朋友 first, 絕情 only after
    // 無情, so 唔夠老友 wins although 絕情 is more frequent (real freqs: 0 and 2.95).
    const kfcdZyutcing = kfcd("絕情", [["無情", "无情"], ["不夠朋友", "不够朋友"]]);
    const kfcdMgaulouyau = kfcd("唔夠老友", [["不夠朋友", "不够朋友"]]);
    expect(table({ kaifangcidian: [kfcdZyutcing, kfcdMgaulouyau], wiktionary: [] }, [entry("絕情", 2.95)], NO_CURATED)).toContain(
      "不夠朋友 → 唔夠老友 (kaifangcidian)",
    );
    // Same position (both rows gloss 這裡 third): the more frequent word wins, in any input order.
    const nidou = (...args: Parameters<typeof table>) => table(...args).filter((row) => row.startsWith("這裏 "));
    expect(nidou({ kaifangcidian: [KFCD_NISYU, KFCD_NIDOU], wiktionary: [] }, [entry("呢度", 4), entry("呢處", 1)], NO_CURATED)).toEqual([
      "這裏 → 呢度 (kaifangcidian)",
    ]);
    expect(nidou({ kaifangcidian: [KFCD_NIDOU, KFCD_NISYU], wiktionary: [] }, [entry("呢度", 1), entry("呢處", 4)], NO_CURATED)).toEqual([
      "這裏 → 呢處 (kaifangcidian)",
    ]);
    // Equal frequency (here none): code point order (度 U+5EA6 before 處 U+8655).
    expect(nidou({ kaifangcidian: [KFCD_NISYU, KFCD_NIDOU], wiktionary: [] }, [], NO_CURATED)).toEqual(["這裏 → 呢度 (kaifangcidian)"]);
  });

  it("uses a source pair only when the Cantonese word is at least as frequent in canto.db as the Mandarin word", () => {
    // Frequencies from the real canto.db: Cantonese keeps 問題 (5.18) rather than Kaifangcidian's 阻滯 (1.95),
    // but says 鍾意 (5.53) for 喜歡 (4.25). Wiktionary's 打工仔 for 工人 loses the same way; the curated list is exempt.
    const entries = [entry("問題", 5.18), entry("阻滯", 1.95), entry("喜歡", 4.25), entry("鍾意", 5.53), entry("工人", 4.2), entry("打工仔", 3.6)];
    const sources = {
      kaifangcidian: [kfcd("阻滯", [["問題", "问题"]]), KFCD_ZUNGJI],
      wiktionary: [{ mandarin: "工人", cantonese: [{ form: "打工仔" }, { form: "工人" }] }],
    };
    expect(table(sources, entries, NO_CURATED)).toEqual(["喜歡 → 鍾意 (kaifangcidian)", "工人 → 工人 (wiktionary)"]);
    expect(buildPhraseTable(sources, entries, NO_CURATED).stats.lessFrequentKeys).toBe(1);
    expect(table(sources, entries, [["问题", "阻滯"]])).toContain("問題 → 阻滯 (curated)");
  });

  it("lets a Wiktionary form with no frequency data (freq 0) pass the gate, but not a Kaifangcidian word", () => {
    // Real freqs: 正在 4.04, 喺度 0 (no essay weight), 響度 4.44. Wiktionary lists 喺度 first.
    const entries = [entry("正在", 4.04), entry("喺度", 0), entry("響度", 4.44)];
    const zhengzai: DialSynPair = { mandarin: "正在", cantonese: [{ form: "喺度" }, { form: "喺處" }, { form: "響度" }, { form: "響處" }] };
    expect(table({ kaifangcidian: [], wiktionary: [zhengzai] }, entries, NO_CURATED)).toEqual(["正在 → 喺度 (wiktionary)"]);
    expect(table({ kaifangcidian: [kfcd("喺度", [["正在", "正在"]])], wiktionary: [] }, entries, NO_CURATED)).toEqual([]);
  });

  it("writes the Cantonese side in canto.db's displayed spelling when the word has an entry", () => {
    // Kaifangcidian writes 衛生; canto.db's entry for that key is displayed in the Hong Kong form 衞生.
    const entries = [entry("衞生", 3, headwordKey("衛生"))];
    const row = kfcd("衛生", [["衛生", "卫生"]]);
    expect(table({ kaifangcidian: [row], wiktionary: [] }, entries, NO_CURATED)).toEqual([`${toTrad("卫生")} → 衞生 (kaifangcidian)`]);
  });

  it("keeps identity pairs (they shield words like 圖書館 in longest match) and counts them", () => {
    const { rows, stats } = buildPhraseTable({ kaifangcidian: [KFCD_ZUNGJI], wiktionary: [WIKT_TUSHUGUAN] }, [], [["目的", "目的"]]);
    expect(rows).toEqual<PhraseRow[]>([
      { mandarinTrad: "喜歡", cantoneseTrad: "鍾意", source: "kaifangcidian" },
      { mandarinTrad: "圖書館", cantoneseTrad: "圖書館", source: "wiktionary" },
      { mandarinTrad: "目的", cantoneseTrad: "目的", source: "curated" },
    ]);
    expect(stats.identityRows).toBe(2);
    expect(stats.rows).toEqual({ curated: 1, wiktionary: 1, kaifangcidian: 1 });
  });

  it("lists curated Cantonese words canto.db has no entry for", () => {
    const { stats } = buildPhraseTable({ kaifangcidian: [], wiktionary: [] }, [entry("佢")], [["他", "佢"], ["在家", "喺屋企"]]);
    expect(stats.curatedWithoutEntry).toEqual(["喺屋企"]);
  });

  it("sorts rows by Mandarin key and gives the same rows whatever the input order", () => {
    const sources = { kaifangcidian: [KFCD_NIDOU, KFCD_GIMGAAP, KFCD_NISYU, KFCD_ZUNGJI], wiktionary: [WIKT_MEIYOU, WIKT_ZELI, WIKT_KUNNAN] };
    const reversed = { kaifangcidian: [...sources.kaifangcidian].reverse(), wiktionary: [...sources.wiktionary].reverse() };
    const forward = buildPhraseTable(sources, [], CURATED_PAIRS).rows;
    expect(buildPhraseTable(reversed, [], [...CURATED_PAIRS].reverse()).rows).toEqual(forward);
    const keys = forward.map((r) => r.mandarinTrad);
    expect(keys).toEqual([...new Set(keys)].sort());
  });
});

describe("CURATED_PAIRS", () => {
  it("has about 300 pairs with one answer per Mandarin key", () => {
    expect(CURATED_PAIRS.length).toBeGreaterThanOrEqual(300);
    const keys = CURATED_PAIRS.map(([mandarin]) => toTrad(mandarin));
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it("writes Mandarin in simplified and Cantonese with Han characters only", () => {
    const toSimp = OpenCC.Converter({ from: "t", to: "cn" });
    for (const [mandarin, cantonese] of CURATED_PAIRS) {
      expect(toSimp(mandarin), mandarin).toBe(mandarin);
      expect(cantonese, mandarin).toMatch(/^\p{Script=Han}+$/u);
    }
  });

  it("covers the spec's word substitutions (§6.2)", () => {
    const map = new Map(CURATED_PAIRS);
    for (const [mandarin, cantonese] of [["的", "嘅"], ["是", "係"], ["没有", "冇"], ["他", "佢"], ["她", "佢"], ["在", "喺"], ["看", "睇"], ["什么", "乜嘢"], ["吃", "食"]]) {
      expect(map.get(mandarin), mandarin).toBe(cantonese);
    }
  });
});

describe("phrase_map in canto.db", () => {
  const dir = mkdtempSync(join(tmpdir(), "phrase-map-"));

  it("is written as phrase_map(mandarin_trad, cantonese_trad, source), one row per Mandarin key", () => {
    const path = join(dir, "canto.db");
    const rows: PhraseRow[] = [
      { mandarinTrad: "沒有", cantoneseTrad: "冇", source: "curated" },
      { mandarinTrad: "衣服", cantoneseTrad: "衫", source: "kaifangcidian" },
    ];
    writeDb(path, [], rows);
    const db = new Database(path, { readonly: true });
    expect(db.prepare("SELECT mandarin_trad, cantonese_trad, source FROM phrase_map ORDER BY mandarin_trad").all()).toEqual([
      { mandarin_trad: "沒有", cantonese_trad: "冇", source: "curated" },
      { mandarin_trad: "衣服", cantonese_trad: "衫", source: "kaifangcidian" },
    ]);
    // mandarin_trad is the primary key, so lookups by it use the key index.
    const plan = db.prepare("EXPLAIN QUERY PLAN SELECT cantonese_trad FROM phrase_map WHERE mandarin_trad = ?").all("沒有") as { detail: string }[];
    expect(plan.map((p) => p.detail).join(" ")).toMatch(/PRIMARY KEY/);
    db.close();
  });

  it("rejects a second row for the same Mandarin key and an unknown source", () => {
    const path = join(dir, "dup.db");
    const dup: PhraseRow = { mandarinTrad: "沒有", cantoneseTrad: "冇", source: "curated" };
    expect(() => writeDb(path, [], [dup, { ...dup, cantoneseTrad: "冇有" }])).toThrow();
    expect(() => writeDb(path, [], [{ ...dup, source: "moe" as PhraseRow["source"] }])).toThrow();
  });
});
