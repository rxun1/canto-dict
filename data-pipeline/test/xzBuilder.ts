// Test helper: builds small .xz files in memory (not a test file itself). The data is stored, not
// compressed: one block holding LZMA2 "uncompressed" chunks, with check type None.
import { crc32 } from "node:zlib";

const STREAM_MAGIC = [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00];
const FOOTER_MAGIC = [0x59, 0x5a];
/** Stream flags: check type None. */
const STREAM_FLAGS = [0x00, 0x00];
const LZMA2_FILTER_ID = 0x21;
/** An LZMA2 uncompressed chunk that resets the dictionary; its size field holds size - 1. */
const LZMA2_UNCOMPRESSED_RESET = 0x01;
const LZMA2_END = 0x00;
const LZMA2_MAX_CHUNK = 0x10000;

const u32le = (value: number): number[] => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
const withCrc = (bytes: number[]): number[] => [...bytes, ...u32le(crc32(Uint8Array.from(bytes)))];
const padTo4 = (bytes: number[]): number[] => [...bytes, ...new Array((4 - (bytes.length % 4)) % 4).fill(0)];

/** xz's variable-length integer: 7 bits per byte, low bits first, high bit = more bytes follow. */
function varint(value: number): number[] {
  const out: number[] = [];
  let rest = value;
  while (rest >= 0x80) {
    out.push((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  out.push(rest);
  return out;
}

/** A valid single-stream .xz file whose decompressed content is `data`. */
export function buildXz(data: Uint8Array): Uint8Array {
  const streamHeader = [...STREAM_MAGIC, ...withCrc(STREAM_FLAGS)];

  // Block header: size byte, flags (one filter, no optional sizes), LZMA2 filter with a 1-byte dictionary property.
  const headerBody = padTo4([0, 0x00, LZMA2_FILTER_ID, 0x01, 0x00]);
  headerBody[0] = (headerBody.length + 4) / 4 - 1;
  const blockHeader = withCrc(headerBody);

  const compressed: number[] = [];
  for (let offset = 0; offset < data.length; offset += LZMA2_MAX_CHUNK) {
    const chunk = data.subarray(offset, offset + LZMA2_MAX_CHUNK);
    compressed.push(LZMA2_UNCOMPRESSED_RESET, ((chunk.length - 1) >> 8) & 0xff, (chunk.length - 1) & 0xff, ...chunk);
  }
  compressed.push(LZMA2_END);
  const unpaddedSize = blockHeader.length + compressed.length;
  const block = padTo4([...blockHeader, ...compressed]);

  const index = withCrc(padTo4([0x00, ...varint(1), ...varint(unpaddedSize), ...varint(data.length)]));
  const backwardSize = index.length / 4 - 1;
  // Unlike the other CRCs, the footer's comes first: CRC32(backward size, flags), backward size, flags, magic.
  const footerBody = [...u32le(backwardSize), ...STREAM_FLAGS];
  const streamFooter = [...u32le(crc32(Uint8Array.from(footerBody))), ...footerBody, ...FOOTER_MAGIC];

  return Uint8Array.from([...streamHeader, ...block, ...index, ...streamFooter]);
}
