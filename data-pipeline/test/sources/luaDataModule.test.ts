import { LuaSyntaxError, readExportList } from "../../src/sources/luaDataModule";

/** Wraps `body` in the module shape the dial-syn tables use. */
const lua = (body: string): string => `local export = {}\n\nexport.list = {\n${body}\n}\n\nreturn export`;

/** The entries as plain [key, value, line] triples. */
const entries = (text: string) => [...readExportList(text)].map(([key, { value, line }]) => [key, value, line]);

function syntaxError(text: string): { line: number; message: string } {
  try {
    readExportList(text);
  } catch (err) {
    if (err instanceof LuaSyntaxError) return { line: err.line, message: err.message };
    throw err;
  }
  throw new Error("expected a LuaSyntaxError");
}

describe("readExportList", () => {
  it("reads string and string-list fields with their line numbers", () => {
    expect(entries(lua('\t["meaning"] = "to not have",\n\t["Formal"] = { "沒有" },\n\t["Guangzhou"]\t= { "冇", "冇有" },'))).toEqual([
      ["meaning", "to not have", 4],
      ["Formal", ["沒有"], 5],
      ["Guangzhou", ["冇", "冇有"], 6],
    ]);
  });

  it("accepts comments, ';' separators, single quotes, bare-name keys, a key split over lines and no trailing separator", () => {
    const text =
      "local export = {} -- sources\n--[[ long\ncomment ]]\nexport.list = {\n" +
      "\tmeaning = 'a \"quoted\" gloss', --note\n" +
      '\t["公公"] = { "公公"; \'家翁\' };\n' +
      '\t["Klang"]\n\t    = {"物件", "食兮物件"},\n' +
      '\t["Tengxian" ] = { "果子" }\n}\nreturn export\n';
    expect(entries(text)).toEqual([
      ["meaning", 'a "quoted" gloss', 5],
      ["公公", ["公公", "家翁"], 6],
      ["Klang", ["物件", "食兮物件"], 7],
      ["Tengxian", ["果子"], 9],
    ]);
  });

  it("decodes escapes and long strings", () => {
    expect(entries(lua('\t["a"] = "x\\"y\\\\z\\n\\65\\x42\\u{5187}",\n\t["b"] = [==[\nlong ]] "s"]==],'))).toEqual([
      ["a", 'x"y\\z\nAB冇', 4],
      ["b", 'long ]] "s"', 5],
    ]);
  });

  it("ignores positional values, as Lua stores them at integer indexes nobody reads", () => {
    expect(entries(lua('\t["Formal"] = { "孑孓" }, { "跟頭蟲" },'))).toEqual([["Formal", ["孑孓"], 4]]);
  });

  it("keeps the last of two equal keys, as Lua does", () => {
    expect(entries(lua('\t["Hong Kong"] = { "a" },\n\t["Hong Kong"] = { "b" },'))).toEqual([["Hong Kong", ["b"], 5]]);
  });

  it("reports the line of an unexpected character", () => {
    expect(syntaxError(lua('\t["a"] = { "x" },\n\t@'))).toEqual({ line: 5, message: 'unexpected character "@"' });
  });

  it("reports a missing separator between fields", () => {
    expect(syntaxError(lua('\t["a"] = { "x" }\n\t["b"] = { "y" },'))).toEqual({ line: 5, message: 'expected "}" but found "["' });
  });

  it("reports an unfinished string", () => {
    expect(syntaxError(lua('\t["a"] = { "x },'))).toEqual({ line: 4, message: "unfinished string" });
  });

  it("rejects values that are not strings or lists of strings", () => {
    expect(syntaxError(lua('\t["a"] = 1,'))).toEqual({ line: 4, message: 'unexpected character "1"' });
    expect(syntaxError(lua('\t["a"] = { { "x" } },'))).toEqual({ line: 4, message: 'expected a string but found "{"' });
    expect(syntaxError(lua('\t["a"] = data,'))).toEqual({ line: 4, message: 'expected a string or a list of strings but found "data"' });
  });

  it("rejects any other module shape", () => {
    expect(syntaxError('return require("Module:zh/data/dial-syn/甘薯")')).toEqual({ line: 1, message: 'expected "local" but found "return"' });
    expect(syntaxError("Module:zh/data/dial-syn/年貨")).toEqual({ line: 1, message: 'expected "local" but found "Module"' });
    expect(syntaxError("local export = {}\n\nexport.list = {}\n")).toEqual({ line: 4, message: 'expected "return" but found end of file' });
    expect(syntaxError("local export = {}\nexport.list = {}\nreturn export\nfoo()")).toEqual({ line: 4, message: 'expected end of file but found "foo"' });
  });
});
