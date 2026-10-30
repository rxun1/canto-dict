import { createHash, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

/** Default cache dir, resolved relative to this package (not process.cwd()). */
const DEFAULT_CACHE_DIR = resolve(import.meta.dirname, "..", ".cache");

/** Absolute path of the cached copy of source `name` (whether or not it has been downloaded). */
export function cachedPath(name: string): string {
  return join(DEFAULT_CACHE_DIR, name);
}

export interface FetchToCacheOptions {
  cacheDir?: string;
  /**
   * Expected SHA-256 (lowercase hex) of the file, for sources that cannot be pinned by commit.
   * Checked on download and on every cached read; override files (CANTO_SRC_*) are never checked.
   */
  sha256?: string;
}

async function sha256OfFile(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function hashMismatchMessage(what: string, expected: string, actual: string): string {
  return (
    `${what} has SHA-256 ${actual}, expected ${expected}. ` +
    "The upstream file changed (or the cache is stale); if you accept the new data, " +
    "update the pinned hash in urls.ts deliberately."
  );
}

/** Env var that lets the user supply a source file by hand, e.g. CANTO_SRC_WORDSHK_DUMP for name "wordshk-dump". */
export function overrideEnvVar(name: string): string {
  return `CANTO_SRC_${name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the absolute path of the file for source `name`: the override file if
 * its env var is set, else the cached copy (downloaded from `url` on first use).
 */
export async function fetchToCache(
  url: string,
  name: string,
  options: FetchToCacheOptions = {},
): Promise<string> {
  const envVar = overrideEnvVar(name);
  const override = process.env[envVar];
  if (override) {
    const path = resolve(override);
    if (!(await exists(path))) {
      throw new Error(`${envVar} is set to ${path}, but that file does not exist`);
    }
    return path;
  }

  const target = options.cacheDir === undefined ? cachedPath(name) : join(resolve(options.cacheDir), name);
  if (await exists(target)) {
    if (options.sha256 !== undefined) {
      const actual = await sha256OfFile(target);
      if (actual !== options.sha256) {
        throw new Error(
          `Cached file ${target} (from ${url}): ${hashMismatchMessage("it", options.sha256, actual)} ` +
            "Delete the cached file to re-download.",
        );
      }
    }
    return target;
  }

  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${randomBytes(6).toString("hex")}`;
  console.log(`Downloading ${url} \u2192 ${target}`);
  let status: number | undefined;
  try {
    const response = await fetch(url);
    status = response.status;
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(response.statusText || "bad response");
    }
    if (response.headers.get("content-type")?.includes("text/html")) {
      await response.body.cancel();
      throw new Error(
        "got an HTML page, likely a proxy block/login page, instead of a data file",
      );
    }
    await pipeline(
      Readable.fromWeb(response.body as WebReadableStream),
      createWriteStream(tmp),
    );
    if (options.sha256 !== undefined) {
      const actual = await sha256OfFile(tmp);
      if (actual !== options.sha256) throw new Error(hashMismatchMessage(`the download of ${url}`, options.sha256, actual));
    }
    await rename(tmp, target);
    return target;
  } catch (err) {
    await rm(tmp, { force: true });
    let reason = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.cause instanceof Error) {
      // AggregateError (all addresses of a multi-address host failed) has an empty message.
      const detail = err.cause.message || (err.cause as NodeJS.ErrnoException).code;
      if (detail) reason += ` (${detail})`;
    }
    const statusNote = status === undefined ? "" : ` (HTTP ${status})`;
    throw new Error(`Failed to download ${url}: ${reason}${statusNote}`, { cause: err });
  }
}
