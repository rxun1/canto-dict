import { splitLines } from "../../src/sources/text";

describe("splitLines", () => {
  it("splits on LF", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b", ""]);
  });

  it("handles BOM and CRLF identically to plain LF", () => {
    expect(splitLines("\uFEFFa\r\nb\r\n")).toEqual(splitLines("a\nb\n"));
  });
});
