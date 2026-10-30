import { readFile } from "node:fs/promises";
import { fetchToCache, type FetchToCacheOptions } from "../download";
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
  options: Pick<FetchToCacheOptions, "sha256"> & {
    /** Turns the cached file into text; defaults to reading it as UTF-8 (override for e.g. a zip). */
    readText?: (path: string) => Promise<string>;
  } = {},
): Promise<T[]> {
  const { readText = (p: string) => readFile(p, "utf8"), ...fetchOptions } = options;
  const path = await fetchToCache(url, cacheName, fetchOptions);
  const { rows, skipped } = parse(await readText(path));
  if (skipped.length > 0) console.warn(formatProblems(source, skipped));
  return rows;
}
