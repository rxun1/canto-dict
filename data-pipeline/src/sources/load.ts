import { readFile } from "node:fs/promises";
import { fetchToCache, type FetchToCacheOptions } from "../download";
import { formatProblems, type Parsed } from "./problems";

/** Warns about the rows a tolerant parser skipped, then returns the rows it kept. */
export function keptRows<T>(source: string, { rows, skipped }: Parsed<T>): T[] {
  if (skipped.length > 0) console.warn(formatProblems(source, skipped));
  return rows;
}

/**
 * Loader for tolerant sources: fetch (or use the cached/overridden file), parse as UTF-8, warn
 * about skipped rows, return the kept rows.
 */
export async function loadTolerant<T>(
  source: string,
  url: string,
  cacheName: string,
  parse: (text: string) => Parsed<T>,
  options: Pick<FetchToCacheOptions, "sha256"> = {},
): Promise<T[]> {
  const path = await fetchToCache(url, cacheName, options);
  return keptRows(source, parse(await readFile(path, "utf8")));
}
