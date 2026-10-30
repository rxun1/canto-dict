import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { overrideEnvVar } from "../../src/download";
import { loadWordshkDump, parseWordshkDump, WORDSHK_DUMP_REQUEST_URL, wordshkDumpConfigured } from "../../src/sources/wordshkDump";

const fixture = readFileSync(join(import.meta.dirname, "../../fixtures/wordshk-all.csv"), "utf8");

/** The dump's two preamble records (copyright notice, then an empty quoted field), copied from the fixture. */
const PREAMBLE = fixture.split("\r\n").slice(0, 2).join("\r\n") + "\r\n";

/** A one-record dump: the preamble (lines 1-2), then this record starting on line 3. */
const dumpWith = (record: string): string => `${PREAMBLE}${record}\r\n`;

const entry = (id: number) => {
  const found = parseWordshkDump(fixture).rows.find((e) => e.id === id);
  if (found === undefined) throw new Error(`entry ${id} not parsed`);
  return found;
};

describe("parseWordshkDump", () => {
  it("keeps the 10 public fixture entries, in file order", () => {
    const { rows } = parseWordshkDump(fixture);
    expect(rows.map((e) => e.id)).toEqual([123905, 102301, 117025, 117086, 107966, 104581, 40576, 110170, 72250, 40570]);
  });

  it("skips non-public rows (未公開) silently, even when they have content", () => {
    const { rows, skipped } = parseWordshkDump(fixture);
    expect(rows.some((e) => e.id === 117928 || e.id === 84753)).toBe(false);
    expect(skipped.some((p) => p.line === 6 || p.line === 7)).toBe(false);
  });

  it("parses a multi-sense entry: id, headword, pos, labels, yue senses, examples with zho and Jyutping", () => {
    expect(entry(40576)).toEqual({
      id: 40576,
      headwords: [{ word: "不用", syllables: ["bat1", "jung6"] }],
      variants: [],
      pos: ["副詞"],
      labels: ["書面語"],
      senses: [
        {
          yue: "「唔使」嘅書面語",
          examples: [{ yue: "唔使客氣", jyutping: ["m4", "sai2", "haak3", "hei3"], zho: "不用客氣" }],
        },
        { yue: "「唔用」嘅書面語", examples: [] },
      ],
    });
  });

  it("ignores English (eng:) lines everywhere", () => {
    const json = JSON.stringify(parseWordshkDump(fixture).rows);
    for (const english of ["need not", "do not use", "to choose", "owner", "mobile game", "car horn", "rap artist"]) {
      expect(json).not.toContain(english);
    }
    expect(json).not.toContain('"eng"');
  });

  it("returns every reading of every headword, keeping supplementary-plane characters whole", () => {
    expect(entry(123905).headwords).toEqual([
      { word: "礻", syllables: ["si6"] },
      { word: "示字邊", syllables: ["si6", "zi6", "bin1"] },
    ]);
    expect(entry(104581).headwords.map((h) => h.word)).toEqual(["𠼭", "砵", "呠"]);
  });

  it("keeps a headword loan syllable without its '!' and records its index", () => {
    expect(entry(102301).headwords).toEqual([
      { word: "gym房", syllables: ["zhim1", "fong2"], loanSyllables: [0] },
      { word: "gym房", syllables: ["zim1", "fong2"] },
    ]);
  });

  it("drops a headword reading with an invalid non-loan syllable, keeps the entry, and records the record's line", () => {
    const { skipped } = parseWordshkDump(fixture);
    expect(entry(117025).headwords).toEqual([{ word: "rapper", syllables: ["rep1", "paa4"], loanSyllables: [0] }]);
    const problem = skipped.find((p) => p.line === 18);
    expect(problem?.message).toMatch(/117025.*invalid syllable "wep1" in headword rapper/);
  });

  it("yields the variants column as alternative headword forms", () => {
    expect(entry(72250).headwords).toEqual([{ word: "揀", syllables: ["gaan2"] }]);
    expect(entry(72250).variants).toEqual(["㨂"]);
    expect(entry(40576).variants).toEqual([]);
  });

  it("splits a multi-variant cell on commas", () => {
    const { rows } = parseWordshkDump(
      dumpWith('86778,"為甚麼:wai6 sam6 mo1,為什麼:wai6 sam6 mo1","(pos:代詞)\nyue:問原因","爲什麼,爲甚麼",OK,已公開'),
    );
    expect(rows[0].variants).toEqual(["爲什麼", "爲甚麼"]);
  });

  it("reads every pos and label tag and drops sim/ant/ref/img tags", () => {
    const e = entry(117086);
    expect(e.pos).toEqual(["詞綴", "量詞"]);
    expect(e.labels).toEqual(["民間傳説"]);
    expect(entry(40570).pos).toEqual(["動詞"]);
    expect(entry(40570).labels).toEqual(["書面語"]);
    expect(entry(102301).labels).toEqual([]);
  });

  it("strips #link markers and the space that delimits a link", () => {
    expect(entry(117086).senses).toEqual([{ yue: "同啲", examples: [] }]);
    expect(entry(123905).senses[0].yue).toBe("「礻」，部首「示」做「左偏旁」嘅寫法（量詞：個）");
    expect(entry(117025).senses[0].yue).toBe("表演rap嘅人（量詞：個／名）");
  });

  it("makes one example per yue: line when an <eg> block has several", () => {
    expect(entry(110170).senses[0].examples).toEqual([
      { yue: "東主", jyutping: ["dung1", "zyu2"] },
      { yue: "店東", jyutping: ["dim3", "dung1"] },
      { yue: "房東", jyutping: ["fong4", "dung1"] },
      { yue: "股東", jyutping: ["gu2", "dung1"] },
    ]);
  });

  it("strips sentence punctuation from example Jyutping and keeps example loan syllables", () => {
    expect(entry(72250).senses[0].examples[2]).toEqual({
      yue: "一百蚊三件，隨便揀啦。",
      jyutping: ["jat1", "baak3", "man1", "saam1", "gin6", "ceoi4", "pin2", "gaan2", "laa1"],
    });
    expect(entry(117025).senses[0].examples).toEqual([
      {
        yue: "香港rapper男女比例懸殊。",
        jyutping: ["hoeng1", "gong2", "rep1", "paa4", "naam4", "neoi5", "bei2", "lai6", "jyun4", "syu4"],
        loanSyllables: [2],
      },
    ]);
  });

  it("keeps an example whose Jyutping has an invalid syllable, without its Jyutping, and records the record's line", () => {
    const { skipped } = parseWordshkDump(fixture);
    expect(entry(107966).senses).toEqual([
      {
        yue: "手機玩嘅遊戲（量詞：隻／款）",
        examples: [{ yue: "手遊專區", jyutping: ["sau2", "gei1", "zyun1", "keoi1"] }, { yue: "RPG手遊" }],
      },
    ]);
    const problem = skipped.find((p) => p.line === 28);
    expect(problem?.message).toBe(
      'entry 107966: invalid syllable "pi1" in example Jyutping "aau1 pi1 zi1 sau2 jau4"; Jyutping dropped',
    );
  });

  it("drops an <eg> block that has no yue: line (Mandarin-only example)", () => {
    expect(entry(40570).senses).toEqual([{ yue: "唔好嘅意思", examples: [] }]);
  });

  it("reports exactly the two fixture problems", () => {
    expect(parseWordshkDump(fixture).skipped.map((p) => p.line)).toEqual([18, 28]);
  });

  it("omits jyutping on an example without a trailing Jyutping parenthesis", () => {
    const { rows } = parseWordshkDump(
      dumpWith('1,好:hou2,"(pos:形容詞)\n<explanation>\nyue:唔錯\n<eg>\nyue:好（指質素）",,OK,已公開'),
    );
    expect(rows[0].senses[0].examples).toEqual([{ yue: "好（指質素）" }]);
  });

  it("keeps a multi-line yue explanation, joined with newlines", () => {
    const { rows } = parseWordshkDump(dumpWith('1,好:hou2,"(pos:形容詞)\nyue:第一行\n第二行\neng:good",,OK,已公開'));
    expect(rows[0].senses[0].yue).toBe("第一行\n第二行");
  });

  it("skips a malformed entry with its starting line: stray text inside an example", () => {
    const { rows, skipped } = parseWordshkDump(
      dumpWith('9,好:hou2,"(pos:形容詞)\n<explanation>\nyue:唔錯\n<eg>\nyue:好嘢 (hou2 je5)\n亂碼",,OK,已公開'),
    );
    expect(rows).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].line).toBe(3);
    expect(skipped[0].message).toMatch(/^entry 9: unexpected line "亂碼"/);
  });

  it("skips entries with an unknown tag, a sense without yue:, or a headword without a reading", () => {
    const { rows, skipped } = parseWordshkDump(
      PREAMBLE +
        '1,好:hou2,"(pos:形容詞)(foo:bar)\nyue:唔錯",,OK,已公開\r\n' +
        '2,好:hou2,"(pos:形容詞)\nzho:不錯",,OK,已公開\r\n' +
        '3,好,"(pos:形容詞)\nyue:唔錯",,OK,已公開\r\n',
    );
    expect(rows).toEqual([]);
    // Each record spans two lines (the entry field holds a newline), so they start on lines 3, 5, 7.
    expect(skipped.map((p) => p.line)).toEqual([3, 5, 7]);
    expect(skipped[0].message).toMatch(/unknown tag "foo"/);
    expect(skipped[1].message).toMatch(/no yue: explanation/);
    expect(skipped[2].message).toMatch(/headword "好" has no reading/);
  });

  it("drops a headword reading with a malformed loan syllable (bare '!') and keeps the other headwords", () => {
    const { rows, skipped } = parseWordshkDump(dumpWith('101778,"阝:!,耳仔邊:ji5 zai2 bin1","(pos:語素)\nyue:部首",,OK,已公開'));
    expect(rows[0].headwords).toEqual([{ word: "耳仔邊", syllables: ["ji5", "zai2", "bin1"] }]);
    expect(skipped).toEqual([
      { line: 3, message: 'entry 101778: malformed loan syllable "!" in headword 阝 ("!"); reading dropped' },
    ]);
  });

  it("skips a public row whose entry is 未有內容 NO DATA", () => {
    const { rows, skipped } = parseWordshkDump(dumpWith("5,好:hou2,未有內容 NO DATA,,OK,已公開"));
    expect(rows).toEqual([]);
    expect(skipped).toEqual([{ line: 3, message: 'entry 5: no content ("未有內容 NO DATA"); entry skipped' }]);
  });

  it("throws on a duplicate id or a non-numeric id", () => {
    const row = (id: string) => `${id},好:hou2,"(pos:形容詞)\nyue:唔錯",,OK,已公開\r\n`;
    expect(() => parseWordshkDump(PREAMBLE + row("7") + row("7"))).toThrow(/line 5: duplicate id 7/);
    expect(() => parseWordshkDump(PREAMBLE + row("x7"))).toThrow(/line 3: non-numeric id "x7"/);
  });

  it("throws on a structural problem: missing preamble, wrong column count, or unknown public value", () => {
    expect(() => parseWordshkDump('1,好:hou2,"(pos:形容詞)\nyue:唔錯",,OK,已公開\r\n')).toThrow(/words\.hk full dump.*line 1/s);
    expect(() => parseWordshkDump(dumpWith("1,好:hou2,(pos:形容詞),OK,已公開"))).toThrow(/line 3: expected 6 columns, got 5/);
    expect(() => parseWordshkDump(dumpWith('1,好:hou2,"(pos:形容詞)\nyue:唔錯",,OK,maybe'))).toThrow(/line 3: .*"maybe"/);
  });

  it("throws on CSV syntax errors", () => {
    expect(() => parseWordshkDump(dumpWith('1,好:hou2,"unterminated'))).toThrow(/words\.hk full dump/);
  });
});

describe("loadWordshkDump", () => {
  const envVar = overrideEnvVar("wordshk-dump");
  const saved = process.env[envVar];
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "canto-wordshk-dump-"));
  });

  afterEach(async () => {
    if (saved === undefined) delete process.env[envVar];
    else process.env[envVar] = saved;
    await rm(dir, { recursive: true, force: true });
  });

  it("wordshkDumpConfigured is true only when the env var is set and non-empty", () => {
    delete process.env[envVar];
    expect(wordshkDumpConfigured()).toBe(false);
    process.env[envVar] = "";
    expect(wordshkDumpConfigured()).toBe(false);
    process.env[envVar] = join(dir, "all.csv.gz");
    expect(wordshkDumpConfigured()).toBe(true);
  });

  it("fails naming the env var and the request URL when the env var is unset", async () => {
    delete process.env[envVar];
    const err = await loadWordshkDump().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("CANTO_SRC_WORDSHK_DUMP");
    expect((err as Error).message).toContain("https://words.hk/faiman/request_data/");
    expect(WORDSHK_DUMP_REQUEST_URL).toBe("https://words.hk/faiman/request_data/");
  });

  it("fails naming the env var and path when the file is missing", async () => {
    const missing = join(dir, "nope.csv.gz");
    process.env[envVar] = missing;
    await expect(loadWordshkDump()).rejects.toThrow(new RegExp(`CANTO_SRC_WORDSHK_DUMP.*${missing}`));
  });

  it("gunzips and parses the override file", async () => {
    const path = join(dir, "all.csv.gz");
    await writeFile(path, gzipSync(fixture));
    process.env[envVar] = path;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const entries = await loadWordshkDump();
      expect(entries).toHaveLength(10);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/words\.hk full dump has 2 problem/);
    } finally {
      warn.mockRestore();
    }
  });
});
