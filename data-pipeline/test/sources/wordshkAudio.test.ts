// words.hk syllable clips: the pinned tree listing, blob checks and the cached download.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchWordshkClips, gitBlobSha, parseClipTree } from "../../src/sources/wordshkAudio";

const FIXTURE_AUDIO_DIR = join(import.meta.dirname, "../../fixtures/audio");
/** Upstream blob SHA of fixtures/audio/aa1.mp3 (from the pinned tree). */
const AA1_BLOB_SHA = "358d3f6794efec215d7a867ada8bd0e9d98238bf";
const TREE_SHA = "c604e7eec402fab0a872ff70ae2554bc8c3201db";

const blob = (path: string, sha: string, size = 1) => ({ path, mode: "100644", type: "blob", sha, size });
const treeJson = (tree: object[], overrides: object = {}): string => JSON.stringify({ sha: TREE_SHA, tree, truncated: false, ...overrides });

describe("gitBlobSha", () => {
  it("matches git's blob SHA-1 of a real clip", async () => {
    expect(gitBlobSha(await readFile(join(FIXTURE_AUDIO_DIR, "aa1.mp3")))).toBe(AA1_BLOB_SHA);
  });
});

describe("parseClipTree", () => {
  it("returns one clip per <syllable>.mp3 blob, sorted by syllable", () => {
    const clips = parseClipTree(treeJson([blob("sik6.mp3", "b".repeat(40)), blob("aa1.mp3", AA1_BLOB_SHA, 2090)]), TREE_SHA);
    expect(clips).toEqual([
      { syllable: "aa1", file: "aa1.mp3", blobSha: AA1_BLOB_SHA },
      { syllable: "sik6", file: "sik6.mp3", blobSha: "b".repeat(40) },
    ]);
  });

  it("rejects a listing of another tree, a truncated listing and unexpected entries", () => {
    expect(() => parseClipTree(treeJson([]), "f".repeat(40))).toThrow(/tree c604e7e.*expected ffffff/);
    expect(() => parseClipTree(treeJson([], { truncated: true }), TREE_SHA)).toThrow(/truncated/);
    expect(() => parseClipTree(treeJson([blob("README.md", AA1_BLOB_SHA)]), TREE_SHA)).toThrow(/"README.md"/);
    expect(() => parseClipTree(treeJson([{ ...blob("aa1.mp3", AA1_BLOB_SHA), type: "tree" }]), TREE_SHA)).toThrow(/"aa1.mp3"/);
  });
});

describe("fetchWordshkClips", () => {
  let server: Server;
  let baseUrl: string;
  let cacheDir: string;
  let files: Record<string, Buffer | string>;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "canto-audio-dl-test-"));
    files = {};
    server = createServer((req, res) => {
      const body = files[req.url ?? ""];
      if (body === undefined) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(cacheDir, { recursive: true, force: true });
  });

  const options = () => ({ treeUrl: `${baseUrl}/tree`, treeSha: TREE_SHA, clipUrl: (file: string) => `${baseUrl}/clips/${file}`, cacheDir });

  it("downloads every listed clip into the cache and maps syllable → path", async () => {
    const aa1 = await readFile(join(FIXTURE_AUDIO_DIR, "aa1.mp3"));
    files["/tree"] = treeJson([blob("aa1.mp3", AA1_BLOB_SHA)]);
    files["/clips/aa1.mp3"] = aa1;
    const clips = await fetchWordshkClips(options());
    expect([...clips.keys()]).toEqual(["aa1"]);
    expect((await readFile(clips.get("aa1") ?? "")).equals(aa1)).toBe(true);
  });

  it("rejects and deletes a downloaded clip whose bytes do not match its blob SHA", async () => {
    files["/tree"] = treeJson([blob("aa1.mp3", AA1_BLOB_SHA)]);
    files["/clips/aa1.mp3"] = "not the clip";
    await expect(fetchWordshkClips(options())).rejects.toThrow(/aa1\.mp3 has blob SHA [0-9a-f]{40}, expected 358d3f6/);
    files["/clips/aa1.mp3"] = await readFile(join(FIXTURE_AUDIO_DIR, "aa1.mp3"));
    expect((await fetchWordshkClips(options())).has("aa1")).toBe(true);
  });

  it("rejects and deletes a cached clip that was edited", async () => {
    files["/tree"] = treeJson([blob("aa1.mp3", AA1_BLOB_SHA)]);
    files["/clips/aa1.mp3"] = await readFile(join(FIXTURE_AUDIO_DIR, "aa1.mp3"));
    const path = (await fetchWordshkClips(options())).get("aa1") ?? "";
    await writeFile(path, "edited");
    await expect(fetchWordshkClips(options())).rejects.toThrow(/aa1\.mp3 has blob SHA/);
    expect(existsSync(path)).toBe(false);
  });
});
