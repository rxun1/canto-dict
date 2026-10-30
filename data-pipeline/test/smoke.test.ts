import { describe, expect, it } from "vitest";
import { STEPS } from "../src/cli";

describe("cli", () => {
  it("exports the ordered step list", () => {
    expect(STEPS).toEqual(["download", "parse", "merge", "validate", "build"]);
  });
});
