// clipPath over the real syllables.json and syllables.pack, with expo-file-system as an in-memory
// file store and expo-asset resolving the pack to a fixed URI.
import { readFileSync } from "fs";
import { join } from "path";
import index from "../../assets/syllables.json";
import { clipPath } from "./syllablePack";

const mockPackUri = "file:///bundle/syllables.pack";

jest.mock("expo-asset", () => ({
  Asset: { fromModule: () => ({ localUri: mockPackUri, downloadAsync: async function () { return this; } }) },
}));

// File path → contents; `opens` counts reads of the pack (the slicing work).
const mockFs = { files: new Map<string, Uint8Array>(), opens: 0 };

jest.mock("expo-file-system", () => {
  const join = (parts: (string | { uri: string })[]) => parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    create() {}
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockFs.files.has(this.uri);
    }
    open() {
      mockFs.opens++;
      const bytes = mockFs.files.get(this.uri)!;
      return {
        offset: 0 as number | null,
        readBytesSync(length: number) {
          return bytes.slice(this.offset!, this.offset! + length);
        },
        close() {},
      };
    }
    writeSync(bytes: Uint8Array) {
      mockFs.files.set(this.uri, bytes);
    }
  }
  return { Directory, File, FileMode: { ReadOnly: "r" }, Paths: { cache: new Directory("file:///cache") } };
});

const pack = new Uint8Array(readFileSync(join(__dirname, "../../assets/syllables.pack")));

describe("clipPath", () => {
  beforeEach(() => {
    mockFs.files = new Map([[mockPackUri, pack]]);
    mockFs.opens = 0;
  });

  it("slices sik6's [offset, length] from the pack into the cache once, then reuses the file", async () => {
    const [offset, length] = index.sik6;
    const uri = await clipPath("sik6");
    expect(uri).toMatch(/^file:\/\/\/cache\/.*\.mp3$/);
    expect(mockFs.files.get(uri!)).toEqual(pack.slice(offset, offset + length));
    expect(mockFs.opens).toBe(1);

    expect(await clipPath("sik6")).toBe(uri);
    expect(mockFs.opens).toBe(1);
  });

  it("returns null for a syllable with no clip (particles, non-syllables, Object keys)", async () => {
    for (const s of ["la1", "a1", "ga3", "ma3", "xyz", "constructor"]) expect(await clipPath(s)).toBeNull();
    expect(mockFs.opens).toBe(0);
  });
});
