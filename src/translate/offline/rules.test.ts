import { openTestDb } from "../../db/testDb";
import { toTrad } from "../script";
import { applyRules, clockTime, comparative, perfective, progressive, verbFirst } from "./rules";
import { phraseTable, substitute } from "./substitute";

// Rules see substitute()'s Cantonese output, so most tests give them Cantonese text.
describe("comparative: A比B高 → A高過B", () => {
  it("moves the adjective before 過 and the compared noun after it", () => {
    expect(comparative("我比你高")).toBe("我高過你");
    expect(comparative("佢比我哋細，")).toBe("佢細過我哋，");
    expect(comparative("今日比尋日凍好多")).toBe("今日凍過尋日好多");
  });

  it("leaves 比 words that are not a comparison alone", () => {
    expect(comparative("比賽好睇")).toBe("比賽好睇");
    expect(comparative("比較好")).toBe("比較好");
    expect(comparative("佢比我大三歲")).toBe("佢比我大三歲");
  });
});

describe("progressive: 喺 + verb → verb緊", () => {
  it("turns 喺 before a verb into 緊 after it", () => {
    expect(progressive("喺食飯")).toBe("食緊飯");
    expect(progressive("佢喺睇電視")).toBe("佢睇緊電視");
    expect(progressive("佢喺返工")).toBe("佢返緊工");
  });

  it("leaves 喺 before a place alone", () => {
    expect(progressive("我喺屋企食飯")).toBe("我喺屋企食飯");
    expect(progressive("佢喺學校")).toBe("佢喺學校");
    expect(progressive("喺洗手間")).toBe("喺洗手間");
    expect(progressive("喺走廊")).toBe("喺走廊");
  });
});

describe("perfective: verb了 → verb咗, sentence-final 了 → 喇", () => {
  it("turns 了 after a verb into 咗", () => {
    expect(perfective("食了")).toBe("食咗");
    expect(perfective("我睇了套戲")).toBe("我睇咗套戲");
    expect(perfective("佢走了。")).toBe("佢走咗。");
  });

  it("turns 了 at the end of a sentence into 喇", () => {
    expect(perfective("落雨了")).toBe("落雨喇");
    expect(perfective("好了！")).toBe("好喇！");
  });

  it("leaves 了 inside a word alone", () => {
    expect(perfective("我了解")).toBe("我了解");
  });
});

describe("verbFirst: 先 + verb → verb先", () => {
  it("moves 先 after a verb that ends the clause", () => {
    expect(verbFirst("你先走")).toBe("你走先");
    expect(verbFirst("我先食啦")).toBe("我食先啦");
    expect(verbFirst("你先睇，")).toBe("你睇先，");
  });

  it("leaves 先 in words and before a non-final verb alone", () => {
    expect(verbFirst("首先講。")).toBe("首先講。");
    expect(verbFirst("先生")).toBe("先生");
    expect(verbFirst("先食飯")).toBe("先食飯");
  });
});

describe("clockTime: 一啲 in a clock time → 一點", () => {
  it("restores 一點 after a time of day or before 鐘/半/a number", () => {
    expect(clockTime("下晝一啲")).toBe("下晝一點");
    expect(clockTime("一啲鐘")).toBe("一點鐘");
    expect(clockTime("凌晨一啲三")).toBe("凌晨一點三");
  });

  it("leaves 一啲 meaning 'a little' alone", () => {
    expect(clockTime("我要一啲水")).toBe("我要一啲水");
  });
});

describe("applyRules goldens (toTrad → substitute over the fixture phrase table → applyRules)", () => {
  const db = openTestDb();
  afterAll(() => db.close());
  const translate = async (mandarin: string) => applyRules(substitute(await phraseTable(db), toTrad(mandarin)));

  it.each([
    ["我比你高", "我高過你"],
    // 你走先 rather than the plan's 你行先: 走 is "leave" in Cantonese, and the real phrase table maps 先走 → 走先.
    ["你先走", "你走先"],
    ["给我", "畀我"],
    ["在吃饭", "食緊飯"],
    ["吃了", "食咗"],
    ["你去不去", "你去唔去"],
    ["下午一点", "下晝一點"],
  ])("%s → %s", async (mandarin, cantonese) => {
    expect(await translate(mandarin)).toBe(cantonese);
  });
});
