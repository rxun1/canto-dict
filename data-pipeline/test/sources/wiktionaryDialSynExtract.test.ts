import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DialSynPair } from "../../src/sources/types";
import { WIKTIONARY_DIALSYN_SHA256, WIKTIONARY_DIALSYN_URL } from "../../src/sources/urls";
import { parseDialSynModules } from "../../src/sources/wiktionaryDialSyn";
import { formatDialSynExtract, loadWiktionaryDialSyn, parseDialSynExtract } from "../../src/sources/wiktionaryDialSynExtract";

const SHA = WIKTIONARY_DIALSYN_SHA256;
const OTHER_SHA = "0".repeat(64);

/** Note-less Cantonese forms, the common case. */
const plain = (...forms: string[]) => forms.map((form) => ({ form }));

const header = (sha256: string): string =>
  "{\n" +
  `  "about": {"source":"${WIKTIONARY_DIALSYN_URL}","tarballSha256":"${sha256}","tables":"Module:zh/data/dial-syn/*",` +
  '"license":"CC BY-SA 4.0 (Wiktionary)","regenerate":"cd data-pipeline && npx tsx scripts/gen-dialsyn.ts"},\n';

const pairs: DialSynPair[] = [
  { mandarin: "自動鉛筆", cantonese: [{ form: "鉛芯筆" }, { form: "撳芯筆", note: "regional" }] },
  { mandarin: "沒有", cantonese: plain("冇", "冇有") },
  { mandarin: "張", cantonese: plain("張") },
  { mandarin: "張", cantonese: plain("塊") },
];

describe("formatDialSynExtract", () => {
  it("writes a header, the pair count and one pair per line, sorted by Mandarin and then by line", () => {
    expect(formatDialSynExtract(pairs, SHA)).toBe(
      header(SHA) +
        '  "pairCount": 4,\n' +
        '  "pairs": [\n' +
        '    {"mandarin":"張","cantonese":[{"form":"塊"}]},\n' +
        '    {"mandarin":"張","cantonese":[{"form":"張"}]},\n' +
        '    {"mandarin":"沒有","cantonese":[{"form":"冇"},{"form":"冇有"}]},\n' +
        '    {"mandarin":"自動鉛筆","cantonese":[{"form":"鉛芯筆"},{"form":"撳芯筆","note":"regional"}]}\n' +
        "  ]\n" +
        "}\n",
    );
  });

  it("records the tarball hash it is given", () => {
    expect(formatDialSynExtract(pairs, OTHER_SHA).startsWith(header(OTHER_SHA))).toBe(true);
  });

  it("drops exact duplicate pairs but keeps pairs that differ only in a note", () => {
    const noted = { mandarin: "沒有", cantonese: [{ form: "冇", note: "dated" }, { form: "冇有" }] };
    const text = formatDialSynExtract([...pairs, pairs[1]!, pairs[2]!, noted], SHA);
    expect(text).toContain('"pairCount": 5,');
    expect(parseDialSynExtract(text)).toEqual([pairs[3], pairs[2], noted, pairs[1], pairs[0]]);
  });

  it("does not depend on input order, and re-formatting what it reads gives the same text", () => {
    const text = formatDialSynExtract(pairs, SHA);
    expect(formatDialSynExtract([...pairs].reverse(), SHA)).toBe(text);
    expect(formatDialSynExtract(parseDialSynExtract(text), SHA)).toBe(text);
  });

  it("round-trips every pair parsed from the fixtures", () => {
    const fixtureDir = join(import.meta.dirname, "../../fixtures/wiktionary-dial-syn");
    const modules = readdirSync(fixtureDir).map((file) => ({ name: file.slice(0, -".txt".length), text: readFileSync(join(fixtureDir, file), "utf8") }));
    const { rows } = parseDialSynModules(modules);
    const read = parseDialSynExtract(formatDialSynExtract(rows, SHA));
    expect(read).toHaveLength(rows.length);
    expect(read).toEqual(expect.arrayContaining(rows));
  });
});

describe("parseDialSynExtract", () => {
  it("accepts an extract made from another tarball only when told that hash is the pin", () => {
    const text = formatDialSynExtract(pairs, OTHER_SHA);
    expect(() => parseDialSynExtract(text)).toThrow(
      `line 2: extract was generated from tarball sha256 ${OTHER_SHA}, but urls.ts pins ${SHA}; regenerate it`,
    );
    expect(parseDialSynExtract(text, OTHER_SHA)).toHaveLength(4);
  });

  it("rejects a wrong count, an empty extract, or malformed pairs, with line numbers", () => {
    const good = formatDialSynExtract(pairs, SHA);
    expect(() => parseDialSynExtract(good.replace('"pairCount": 4', '"pairCount": 5'))).toThrow("line 3: pairCount is 5 but there are 4 pairs");
    expect(() => parseDialSynExtract(formatDialSynExtract([], SHA))).toThrow("line 4: the extract has no pairs");
    const bad = good
      .replace('{"mandarin":"張","cantonese":[{"form":"塊"}]}', '{"mandarin":"","cantonese":[{"form":"塊"}]}')
      .replace('[{"form":"張"}]', "[]")
      .replace('{"form":"冇有"}', '{"form":"冇有","extra":1}')
      .replace('"note":"regional"', '"note":""');
    expect(() => parseDialSynExtract(bad)).toThrow(
      "Wiktionary dial-syn extract has 4 problem(s):\n" +
        "  line 5: pair 1: mandarin must be a non-empty string\n" +
        "  line 6: pair 2: cantonese must be a non-empty list\n" +
        '  line 7: pair 3: cantonese form 2 must be {"form": non-empty string, "note"?: non-empty string}\n' +
        '  line 8: pair 4: cantonese form 2 must be {"form": non-empty string, "note"?: non-empty string}',
    );
    expect(() => parseDialSynExtract("{")).toThrow("line 1: not valid JSON");
    expect(() => parseDialSynExtract("[]")).toThrow('line 1: expected an object with "about", "pairCount" and "pairs"');
  });
});

describe("loadWiktionaryDialSyn", () => {
  it("reads the committed extract offline: 6,078 distinct pairs including 沒有 -> 冇, 冇有", async () => {
    const loaded = await loadWiktionaryDialSyn();
    expect(loaded).toHaveLength(6078);
    expect(loaded.filter((p) => p.mandarin === "沒有")).toEqual([{ mandarin: "沒有", cantonese: plain("冇", "冇有") }]);
  });

  it("is a build-time module that never loads the tarball reader, zlib or the Lua parser", () => {
    const source = readFileSync(join(import.meta.dirname, "../../src/sources/wiktionaryDialSynExtract.ts"), "utf8");
    const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
    expect(imports.filter((path) => /zlib|tar|luaDataModule|wiktionaryDialSyn$/.test(path!))).toEqual([]);
  });
});
