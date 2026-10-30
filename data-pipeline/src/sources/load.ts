import { readFile } from "node:fs/promises";
import { fetchToCache } from "../download";
import { formatProblems, type Parsed } from "./problems";

/**
 * Loader for tolerant sources: fetch (or use the cached/overridden file), parse as UTF-8, warn
 * about skipped rows, return the kept rows.
 */
export async function loadTolerant<T>(
  source: string,
  url: string,
  cacheName: string,
  parse: (text: string) => Parsed<T>,
  options: { sha256?: string } = {},
): Promise<T[]> {
  const path = await fetchToCache(url, cacheName, options);
  const { rows, skipped } = parse(await readFile(path, "utf8"));
  if (skipped.length > 0) console.warn(formatProblems(source, skipped));
  return rows;
}
