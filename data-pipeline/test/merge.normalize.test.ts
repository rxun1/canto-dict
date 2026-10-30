import { headwordKey, toSimplified } from "../src/merge/normalize";

describe("headwordKey", () => {
  it("joins rime/words.hk (Hong Kong) and MoE (Taiwan) spellings of the same word on one key", () => {
    // HK form (words.hk, rime) vs Taiwan form (MoE), as listed in the sources.
    const pairs: [string, string][] = [
      ["這裏", "這裡"],
      ["衞生", "衛生"],
      ["麪包", "麵包"],
      ["電綫", "電線"],
      ["着急", "著急"],
    ];
    for (const [hk, tw] of pairs) expect(headwordKey(hk), `${hk} / ${tw}`).toBe(headwordKey(tw));
  });

  it("folds HK-variant spellings rime itself lists twice (無綫 / 無線)", () => {
    expect(headwordKey("無綫")).toBe(headwordKey("無線"));
  });

  it("leaves a single character unchanged, so distinct characters never merge (台/臺, 着/著, 針/鍼)", () => {
    // Character-level OpenCC maps 台→臺 (hk→t) and 著→着, 針→鍼 (tw→t); as words these are fine, as
    // characters they are different dictionary entries with different readings.
    for (const char of ["台", "臺", "着", "著", "針", "鍼", "乾", "干", "幹", "㨂"]) expect(headwordKey(char)).toBe(char);
  });

  it("does not merge different words that only share a simplified form (乾淨 / 干擾 / 幹部)", () => {
    const keys = new Set(["乾淨", "干淨", "幹淨"].map(headwordKey));
    expect(keys.size).toBe(3);
  });

  it("keeps 著 in words where it is zyu3 (著名, 顯著), and folds it where it is zoek6 (著數 → 着數)", () => {
    expect(headwordKey("著名")).toBe("著名");
    expect(headwordKey("顯著")).toBe("顯著");
    expect(headwordKey("著數")).toBe(headwordKey("着數"));
  });

  it("leaves Latin and mixed headwords alone", () => {
    expect(headwordKey("DSE")).toBe("DSE");
    expect(headwordKey("T恤")).toBe("T恤");
  });
});

describe("toSimplified", () => {
  it("keeps Cantonese characters that have no simplified form unchanged (嘅, 冇, 喺)", () => {
    for (const text of ["嘅", "冇", "喺", "我哋"]) expect(toSimplified(text, "hk")).toBe(text);
    expect(toSimplified("冇問題", "hk")).toBe("冇问题");
  });

  it("converts Hong Kong forms, including HK-only variants such as 衞", () => {
    expect(toSimplified("學校", "hk")).toBe("学校");
    expect(toSimplified("衞生", "hk")).toBe("卫生");
    expect(toSimplified("揀", "hk")).toBe("拣");
  });

  it("converts Taiwan forms (著急 → 着急, 這裡 → 这里)", () => {
    expect(toSimplified("著急", "tw")).toBe("着急");
    expect(toSimplified("這裡", "tw")).toBe("这里");
  });
});
