/** Splits text into lines: strips a leading UTF-8 BOM and accepts LF or CRLF endings. */
export function splitLines(text: string): string[] {
  return text.replace(/^\uFEFF/, "").split(/\r?\n/);
}
