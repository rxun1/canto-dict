import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

/** Default cache dir, resolved relative to this package (not process.cwd()). */
const DEFAULT_CACHE_DIR = resolve(import.meta.dirname, "..", ".cache");

export interface FetchToCacheOptions {
  cacheDir?: string;
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

  const cacheDir = resolve(options.cacheDir ?? DEFAULT_CACHE_DIR);
  const target = join(cacheDir, name);
  if (await exists(target)) return target;

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
    await rename(tmp, target);
    return target;
  } catch (err) {
    await rm(tmp, { force: true });
    let reason = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.cause instanceof Error) {
      reason += ` (${err.cause.message})`;
    }
    const statusNote = status === undefined ? "" : ` (HTTP ${status})`;
    throw new Error(`Failed to download ${url}: ${reason}${statusNote}`, { cause: err });
  }
}
