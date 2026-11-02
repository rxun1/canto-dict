import * as OpenCC from "opencc-js";
import { toSimp, toTrad } from "./script";

// Wraps the real Converter so the reuse test can count how many converters get built.
jest.mock("opencc-js", () => {
  const actual = jest.requireActual("opencc-js");
  return { ...actual, Converter: jest.fn(actual.Converter) };
});

describe("toTrad", () => {
  it("converts simplified to traditional (没有 → 沒有, 学校 → 學校)", () => {
    expect(toTrad("没有")).toBe("沒有");
    expect(toTrad("学校")).toBe("學校");
  });
});

describe("toSimp", () => {
  it("converts traditional to simplified (學校 → 学校)", () => {
    expect(toSimp("學校")).toBe("学校");
  });

  it("leaves characters with no simplified form unchanged (嘅冇喺)", () => {
    expect(toSimp("嘅冇喺")).toBe("嘅冇喺");
  });

  it("keeps the Cantonese characters 係, 嗰 and 餸 as the dictionary displays them", () => {
    expect(toSimp("佢係學生")).toBe("佢係学生");
    expect(toSimp("嗰度")).toBe("嗰度");
    expect(toSimp("買餸")).toBe("买餸");
  });

  it("still simplifies 係 inside 關係", () => {
    expect(toSimp("佢哋嘅關係係好")).toBe("佢哋嘅关系係好");
  });

  it("keeps characters whose simplified form is outside the BMP (鮟鱇魚 → 鮟鱇鱼)", () => {
    expect(toSimp("鮟鱇魚")).toBe("鮟鱇鱼");
  });
});

describe("converters", () => {
  it("are created once and reused", () => {
    const built = jest.mocked(OpenCC.Converter).mock.calls.length;
    toTrad("学校");
    toSimp("學校");
    toSimp("佢係學生");
    expect(jest.mocked(OpenCC.Converter).mock.calls.length).toBe(built);
  });
});
