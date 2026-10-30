import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  cleanDialSynForm,
  parseDialSynModules,
  readDialSynTarball,
  type DialSynModule,
} from "../../src/sources/wiktionaryDialSyn";
import { concatBytes, paxPath, TAR_END, tarFile } from "../tarBuilder";

const fixtureDir = join(import.meta.dirname, "../../fixtures/wiktionary-dial-syn");

/** A fixture module: the file name without ".txt" is the page name, as in the tarball. */
const fixture = (name: string): DialSynModule => ({ name, text: readFileSync(join(fixtureDir, `${name}.txt`), "utf8") });

const allFixtures = (): DialSynModule[] =>
  readdirSync(fixtureDir)
    .filter((file) => file.endsWith(".txt"))
    .sort()
    .map((file) => fixture(file.slice(0, -".txt".length)));

/** An inline module in the tables' usual shape; its fields start on line 4. */
const inline = (name: string, body: string): DialSynModule => ({
  name,
  text: `local export = {}\n\nexport.list = {\n${body}\n}\n\nreturn export`,
});

describe("parseDialSynModules", () => {
  it("maps 沒有 to Cantonese 冇, 冇有 from the Written Standard Chinese, Hong Kong and Guangzhou rows", () => {
    expect(parseDialSynModules([fixture("沒有")])).toEqual({
      rows: [{ mandarin: "沒有", cantonese: ["冇", "冇有"] }],
      skipped: [],
    });
  });

  it("ignores rows of other varieties that share a Cantonese place name (Hong Kong Hakka, Weitou villages)", () => {
    // 沒有's fixture has "Hong Kong-H" (Hakka), "HK Weitou", "Ting Kok" and "Tung Ping Chau" rows,
    // all 冇; only the urban Hong Kong / Guangzhou / Macau rows count.
    const { rows } = parseDialSynModules([
      inline("無有", '\t["Formal"] = { "無有" },\n\t["Hong Kong-H"] = { "冇" },\n\t["HK Weitou"] = { "冇" },'),
      fixture("沒有"),
    ]);
    expect(rows).toEqual([{ mandarin: "沒有", cantonese: ["冇", "冇有"] }]);
  });

  it("gives one pair per Written Standard form, merging Hong Kong, Guangzhou and Macau forms in that order without repeats", () => {
    expect(parseDialSynModules([fixture("移動電源")]).rows).toEqual(
      ["移動電源", "充電寶", "隨身充", "行動電源"].map((mandarin) => ({
        mandarin,
        cantonese: ["尿袋", "隨叉", "外置叉電器", "外置充電器", "流動叉電器", "流動充電器", "充電寶", "奶媽"],
      })),
    );
  });

  it("strips annotations, etymology numbers and links, then de-duplicates", () => {
    const { rows } = parseDialSynModules([fixture("自動鉛筆"), fixture("公婆"), fixture("胖乎乎")]);
    expect(rows).toEqual([
      { mandarin: "自動鉛筆", cantonese: ["鉛芯筆", "撳芯筆"] },
      { mandarin: "公婆", cantonese: ["老爺奶奶", "家公家婆"] },
      { mandarin: "胖乎乎", cantonese: ["肥嘟嘟", "肥揗揗", "肥腯腯"] },
      { mandarin: "胖嘟嘟", cantonese: ["肥嘟嘟", "肥揗揗", "肥腯腯"] },
      { mandarin: "胖墩墩", cantonese: ["肥嘟嘟", "肥揗揗", "肥腯腯"] },
    ]);
  });

  it('uses the page name when the Written Standard row is { "" }, dropping a "-2" sense suffix', () => {
    expect(parseDialSynModules([fixture("素質")]).rows).toEqual([{ mandarin: "素質", cantonese: ["質素"] }]);
    expect(parseDialSynModules([inline("張-2", '\t["Formal"] = { "" },\n\t["Hong Kong"] = { "張" },')]).rows).toEqual([
      { mandarin: "張", cantonese: ["張"] },
    ]);
  });

  it('excludes a table without Cantonese rows (包字頭) and one whose Written Standard row is "-" (凱撒沙拉)', () => {
    expect(parseDialSynModules([fixture("包字頭"), fixture("凱撒沙拉")])).toEqual({ rows: [], skipped: [] });
  });

  it('treats a row whose first form is "" as empty, as Wiktionary does', () => {
    const { rows } = parseDialSynModules([inline("x", '\t["Formal"] = { "甲" },\n\t["Hong Kong"] = { "", "乙" },\n\t["Macau"] = { "丙" },')]);
    expect(rows).toEqual([{ mandarin: "甲", cantonese: ["丙"] }]);
  });

  it("skips an unparseable module (a redirect stub) with its line, and keeps the rest", () => {
    const { rows, skipped } = parseDialSynModules(allFixtures());
    expect(rows).toHaveLength(11);
    expect(skipped).toEqual([{ line: 1, message: 'Module:zh/data/dial-syn/年料: expected "local" but found "Module"' }]);
  });

  it("skips a table with a malformed row, a row that is not a list, or no Written Standard row", () => {
    const { rows, skipped } = parseDialSynModules([
      inline("壞", '\t["Formal"] = { "壞" }\n\t["Hong Kong"] = { "衰" },'),
      inline("串", '\t["Formal"] = { "串" },\n\t["Guangzhou"] = "串",'),
      inline("無", '\t["Hong Kong"] = { "冇" },'),
      fixture("沒有"),
    ]);
    expect(rows).toEqual([{ mandarin: "沒有", cantonese: ["冇", "冇有"] }]);
    expect(skipped).toEqual([
      { line: 5, message: 'Module:zh/data/dial-syn/壞: expected "}" but found "["' },
      { line: 5, message: 'Module:zh/data/dial-syn/串: row "Guangzhou" is not a list of forms' },
      { line: 1, message: 'Module:zh/data/dial-syn/無: no "Formal" (Written Standard Chinese) row' },
    ]);
  });

  it("throws when no module is given, or no table has a Hong Kong, Guangzhou or Macau row", () => {
    expect(() => parseDialSynModules([])).toThrow("Wiktionary dial-syn has 1 problem(s):\n  line 1: no dial-syn modules found");
    expect(() => parseDialSynModules([fixture("包字頭")])).toThrow(
      'line 1: none of the 1 parsed tables has a "Hong Kong", "Guangzhou" or "Macau" row (location keys renamed?)',
    );
  });
});

describe("cleanDialSynForm", () => {
  it("removes a :note, an _N etymology number and [[link]] brackets", () => {
    expect(cleanDialSynForm("撳芯筆:regional")).toBe("撳芯筆");
    expect(cleanDialSynForm("四眼佬:man")).toBe("四眼佬");
    expect(cleanDialSynForm("肥腯腯_1")).toBe("肥腯腯");
    expect(cleanDialSynForm("蘸_2:dated")).toBe("蘸");
    expect(cleanDialSynForm("[[聽日]][[下晝]]")).toBe("聽日下晝");
    expect(cleanDialSynForm("[[聽日|聽]]日")).toBe("聽日");
  });

  it("keeps Latin letters, spaces and placeholders, which are part of real forms", () => {
    expect(cleanDialSynForm("QR code")).toBe("QR code");
    expect(cleanDialSynForm("阿Sir:male")).toBe("阿Sir");
    expect(cleanDialSynForm("話……知")).toBe("話……知");
  });
});

describe("readDialSynTarball", () => {
  it("returns only the Module/zh/data/dial-syn/<name>.txt entries, named by page", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dialsyn-test-"));
    try {
      const tar = concatBytes([
        ...tarFile("Module/zh-dial-syn.txt", "renderer"),
        ...tarFile("Module/zh/data/dial-syn.txt", "template"),
        ...paxPath("Module/zh/data/dial-syn/沒有.txt"),
        ...tarFile("././@PaxHeader-target", "表一"),
        ...tarFile("Module/zh/data/dial-syn/sub/page.txt", "subpage"),
        ...tarFile("Module/zh/data/dial-syn/張-2.txt", "表二"),
        TAR_END,
      ]);
      const path = join(dir, "modules.tar.gz");
      writeFileSync(path, gzipSync(tar));
      expect(await readDialSynTarball(path)).toEqual([
        { name: "沒有", text: "表一" },
        { name: "張-2", text: "表二" },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
