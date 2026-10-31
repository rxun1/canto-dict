// clipPath over a small synthetic pack and index (the real assets are built by data-pipeline and not
// committed), with expo-file-system as an in-memory file store and expo-asset resolving the pack's URI.
import type { SyllableIndex } from "./syllableIndex";

const mockPackUri = "file:///bundle/syllables.pack";
// Three clips back to back; la1 has none, as in the real pack.
const mockPack = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
const mockIndex: SyllableIndex = { sik6: [0, 4], faan6: [4, 3], hou2: [7, 2] };

jest.mock("../../assets/syllables.json", () => mockIndex, { virtual: true });
jest.mock("../../assets/syllables.pack", () => 1, { virtual: true });

// What downloadAsync resolves to (or rejects with); tests replace it.
let mockDownload: () => Promise<{ localUri: string | null }>;
jest.mock("expo-asset", () => ({ Asset: { fromModule: () => ({ downloadAsync: () => mockDownload() }) } }));

// File path → contents; `opens` counts reads of the pack (the slicing work); `failWrites` makes writes throw.
const mockFs = { files: new Map<string, Uint8Array>(), opens: 0, failWrites: false };

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
      // An interrupted write: part of the file lands, then it fails.
      if (mockFs.failWrites) {
        mockFs.files.set(this.uri, bytes.slice(0, 1));
        throw new Error("disk full");
      }
      mockFs.files.set(this.uri, bytes);
    }
    delete() {
      mockFs.files.delete(this.uri);
    }
    moveSync(to: File) {
      mockFs.files.set(to.uri, mockFs.files.get(this.uri)!);
      mockFs.files.delete(this.uri);
      this.uri = to.uri;
    }
  }
  return { Directory, File, FileMode: { ReadOnly: "r" }, Paths: { cache: new Directory("file:///cache") } };
});

describe("clipPath", () => {
  // Fresh module per test: it remembers the opened pack.
  let clipPath: (syllable: string) => Promise<string | null>;
  beforeEach(() => {
    jest.resetModules();
    ({ clipPath } = require("./syllablePack"));
    mockDownload = async () => ({ localUri: mockPackUri });
    mockFs.files = new Map([[mockPackUri, mockPack]]);
    mockFs.opens = 0;
    mockFs.failWrites = false;
  });

  it("slices sik6's [offset, length] from the pack into the cache once, then reuses the file", async () => {
    const uri = await clipPath("sik6");
    expect(uri).toMatch(/^file:\/\/\/cache\/.*\.mp3$/);
    expect(mockFs.files.get(uri!)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(mockFs.opens).toBe(1);

    expect(await clipPath("sik6")).toBe(uri);
    expect(mockFs.opens).toBe(1);

    expect(mockFs.files.get((await clipPath("faan6"))!)).toEqual(new Uint8Array([5, 6, 7]));
  });

  it("returns null for a syllable with no clip (particles, non-syllables, Object keys)", async () => {
    for (const s of ["la1", "xyz", "constructor"]) expect(await clipPath(s)).toBeNull();
    expect(mockFs.opens).toBe(0);
  });

  it("never leaves a truncated clip behind when a write is interrupted", async () => {
    mockFs.failWrites = true;
    await expect(clipPath("sik6")).rejects.toThrow("disk full");
    const clips = () => [...mockFs.files.keys()].filter((path) => path.endsWith(".mp3"));
    expect(clips()).toEqual([]);

    mockFs.failWrites = false;
    const uri = await clipPath("sik6");
    expect(clips()).toEqual([uri]);
    expect(mockFs.files.get(uri!)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("opens the pack again after a failed download", async () => {
    mockDownload = async () => Promise.reject(new Error("offline"));
    await expect(clipPath("sik6")).rejects.toThrow("offline");
    mockDownload = async () => ({ localUri: null });
    await expect(clipPath("sik6")).rejects.toThrow("no local file");

    mockDownload = async () => ({ localUri: mockPackUri });
    expect(await clipPath("sik6")).not.toBeNull();
  });
});
