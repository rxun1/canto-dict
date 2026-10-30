import { STEPS, helpText } from "../src/cli";

describe("cli", () => {
  it("exports the ordered step list", () => {
    expect(STEPS).toEqual(["download", "parse", "merge", "validate", "build"]);
  });

  it("lists every step in the help text", () => {
    const help = helpText();
    for (const step of STEPS) {
      expect(help).toContain(step);
    }
  });
});
