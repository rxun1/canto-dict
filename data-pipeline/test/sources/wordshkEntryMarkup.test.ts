import { EntryError, parseEntryContent, splitJyutping, stripLinks } from "../../src/sources/wordshkEntryMarkup";

/** Parses an entry field, collecting reported (non-fatal) problems. */
const parseCollecting = (content: string) => {
  const reports: string[] = [];
  const parsed = parseEntryContent(content, (message) => reports.push(message));
  return { ...parsed, reports };
};

const examplesOf = (egLine: string) =>
  parseCollecting(`(pos:名詞)\n<explanation>\nyue:解釋\n<eg>\n${egLine}`).senses[0].examples;

const fatal = (content: string): string => {
  try {
    parseEntryContent(content, () => {});
  } catch (err) {
    if (err instanceof EntryError) return err.message;
    throw err;
  }
  throw new Error("expected an EntryError");
};

describe("stripLinks", () => {
  it("drops '#' and keeps the delimiting space when the character beyond it is an ASCII letter or digit", () => {
    expect(stripLinks("1 #公里")).toBe("1 公里");
    expect(stripLinks("#手機 app")).toBe("手機 app");
    expect(stripLinks("use #USB now")).toBe("use USB now");
  });

  it("drops the delimiting space next to CJK text", () => {
    expect(stripLinks("用 #USB 線")).toBe("用USB線");
    expect(stripLinks("#中華民國 初年")).toBe("中華民國初年");
    expect(stripLinks("同 #啲")).toBe("同啲");
  });

  it("strips adjacent links and links ending at punctuation", () => {
    expect(stripLinks("「左#偏旁」")).toBe("「左偏旁」");
    expect(stripLinks("#睇嚟；#似乎")).toBe("睇嚟；似乎");
  });

  it("leaves a '#' that is not followed by link text", () => {
    expect(stripLinks("C# ")).toBe("C# ");
    expect(stripLinks("#，")).toBe("#，");
  });
});

describe("splitJyutping", () => {
  it("splits a trailing Jyutping parenthesis off the sentence", () => {
    expect(splitJyutping("佢食飯。 (keoi5 sik6 faan6.)")).toEqual({ text: "佢食飯。", jyutping: "keoi5 sik6 faan6." });
  });

  it("leaves a trailing parenthesis that holds Han characters or no toned syllable", () => {
    expect(splitJyutping("好（指質素） (指人)")).toEqual({ text: "好（指質素） (指人)" });
    expect(splitJyutping("佢係CEO (CEO)")).toEqual({ text: "佢係CEO (CEO)" });
    expect(splitJyutping("冇括號")).toEqual({ text: "冇括號" });
  });
});

describe("parseEntryContent", () => {
  it("treats a trailing '!' in example Jyutping as punctuation", () => {
    expect(examplesOf("yue:好嘢! (hou2 je5!)")).toEqual([{ yue: "好嘢!", jyutping: ["hou2", "je5"] }]);
  });

  it("treats a leading '!' in example Jyutping as a loan marker, even at index 0", () => {
    expect(examplesOf("yue:D (!di1)")).toEqual([{ yue: "D", jyutping: ["di1"], loanSyllables: [0] }]);
  });

  it("keeps an example with an invalid Jyutping syllable, without its Jyutping, and reports it", () => {
    const { senses, reports } = parseCollecting("(pos:名詞)\n<explanation>\nyue:解釋\n<eg>\nzho:中文 (zung1 man4)\nyue:PM (pi1 em1)");
    expect(senses[0].examples).toEqual([{ yue: "PM", zho: "中文" }]);
    expect(reports).toEqual(['invalid syllable "pi1" in example Jyutping "pi1 em1"; Jyutping dropped']);
  });

  it("reads pos and label tags from the tag line", () => {
    const { pos, labels } = parseCollecting("(pos:動詞)(pos:名詞)(label:書面語)(sim:勿)(img:https://x/y.jpg)\nyue:解釋");
    expect(pos).toEqual(["動詞", "名詞"]);
    expect(labels).toEqual(["書面語"]);
  });

  it("throws on 未有內容 NO DATA", () => {
    expect(fatal("未有內容 NO DATA")).toBe('no content ("未有內容 NO DATA")');
  });

  it("throws on two zho: lines in one <eg>", () => {
    expect(fatal("(pos:名詞)\n<explanation>\nyue:解釋\n<eg>\nzho:甲\nzho:乙\nyue:丙")).toBe("two zho: lines in one <eg>");
  });

  it("throws on <explanation> in the middle of a sense", () => {
    expect(fatal("(pos:名詞)\nyue:解釋\n<explanation>\nyue:再解釋")).toBe("unexpected <explanation> inside a sense");
  });

  it("throws on a missing tag line", () => {
    expect(fatal("yue:解釋")).toMatch(/^expected a tag line/);
  });
});
