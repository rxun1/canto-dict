// Test helper: builds small ustar/pax tar archives in memory (not a test file itself).

const BLOCK = 512;
const encoder = new TextEncoder();

function writeOctal(header: Uint8Array, offset: number, length: number, value: number): void {
  header.set(encoder.encode(`${value.toString(8).padStart(length - 1, "0")}\0`), offset);
}

/** One 512-byte ustar header with a valid checksum. */
export function tarHeader(name: string, size: number, typeflag: string, prefix = ""): Uint8Array {
  const header = new Uint8Array(BLOCK);
  header.set(encoder.encode(name).subarray(0, 100), 0);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header[156] = typeflag.charCodeAt(0);
  header.set(encoder.encode("ustar\0"), 257);
  header.set(encoder.encode("00"), 263);
  header.set(encoder.encode(prefix), 345);
  header.fill(0x20, 148, 156);
  const sum = header.reduce((total, byte) => total + byte, 0);
  header.set(encoder.encode(`${sum.toString(8).padStart(6, "0")}\0 `), 148);
  return header;
}

function padded(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.ceil(data.length / BLOCK) * BLOCK);
  out.set(data);
  return out;
}

/** A regular file (or other typeflag) entry: header plus zero-padded data. */
export function tarFile(name: string, content: string | Uint8Array, typeflag = "0", prefix = ""): Uint8Array[] {
  const data = typeof content === "string" ? encoder.encode(content) : content;
  return [tarHeader(name, data.length, typeflag, prefix), padded(data)];
}

/** A pax extended header ("x") carrying `path`, which applies to the next entry. */
export function paxPath(path: string): Uint8Array[] {
  const body = ` path=${path}\n`;
  // A pax record's length counts its own decimal digits too.
  const bodyLength = encoder.encode(body).length;
  let length = bodyLength;
  while (String(length).length + bodyLength !== length) length = String(length).length + bodyLength;
  return tarFile("././@PaxHeader", `${length}${body}`, "x");
}

/** The two zero blocks that end an archive. */
export const TAR_END = new Uint8Array(2 * BLOCK);

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Yields `bytes` in chunks of `size` bytes, to exercise chunk boundaries. */
export async function* chunked(bytes: Uint8Array, size: number): AsyncGenerator<Uint8Array> {
  for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size);
}
