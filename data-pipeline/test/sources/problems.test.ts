import { MAX_REPORTED_PROBLEMS, formatProblems, throwIfProblems } from "../../src/sources/problems";

describe("formatProblems", () => {
  it("lists each problem with its line number", () => {
    expect(
      formatProblems("char.csv", [
        { line: 2, message: "bad char" },
        { line: 7, message: "bad rank" },
      ]),
    ).toBe("char.csv has 2 problem(s):\n  line 2: bad char\n  line 7: bad rank");
  });

  it("truncates after MAX_REPORTED_PROBLEMS and says how many were left out", () => {
    const problems = Array.from({ length: 21 }, (_, i) => ({ line: i + 1, message: "oops" }));
    const text = formatProblems("src", problems);
    expect(MAX_REPORTED_PROBLEMS).toBe(20);
    expect(text).toContain("21 problem(s)");
    expect(text).toContain("line 20:");
    expect(text).not.toMatch(/line 21:/);
    expect(text.endsWith("\n  … and 1 more")).toBe(true);
  });
});

describe("throwIfProblems", () => {
  it("does nothing for an empty list", () => {
    expect(() => throwIfProblems("src", [])).not.toThrow();
  });

  it("throws the formatted message otherwise", () => {
    expect(() => throwIfProblems("src", [{ line: 3, message: "bad" }])).toThrow(
      "src has 1 problem(s):\n  line 3: bad",
    );
  });
});
