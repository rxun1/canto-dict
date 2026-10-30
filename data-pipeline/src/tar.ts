// A minimal streaming tar reader: enough for kaikki.org's pax-format module tarball, without a
// dependency. It only reads entry names and file contents; permissions, links and times are ignored.

const BLOCK = 512;

export interface TarEntry {
  readonly path: string;
  readonly data: Uint8Array;
}

/** Reads exact byte counts out of a chunked stream, without keeping skipped bytes in memory. */
class ByteReader {
  private chunk: Uint8Array = new Uint8Array(0);
  private done = false;
  /** Bytes consumed so far (for error messages). */
  offset = 0;

  constructor(private readonly iterator: AsyncIterator<Uint8Array>) {}

  /** Makes the current chunk non-empty unless the stream has ended; returns false at the end. */
  private async fill(): Promise<boolean> {
    while (this.chunk.length === 0 && !this.done) {
      const next = await this.iterator.next();
      if (next.done) this.done = true;
      else this.chunk = next.value;
    }
    return this.chunk.length > 0;
  }

  /** The next `n` bytes; undefined if the stream ended before the first of them; throws if it ends partway. */
  async read(n: number): Promise<Uint8Array | undefined> {
    const out = new Uint8Array(n);
    let filled = 0;
    while (filled < n) {
      if (!(await this.fill())) {
        if (filled === 0) return undefined;
        throw new Error("tar: archive is truncated");
      }
      const take = Math.min(n - filled, this.chunk.length);
      out.set(this.chunk.subarray(0, take), filled);
      this.chunk = this.chunk.subarray(take);
      filled += take;
      this.offset += take;
    }
    return out;
  }

  /** Reads exactly `n` bytes, throwing if the stream ends first. */
  async readExactly(n: number): Promise<Uint8Array> {
    const bytes = n === 0 ? new Uint8Array(0) : await this.read(n);
    if (bytes === undefined) throw new Error("tar: archive is truncated");
    return bytes;
  }

  /** Discards `n` bytes, throwing if the stream ends first. */
  async skip(n: number): Promise<void> {
    let left = n;
    while (left > 0) {
      if (!(await this.fill())) throw new Error("tar: archive is truncated");
      const take = Math.min(left, this.chunk.length);
      this.chunk = this.chunk.subarray(take);
      left -= take;
      this.offset += take;
    }
  }
}

const decoder = new TextDecoder("utf-8", { fatal: true });

/** A NUL-terminated header field as text. */
function field(header: Uint8Array, offset: number, length: number): string {
  const bytes = header.subarray(offset, offset + length);
  const end = bytes.indexOf(0);
  return decoder.decode(end === -1 ? bytes : bytes.subarray(0, end));
}

/** An octal number field (NUL- or space-terminated); base-256 sizes (> 8 GiB) are not supported. */
function octal(header: Uint8Array, offset: number, length: number, name: string, headerOffset: number): number {
  const raw = field(header, offset, length);
  const digits = raw.trim();
  if (!/^[0-7]+$/.test(digits)) throw new Error(`tar: bad ${name} field "${raw}" at byte ${headerOffset}`);
  return parseInt(digits, 8);
}

/** The header checksum: the sum of all its bytes, with the checksum field itself counted as spaces. */
function checksum(header: Uint8Array): number {
  let sum = 0;
  for (const [i, byte] of header.entries()) sum += i >= 148 && i < 156 ? 0x20 : byte;
  return sum;
}

/** The `path` value of a pax extended header ("LEN key=value\n" records), if it has one. */
function paxPath(data: Uint8Array): string | undefined {
  let path: string | undefined;
  let at = 0;
  while (at < data.length && data[at] !== 0) {
    const space = data.indexOf(0x20, at);
    const length = space === -1 ? NaN : Number(decoder.decode(data.subarray(at, space)));
    if (!Number.isInteger(length) || length <= 0 || at + length > data.length) throw new Error("tar: malformed pax header");
    const record = decoder.decode(data.subarray(space + 1, at + length - 1));
    const eq = record.indexOf("=");
    if (eq !== -1 && record.slice(0, eq) === "path") path = record.slice(eq + 1);
    at += length;
  }
  return path;
}

const TYPE_FILE = "0";
const TYPE_FILE_OLD = "\0";
const TYPE_CONTIGUOUS = "7";
const TYPE_PAX = "x";
const TYPE_PAX_GLOBAL = "g";
const TYPE_GNU_LONG_NAME = "L";

/**
 * Reads a tar archive from `source` and returns the regular files whose path passes `wanted`, in
 * archive order. Handles ustar names with a prefix, pax `path` records and GNU long names. Stops at
 * the first all-zero block, or at the end of the stream if it falls on an entry boundary. Throws on
 * a bad header checksum, a malformed size or a truncated archive.
 */
export async function readTarEntries(source: AsyncIterable<Uint8Array>, wanted: (path: string) => boolean): Promise<TarEntry[]> {
  const reader = new ByteReader(source[Symbol.asyncIterator]());
  const entries: TarEntry[] = [];
  let nextPath: string | undefined;
  for (;;) {
    const headerOffset = reader.offset;
    const header = await reader.read(BLOCK);
    if (header === undefined || header.every((byte) => byte === 0)) break;
    if (octal(header, 148, 8, "checksum", headerOffset) !== checksum(header)) {
      throw new Error(`tar: bad header checksum at byte ${headerOffset}`);
    }
    const size = octal(header, 124, 12, "size", headerOffset);
    const paddedSize = Math.ceil(size / BLOCK) * BLOCK;
    const type = String.fromCharCode(header[156] ?? 0);

    if (type === TYPE_PAX || type === TYPE_GNU_LONG_NAME) {
      const data = (await reader.readExactly(paddedSize)).subarray(0, size);
      if (type === TYPE_PAX) nextPath = paxPath(data) ?? nextPath;
      else nextPath = field(data, 0, data.length);
      continue;
    }
    if (type === TYPE_PAX_GLOBAL) {
      await reader.skip(paddedSize);
      continue;
    }

    const name = field(header, 0, 100);
    const prefix = field(header, 257, 6) === "ustar" ? field(header, 345, 155) : "";
    const path = nextPath ?? (prefix === "" ? name : `${prefix}/${name}`);
    nextPath = undefined;
    const isFile = type === TYPE_FILE || type === TYPE_FILE_OLD || type === TYPE_CONTIGUOUS;
    if (isFile && wanted(path)) {
      entries.push({ path, data: (await reader.readExactly(paddedSize)).subarray(0, size) });
    } else {
      await reader.skip(paddedSize);
    }
  }
  return entries;
}
