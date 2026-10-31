import * as OpenCC from "opencc-js";
import ToJyutping from "to-jyutping";

export interface DevCheck {
  label: string;
  input: string;
  expected: string;
  run: (input: string) => string;
}

// Spike checks (P2-T2): the two JS libraries the app depends on must run under Hermes.
export const DEV_CHECKS: DevCheck[] = [
  {
    label: "to-jyutping",
    input: "食飯",
    expected: "sik6 faan6",
    run: (input) => ToJyutping.getJyutpingText(input),
  },
  {
    label: "opencc-js s2t",
    input: "学校",
    expected: "學校",
    run: (input) => OpenCC.Converter({ from: "cn", to: "t" })(input),
  },
];

export type DevCheckResult = { ok: true; output: string } | { ok: false; output: string };

/** Runs a check, turning a thrown error into a failed result so the screen can show it. */
export function runDevCheck(check: DevCheck): DevCheckResult {
  try {
    const output = check.run(check.input);
    return { ok: output === check.expected, output };
  } catch (error) {
    return { ok: false, output: String(error) };
  }
}
