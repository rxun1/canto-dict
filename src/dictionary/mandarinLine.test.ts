import type { Definition, MandarinItem } from "../db/entries";
import { mandarinLine } from "./mandarinLine";

const equivalent = (trad: string, simp: string): MandarinItem => ({ trad, simp, sources: ["test"] });

function definition(fields: Partial<Definition>): Definition {
  return { sense: 1, pos: null, yue: null, yueSimp: null, zho: null, zhoSimp: null, source: "test", ...fields };
}

const moe = definition({ zho: "講學研習的教育機構。", zhoSimp: "讲学研习的教育机构。", source: "moe" });
const wordshk = definition({ yue: "冇咗", yueSimp: "冇咗", source: "wordshk-dump" });

describe("mandarinLine", () => {
  it("lists every Mandarin equivalent first, in order", () => {
    const line = mandarinLine({
      mandarin: [equivalent("沒有", "没有"), equivalent("無", "无")],
      definitions: [moe, wordshk],
    });
    expect(line).toEqual({
      source: "mandarin",
      words: [
        { trad: "沒有", simp: "没有" },
        { trad: "無", simp: "无" },
      ],
    });
  });

  it("falls back to the first MoE definition", () => {
    const later = definition({ sense: 2, zho: "後者。", zhoSimp: "后者。", source: "moe" });
    expect(mandarinLine({ mandarin: [], definitions: [wordshk, moe, later] })).toEqual({
      source: "zho",
      trad: "講學研習的教育機構。",
      simp: "讲学研习的教育机构。",
    });
  });

  it("falls back to the first words.hk explanation (粤语释义) when there is no Mandarin", () => {
    expect(mandarinLine({ mandarin: [], definitions: [wordshk] })).toEqual({ source: "yue", trad: "冇咗", simp: "冇咗" });
  });

  it("uses the traditional text when a simplified form is missing", () => {
    const noSimp = definition({ zho: "講學。", source: "moe" });
    expect(mandarinLine({ mandarin: [], definitions: [noSimp] })).toEqual({ source: "zho", trad: "講學。", simp: "講學。" });
  });

  it("is null when the entry has no Mandarin, MoE or words.hk text", () => {
    expect(mandarinLine({ mandarin: [], definitions: [] })).toBeNull();
  });
});
