import { readTarEntries } from "../src/tar";
import { chunked, concatBytes, paxPath, TAR_END, tarFile, tarHeader } from "./tarBuilder";

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

async function read(parts: Uint8Array[], wanted: (path: string) => boolean = () => true, chunkSize = 100) {
  const entries = await readTarEntries(chunked(concatBytes(parts), chunkSize), wanted);
  return entries.map((e) => ({ path: e.path, text: decode(e.data) }));
}

describe("readTarEntries", () => {
  it("returns the wanted regular files with their exact contents and skips the rest", async () => {
    const big = "x".repeat(1500);
    const entries = await read(
      [...tarFile("a/keep.txt", "kept"), ...tarFile("a/skip.txt", big), ...tarFile("a/", "", "5"), ...tarFile("b/keep.txt", big), TAR_END],
      (path) => path.endsWith("keep.txt"),
    );
    expect(entries).toEqual([
      { path: "a/keep.txt", text: "kept" },
      { path: "b/keep.txt", text: big },
    ]);
  });

  it("does not depend on how the bytes are chunked", async () => {
    const parts = [...tarFile("one.txt", "1".repeat(700)), ...tarFile("two.txt", "two"), TAR_END];
    for (const size of [1, 7, 512, 513, 100_000]) {
      expect(await read(parts, () => true, size)).toEqual([
        { path: "one.txt", text: "1".repeat(700) },
        { path: "two.txt", text: "two" },
      ]);
    }
  });

  it("takes a non-ASCII path from a pax header, for that entry only", async () => {
    const entries = await read([...paxPath("Module/zh/data/dial-syn/沒有.txt"), ...tarFile("ignored", "表"), ...tarFile("plain.txt", "p"), TAR_END]);
    expect(entries).toEqual([
      { path: "Module/zh/data/dial-syn/沒有.txt", text: "表" },
      { path: "plain.txt", text: "p" },
    ]);
  });

  it("joins the ustar prefix and name, and reads a GNU long name", async () => {
    const entries = await read([...tarFile("name.txt", "a", "0", "some/prefix"), ...tarFile("././@LongLink", "long/name.txt\0", "L"), ...tarFile("long/na", "b"), TAR_END]);
    expect(entries).toEqual([
      { path: "some/prefix/name.txt", text: "a" },
      { path: "long/name.txt", text: "b" },
    ]);
  });

  it("accepts an archive that ends right after its last entry, without the zero blocks", async () => {
    expect(await read([...tarFile("a.txt", "a")])).toEqual([{ path: "a.txt", text: "a" }]);
  });

  it("throws on a header with a bad checksum", async () => {
    const header = tarHeader("a.txt", 1, "0");
    header[0] = "b".charCodeAt(0);
    await expect(read([header, new Uint8Array(512), TAR_END])).rejects.toThrow("tar: bad header checksum at byte 0");
  });

  it("throws when the archive is cut off inside an entry", async () => {
    const [header] = tarFile("a.txt", "x".repeat(600));
    await expect(read([header!, new Uint8Array(512)])).rejects.toThrow("tar: archive is truncated");
  });

  it("throws on a non-octal size field", async () => {
    const header = tarHeader("a.txt", 0, "0");
    header.set(new TextEncoder().encode("12345678901z"), 124);
    header.fill(0x20, 148, 156);
    const sum = header.reduce((total, byte) => total + byte, 0);
    header.set(new TextEncoder().encode(`${sum.toString(8).padStart(6, "0")}\0 `), 148);
    await expect(read([header, TAR_END])).rejects.toThrow('tar: bad size field "12345678901z" at byte 0');
  });
});
