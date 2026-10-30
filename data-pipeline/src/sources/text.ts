/** Splits text into lines: strips a leading UTF-8 BOM and accepts LF or CRLF endings. */
export function splitLines(text: string): string[] {
  return text.replace(/^\uFEFF/, "").split(/\r?\n/);
}

/** Line that ends the YAML front matter of a Rime dictionary file. */
export const RIME_DICT_END_MARKER = "...";

/**
 * Body of a Rime `.dict.yaml`: the lines after the YAML end marker, minus blank lines and `#`
 * comments, each with its 1-based line number. Throws if the end marker is missing, so a
 * malformed file is never silently parsed as all data.
 */
export function rimeDictBody(text: string): { lineNumber: number; line: string }[] {
  const lines = splitLines(text);
  const end = lines.findIndex((l) => l.trim() === RIME_DICT_END_MARKER);
  if (end === -1) throw new Error(`Rime dict: YAML end marker "${RIME_DICT_END_MARKER}" not found`);
  return lines
    .map((line, index) => ({ lineNumber: index + 1, line }))
    .slice(end + 1)
    .filter(({ line }) => line.trim() !== "" && !line.startsWith("#"));
}
