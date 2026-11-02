import { NOTES, type Translation } from "./index";
import { fromHistoryOutput, toHistoryOutput } from "./historyOutput";

jest.mock("expo-secure-store", () => ({}));
jest.mock("expo-network", () => ({}));

const RESULT: Translation = { cantonese: "好！", jyutping: ["hou2", null], source: "online" };

describe("history output", () => {
  it("round-trips a translation", () => {
    expect(fromHistoryOutput(toHistoryOutput(RESULT))).toEqual(RESULT);
  });

  it("drops the note: it described that run (a missing key may since have been added)", () => {
    expect(fromHistoryOutput(toHistoryOutput({ ...RESULT, source: "offline", note: NOTES.noKey }))).toEqual({ ...RESULT, source: "offline" });
  });

  it("returns null for output that isn't a stored translation", () => {
    for (const output of ["雪柜", "{}", "null", '{"cantonese":"a","jyutping":[1],"source":"online"}', '{"cantonese":"a","jyutping":[],"source":"x"}']) {
      expect(fromHistoryOutput(output)).toBeNull();
    }
  });
});
