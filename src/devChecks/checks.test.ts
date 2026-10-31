import { DEV_CHECKS, runDevCheck } from "./checks";

describe("dev checks", () => {
  it.each(DEV_CHECKS.map((check) => [check.label, check]))("%s passes under Node", (_label, check) => {
    expect(runDevCheck(check)).toEqual({ ok: true, output: check.expected });
  });

  it("reports a thrown error as a failure", () => {
    const check = { label: "throws", input: "", expected: "", run: () => { throw new Error("boom"); } };
    expect(runDevCheck(check)).toEqual({ ok: false, output: "Error: boom" });
  });
});
