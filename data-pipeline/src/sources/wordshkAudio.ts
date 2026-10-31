// words.hk female syllable recordings from AlienKevin/wordshk_app (spec §4.1: no published licence,
// personal use only). The folder is listed once through the GitHub trees API at a pinned tree SHA, then
// every clip is fetched from raw.githubusercontent.com at the pinned commit and checked against the
// blob SHA-1 the listing gives it, so a cached or downloaded clip can never silently differ from the listing.
import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { TONED_SYLLABLE } from "../../../src/jyutping/pattern";
import { byCodeUnits } from "../compare";
import { mapConcurrent } from "../concurrency";
import { cachedPath, fetchToCache, overrideEnvVar } from "../download";
import {
  WORDSHK_AUDIO_CACHE_DIR,
  WORDSHK_AUDIO_TREE_CACHE_NAME,
  WORDSHK_AUDIO_TREE_SHA,
  WORDSHK_AUDIO_TREE_URL,
  wordshkAudioClipUrl,
} from "./urls";

const SOURCE_NAME = "words.hk syllable audio";

/** Clip files are named <toned syllable>.mp3, e.g. aa1.mp3. */
const CLIP_SUFFIX = ".mp3";

/** Parallel downloads from raw.githubusercontent.com: enough to hide latency without hammering it. */
const DOWNLOAD_CONCURRENCY = 16;

export interface ClipListing {
  readonly syllable: string;
  /** Upstream file name, e.g. "aa1.mp3". */
  readonly file: string;
  /** Git blob SHA-1 of the file's bytes. */
  readonly blobSha: string;
}

/** Git's blob SHA-1 of `bytes`: sha1("blob <size>\0" + bytes), as listed in a tree. */
export function gitBlobSha(bytes: Uint8Array): string {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

interface TreeResponse {
  sha?: unknown;
  truncated?: unknown;
  tree?: { path?: unknown; type?: unknown; sha?: unknown }[];
}

/**
 * Parses a GitHub trees API response for the clip folder into one listing per clip, sorted by
 * syllable. Throws if it describes another tree than `expectedSha`, is truncated, or holds anything
 * but <toned syllable>.mp3 blobs.
 */
export function parseClipTree(json: string, expectedSha: string): ClipListing[] {
  const response = JSON.parse(json) as TreeResponse;
  if (response.sha !== expectedSha) {
    throw new Error(`${SOURCE_NAME}: listing is of tree ${String(response.sha)}, expected ${expectedSha}`);
  }
  if (response.truncated !== false || !Array.isArray(response.tree)) {
    throw new Error(`${SOURCE_NAME}: tree listing is truncated or malformed`);
  }
  const clips = response.tree.map((entry): ClipListing => {
    const file = String(entry.path);
    const syllable = file.endsWith(CLIP_SUFFIX) ? file.slice(0, -CLIP_SUFFIX.length) : "";
    if (entry.type !== "blob" || typeof entry.sha !== "string" || !TONED_SYLLABLE.test(syllable)) {
      throw new Error(`${SOURCE_NAME}: unexpected tree entry "${file}" (want <toned syllable>${CLIP_SUFFIX} blobs only)`);
    }
    return { syllable, file, blobSha: entry.sha };
  });
  return clips.sort((a, b) => byCodeUnits(a.syllable, b.syllable));
}

/** Whether `path` is `dir` or lies under it. */
function isInside(dir: string, path: string): boolean {
  const rel = relative(dir, path);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

export interface FetchWordshkClipsOptions {
  /** Overrides for tests; default to the pinned constants in urls.ts and the package cache. */
  treeUrl?: string;
  treeSha?: string;
  clipUrl?: (file: string) => string;
  cacheDir?: string;
}

/**
 * Downloads (or reuses from the cache) every clip of the pinned folder and returns syllable → absolute
 * path, sorted by syllable. A clip whose bytes do not match its listed blob SHA makes the call throw;
 * a cached clip is deleted first, so the next run downloads it again, but an override file (CANTO_SRC_*)
 * is left alone.
 */
export async function fetchWordshkClips(options: FetchWordshkClipsOptions = {}): Promise<Map<string, string>> {
  const treeSha = options.treeSha ?? WORDSHK_AUDIO_TREE_SHA;
  const clipUrl = options.clipUrl ?? wordshkAudioClipUrl;
  const cache = { cacheDir: options.cacheDir };
  const cacheRoot = options.cacheDir === undefined ? cachedPath("") : resolve(options.cacheDir);
  const treePath = await fetchToCache(options.treeUrl ?? WORDSHK_AUDIO_TREE_URL, WORDSHK_AUDIO_TREE_CACHE_NAME, cache);
  const listing = parseClipTree(await readFile(treePath, "utf8"), treeSha);

  const paths = await mapConcurrent(
    listing,
    async ({ file, blobSha }) => {
      const name = join(WORDSHK_AUDIO_CACHE_DIR, file);
      const path = await fetchToCache(clipUrl(file), name, cache);
      const actual = gitBlobSha(await readFile(path));
      if (actual !== blobSha) {
        const mismatch = `${SOURCE_NAME}: ${file} has blob SHA ${actual}, expected ${blobSha}`;
        // fetchToCache returns the user's own file when its override env var is set; never delete that.
        if (!isInside(cacheRoot, path)) throw new Error(`${mismatch}; ${path} (from ${overrideEnvVar(name)}) is not the upstream clip`);
        await rm(path, { force: true });
        throw new Error(`${mismatch}; deleted ${path}, re-run to download it again`);
      }
      return path;
    },
    DOWNLOAD_CONCURRENCY,
  );
  return new Map(listing.map(({ syllable }, i) => [syllable, paths[i]]));
}
