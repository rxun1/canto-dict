import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { WIKTIONARY_DIALSYN_SHA256 } from "../../src/sources/urls";
import {
  buildDialSynExtract,
  cleanDialSynForm,
  parseDialSynModules,
  readDialSynTarball,
  type DialSynModule,
} from "../../src/sources/wiktionaryDialSyn";
import { formatDialSynExtract, parseDialSynExtract } from "../../src/sources/wiktionaryDialSynExtract";
import { concatBytes, paxPath, TAR_END, tarFile } from "../tarBuilder";
import { luaModule } from "./luaModuleText";

const fixtureDir = join(import.meta.dirname, "../../fixtures/wiktionary-dial-syn");

/** A fixture module: the file name without ".txt" is the page name, as in the tarball. */
const fixture = (name: string): DialSynModule => ({ name, text: readFileSync(join(fixtureDir, `${name}.txt`), "utf8") });

const allFixtures = (): DialSynModule[] =>
  readdirSync(fixtureDir)
    .filter((file) => file.endsWith(".txt"))
    .sort()
    .map((file) => fixture(file.slice(0, -".txt".length)));

/** Note-less Cantonese forms, the common case. */
const plain = (...forms: string[]) => forms.map((form) => ({ form }));

/** An inline module in the tables' usual shape; its fields start on line 4. */
const inline = (name: string, body: string): DialSynModule => ({ name, text: luaModule(body) });

/** Writes `tar` gzipped to a fresh temp dir, runs `use` on its path and its sha256, then cleans up. */
async function withTarball<T>(tar: Uint8Array, use: (path: string, sha256: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "dialsyn-test-"));
  try {
    const gz = gzipSync(tar);
    const path = join(dir, "modules.tar.gz");
    writeFileSync(path, gz);
    return await use(path, createHash("sha256").update(gz).digest("hex"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A tarball holding `modules` the way kaikki stores them. */
const tarOf = (modules: readonly DialSynModule[]): Uint8Array =>
  concatBytes([...modules.flatMap(({ name, text }) => [...paxPath(`Module/zh/data/dial-syn/${name}.txt`), ...tarFile("pax-target", text)]), TAR_END]);

describe("parseDialSynModules", () => {
  it("maps 沒有 to Cantonese 冇, 冇有 from the Written Standard Chinese, Hong Kong and Guangzhou rows", () => {
    expect(parseDialSynModules([fixture("沒有")])).toEqual({
      rows: [{ mandarin: "沒有", cantonese: plain("冇", "冇有") }],
      skipped: [],
      parsedTables: 1,
    });
  });

  it("ignores rows of other varieties that share a Cantonese place name (Hong Kong Hakka, Weitou villages)", () => {
    // 沒有's fixture has "Hong Kong-H" (Hakka), "HK Weitou", "Ting Kok" and "Tung Ping Chau" rows,
    // all 冇; only the urban Hong Kong / Guangzhou / Macau rows count.
    const { rows } = parseDialSynModules([
      inline("無有", '\t["Formal"] = { "無有" },\n\t["Hong Kong-H"] = { "冇" },\n\t["HK Weitou"] = { "冇" },'),
      fixture("沒有"),
    ]);
    expect(rows).toEqual([{ mandarin: "沒有", cantonese: plain("冇", "冇有") }]);
  });

  it("gives one pair per Written Standard form (its notes stripped), merging Hong Kong, Guangzhou and Macau forms in that order without repeats", () => {
    expect(parseDialSynModules([fixture("移動電源")]).rows).toEqual(
      ["移動電源", "充電寶", "隨身充", "行動電源"].map((mandarin) => ({
        mandarin,
        cantonese: plain("尿袋", "隨叉", "外置叉電器", "外置充電器", "流動叉電器", "流動充電器", "充電寶", "奶媽"),
      })),
    );
  });

  it("keeps a Cantonese form's note, strips etymology numbers and links, and de-duplicates on the form", () => {
    const { rows } = parseDialSynModules([fixture("自動鉛筆"), fixture("公婆"), fixture("胖乎乎")]);
    expect(rows).toEqual([
      // Hong Kong has 撳芯筆:regional, Macau a plain 撳芯筆: the first (Hong Kong) one is kept.
      { mandarin: "自動鉛筆", cantonese: [{ form: "鉛芯筆" }, { form: "撳芯筆", note: "regional" }] },
      { mandarin: "公婆", cantonese: plain("老爺奶奶", "家公家婆") },
      { mandarin: "胖乎乎", cantonese: plain("肥嘟嘟", "肥揗揗", "肥腯腯") },
      { mandarin: "胖嘟嘟", cantonese: plain("肥嘟嘟", "肥揗揗", "肥腯腯") },
      { mandarin: "胖墩墩", cantonese: plain("肥嘟嘟", "肥揗揗", "肥腯腯") },
    ]);
  });

  it("keeps the first occurrence of a repeated form, note and all, whatever later rows say", () => {
    const { rows } = parseDialSynModules([
      inline("x", '\t["Formal"] = { "甲:Taiwan" },\n\t["Hong Kong"] = { "乙", "丙:dated" },\n\t["Guangzhou"] = { "乙:slang", "丙:†", "丁:dated" },\n\t["Macau"] = { "乙" },'),
    ]);
    expect(rows).toEqual([{ mandarin: "甲", cantonese: [{ form: "乙" }, { form: "丙", note: "dated" }, { form: "丁", note: "dated" }] }]);
  });

  it('uses the page name when the Written Standard row is { "" }, dropping a "-2" sense suffix', () => {
    expect(parseDialSynModules([fixture("素質")]).rows).toEqual([{ mandarin: "素質", cantonese: plain("質素") }]);
    expect(parseDialSynModules([inline("張-2", '\t["Formal"] = { "" },\n\t["Hong Kong"] = { "張" },')]).rows).toEqual([
      { mandarin: "張", cantonese: plain("張") },
    ]);
  });

  it('excludes a table without Cantonese rows (包字頭) and one whose Written Standard row is "-" (凱撒沙拉)', () => {
    expect(parseDialSynModules([fixture("包字頭"), fixture("凱撒沙拉")])).toEqual({ rows: [], skipped: [], parsedTables: 2 });
  });

  it('treats a row whose first form is "" as empty, as Wiktionary does', () => {
    const { rows } = parseDialSynModules([inline("x", '\t["Formal"] = { "甲" },\n\t["Hong Kong"] = { "", "乙" },\n\t["Macau"] = { "丙" },')]);
    expect(rows).toEqual([{ mandarin: "甲", cantonese: plain("丙") }]);
  });

  it("skips an unparseable module (a redirect stub) with its line, and keeps the rest", () => {
    const { rows, skipped, parsedTables } = parseDialSynModules(allFixtures());
    expect(rows).toHaveLength(11);
    expect(parsedTables).toBe(8);
    expect(skipped).toEqual([{ line: 1, message: 'Module:zh/data/dial-syn/年料: expected "local" but found "Module"' }]);
  });

  it("skips a table with a malformed row, a row that is not a list, or no Written Standard row", () => {
    const { rows, skipped } = parseDialSynModules([
      inline("壞", '\t["Formal"] = { "壞" }\n\t["Hong Kong"] = { "衰" },'),
      inline("串", '\t["Formal"] = { "串" },\n\t["Guangzhou"] = "串",'),
      inline("無", '\t["Hong Kong"] = { "冇" },'),
      fixture("沒有"),
    ]);
    expect(rows).toEqual([{ mandarin: "沒有", cantonese: plain("冇", "冇有") }]);
    expect(skipped).toEqual([
      { line: 5, message: 'Module:zh/data/dial-syn/壞: expected "}" but found "["' },
      { line: 5, message: 'Module:zh/data/dial-syn/串: row "Guangzhou" is not a list of forms' },
      { line: 1, message: 'Module:zh/data/dial-syn/無: no "Formal" (Written Standard Chinese) row' },
    ]);
  });

  it("throws when no module is given, none parses, or no table has a Hong Kong, Guangzhou or Macau row", () => {
    expect(() => parseDialSynModules([])).toThrow("Wiktionary dial-syn has 1 problem(s):\n  line 1: no dial-syn modules found");
    expect(() => parseDialSynModules([fixture("年料"), inline("壞", '\t["Formal"] = { "壞" }\n\t["Hong Kong"] = { "衰" },')])).toThrow(
      "line 1: none of the 2 modules parsed as a dial-syn table",
    );
    expect(() => parseDialSynModules([fixture("包字頭")])).toThrow(
      'line 1: none of the 1 parsed tables has a "Hong Kong", "Guangzhou" or "Macau" row (location keys renamed?)',
    );
  });
});

describe("cleanDialSynForm", () => {
  it("splits off a :note and removes an _N etymology number and [[link]] brackets", () => {
    expect(cleanDialSynForm("撳芯筆:regional")).toEqual({ form: "撳芯筆", note: "regional" });
    expect(cleanDialSynForm("四眼佬:man")).toEqual({ form: "四眼佬", note: "man" });
    expect(cleanDialSynForm("冇:†, ‡")).toEqual({ form: "冇", note: "†, ‡" });
    expect(cleanDialSynForm("肥腯腯_1")).toEqual({ form: "肥腯腯" });
    expect(cleanDialSynForm("蘸_2:dated")).toEqual({ form: "蘸", note: "dated" });
    expect(cleanDialSynForm("[[聽日]][[下晝]]")).toEqual({ form: "聽日下晝" });
    expect(cleanDialSynForm("[[聽日|聽]]日")).toEqual({ form: "聽日" });
  });

  it("drops an empty note, and like Wiktionary keeps only the text up to a second colon", () => {
    expect(cleanDialSynForm("冇: ")).toEqual({ form: "冇" });
    expect(cleanDialSynForm("冇:dated:extra")).toEqual({ form: "冇", note: "dated" });
  });

  it("keeps Latin letters, spaces and placeholders, which are part of real forms", () => {
    expect(cleanDialSynForm("QR code")).toEqual({ form: "QR code" });
    expect(cleanDialSynForm("阿Sir:male")).toEqual({ form: "阿Sir", note: "male" });
    expect(cleanDialSynForm("話……知")).toEqual({ form: "話……知" });
  });
});

describe("readDialSynTarball", () => {
  it("returns only the Module/zh/data/dial-syn/<name>.txt entries, named by page", async () => {
    const tar = concatBytes([
      ...tarFile("Module/zh-dial-syn.txt", "renderer"),
      ...tarFile("Module/zh/data/dial-syn.txt", "template"),
      ...paxPath("Module/zh/data/dial-syn/沒有.txt"),
      ...tarFile("././@PaxHeader-target", "表一"),
      ...tarFile("Module/zh/data/dial-syn/sub/page.txt", "subpage"),
      ...tarFile("Module/zh/data/dial-syn/張-2.txt", "表二"),
      TAR_END,
    ]);
    expect(await withTarball(tar, (path) => readDialSynTarball(path))).toEqual({
      rows: [
        { name: "沒有", text: "表一" },
        { name: "張-2", text: "表二" },
      ],
      skipped: [],
    });
  });

  it("skips a module that is not valid UTF-8, naming it, and keeps the others", async () => {
    const tar = concatBytes([
      ...tarFile("Module/zh/data/dial-syn/a.txt", new Uint8Array([0xe6, 0xb2])),
      ...tarFile("Module/zh/data/dial-syn/b.txt", "ok"),
      TAR_END,
    ]);
    expect(await withTarball(tar, (path) => readDialSynTarball(path))).toEqual({
      rows: [{ name: "b", text: "ok" }],
      skipped: [{ line: 1, message: "Module:zh/data/dial-syn/a: not valid UTF-8" }],
    });
  });

  it("rejects (does not crash the process) when the tarball file is missing", async () => {
    await expect(readDialSynTarball(join(tmpdir(), "no-such-dir-p1t10", "missing.tar.gz"))).rejects.toThrow("ENOENT");
  });
});

describe("buildDialSynExtract", () => {
  it("parses the tarball and formats the pairs, recording the hash of the tarball actually read", async () => {
    const modules = allFixtures();
    const result = await withTarball(tarOf(modules), async (path, sha256) => ({
      sha256,
      built: await buildDialSynExtract(path, { minParsedTables: 8, pinnedSha256: sha256 }),
    }));
    const { rows } = parseDialSynModules(modules);
    expect(result.built).toEqual({
      text: formatDialSynExtract(rows, result.sha256),
      parsedTables: 8,
      pairCount: 11,
      skipped: [{ line: 1, message: 'Module:zh/data/dial-syn/年料: expected "local" but found "Module"' }],
    });
    expect(result.built.text).toContain(`"tarballSha256":"${result.sha256}"`);
    expect(parseDialSynExtract(result.built.text, result.sha256)).toHaveLength(11);
  });

  it("throws, before anything is written, when the tarball is not the pinned one", async () => {
    await withTarball(tarOf(allFixtures()), async (path, sha256) => {
      await expect(buildDialSynExtract(path, { minParsedTables: 8 })).rejects.toThrow(
        `tarball sha256 ${sha256} is not the pinned WIKTIONARY_DIALSYN_SHA256 ${WIKTIONARY_DIALSYN_SHA256}`,
      );
    });
  });

  it("throws when fewer tables than the minimum parse, or no pairs come out", async () => {
    await withTarball(tarOf(allFixtures()), async (path, sha256) => {
      await expect(buildDialSynExtract(path, { minParsedTables: 9, pinnedSha256: sha256 })).rejects.toThrow(
        "only 8 dial-syn tables parsed, expected at least 9",
      );
    });
    await withTarball(tarOf([fixture("凱撒沙拉")]), async (path, sha256) => {
      await expect(buildDialSynExtract(path, { minParsedTables: 1, pinnedSha256: sha256 })).rejects.toThrow("no pairs came out of 1 parsed tables");
    });
  });
});
