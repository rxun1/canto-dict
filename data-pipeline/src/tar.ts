// A minimal streaming tar reader: enough for kaikki.org's pax-format module tarball, without a
// dependency. It only reads entry names and file contents; permissions, links and times are ignored.

/** Tar's block size: headers are one block, file data is padded to a whole number of blocks. */
export const BLOCK = 512;

// ustar header layout: [offset, length] of each field we read.
const NAME_OFFSET = 0;
const NAME_LENGTH = 100;
const SIZE_OFFSET = 124;
const SIZE_LENGTH = 12;
const CHECKSUM_OFFSET = 148;
const CHECKSUM_LENGTH = 8;
const TYPEFLAG_OFFSET = 156;
const MAGIC_OFFSET = 257;
const MAGIC_LENGTH = 6;
/** POSIX ustar magic (GNU tar's "ustar " has no prefix field). */
const USTAR_MAGIC = "ustar";
const PREFIX_OFFSET = 345;
const PREFIX_LENGTH = 155;

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

/** The bytes of a NUL-terminated field. */
function fieldBytes(bytes: Uint8Array, offset: number, length: number): Uint8Array {
  const field = bytes.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return end === -1 ? field : field.subarray(0, end);
}

/** A NUL-terminated ASCII field (magic, numbers), one character per byte so it never fails. */
function asciiField(header: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...fieldBytes(header, offset, length));
}

/** A NUL-terminated UTF-8 name; throws a tar error naming the header's byte offset if it does not decode. */
function nameField(bytes: Uint8Array, offset: number, length: number, headerOffset: number): string {
  try {
    return decoder.decode(fieldBytes(bytes, offset, length));
  } catch {
    throw new Error(`tar: undecodable name at byte ${headerOffset}`);
  }
}

/** An octal number field (NUL- or space-terminated); base-256 sizes (> 8 GiB) are not supported. */
function octal(header: Uint8Array, offset: number, length: number, name: string, headerOffset: number): number {
  const raw = asciiField(header, offset, length);
  const digits = raw.trim();
  if (!/^[0-7]+$/.test(digits)) throw new Error(`tar: bad ${name} field "${raw}" at byte ${headerOffset}`);
  return parseInt(digits, 8);
}

const isChecksumByte = (i: number): boolean => i >= CHECKSUM_OFFSET && i < CHECKSUM_OFFSET + CHECKSUM_LENGTH;

/** The header checksum: the sum of all its bytes, with the checksum field itself counted as spaces. */
function checksum(header: Uint8Array): number {
  let sum = 0;
  for (const [i, byte] of header.entries()) sum += isChecksumByte(i) ? 0x20 : byte;
  return sum;
}

const SPACE = 0x20;
const NEWLINE = 0x0a;

/** The `path` value of a pax extended header ("LEN key=value\n" records, LEN counting the whole record), if any. */
function paxPath(data: Uint8Array): string | undefined {
  let path: string | undefined;
  let at = 0;
  while (at < data.length && data[at] !== 0) {
    const space = data.indexOf(SPACE, at);
    const length = space === -1 ? NaN : Number(asciiField(data, at, space - at));
    const end = at + length;
    if (!Number.isInteger(length) || length <= 0 || end > data.length || space >= end || data[end - 1] !== NEWLINE) {
      throw new Error("tar: malformed pax header");
    }
    let record: string;
    try {
      record = decoder.decode(data.subarray(space + 1, end - 1));
    } catch {
      throw new Error("tar: malformed pax header");
    }
    const eq = record.indexOf("=");
    if (eq !== -1 && record.slice(0, eq) === "path") path = record.slice(eq + 1);
    at = end;
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
 * archive order. Handles ustar names with a prefix, pax `path` records and GNU long names; pax
 * global headers are skipped. Stops at the first all-zero block, or at the end of the stream if it
 * falls on an entry boundary, and always closes `source`'s iterator (also on an early stop or an
 * error). Throws on a bad header checksum, a malformed size or pax header, an undecodable name or a
 * truncated archive.
 */
export async function readTarEntries(source: AsyncIterable<Uint8Array>, wanted: (path: string) => boolean): Promise<TarEntry[]> {
  const iterator = source[Symbol.asyncIterator]();
  const reader = new ByteReader(iterator);
  const entries: TarEntry[] = [];
  let nextPath: string | undefined;
  try {
    for (;;) {
      const headerOffset = reader.offset;
      const header = await reader.read(BLOCK);
      if (header === undefined || header.every((byte) => byte === 0)) break;
      if (octal(header, CHECKSUM_OFFSET, CHECKSUM_LENGTH, "checksum", headerOffset) !== checksum(header)) {
        throw new Error(`tar: bad header checksum at byte ${headerOffset}`);
      }
      const size = octal(header, SIZE_OFFSET, SIZE_LENGTH, "size", headerOffset);
      const paddedSize = Math.ceil(size / BLOCK) * BLOCK;
      const type = String.fromCharCode(header[TYPEFLAG_OFFSET] ?? 0);

      if (type === TYPE_PAX || type === TYPE_GNU_LONG_NAME) {
        const data = (await reader.readExactly(paddedSize)).subarray(0, size);
        if (type === TYPE_PAX) nextPath = paxPath(data) ?? nextPath;
        else nextPath = nameField(data, 0, data.length, headerOffset);
        continue;
      }
      if (type === TYPE_PAX_GLOBAL) {
        await reader.skip(paddedSize);
        continue;
      }

      const path = nextPath ?? ustarPath(header, headerOffset);
      nextPath = undefined;
      const isFile = type === TYPE_FILE || type === TYPE_FILE_OLD || type === TYPE_CONTIGUOUS;
      if (isFile && wanted(path)) {
        entries.push({ path, data: (await reader.readExactly(paddedSize)).subarray(0, size) });
      } else {
        await reader.skip(paddedSize);
      }
    }
  } finally {
    await iterator.return?.();
  }
  return entries;
}

/** The entry path from the header itself: prefix + "/" + name for POSIX ustar, else the name alone. */
function ustarPath(header: Uint8Array, headerOffset: number): string {
  const name = nameField(header, NAME_OFFSET, NAME_LENGTH, headerOffset);
  const isUstar = asciiField(header, MAGIC_OFFSET, MAGIC_LENGTH) === USTAR_MAGIC;
  const prefix = isUstar ? nameField(header, PREFIX_OFFSET, PREFIX_LENGTH, headerOffset) : "";
  return prefix === "" ? name : `${prefix}/${name}`;
}
