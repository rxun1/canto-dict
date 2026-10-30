import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchToCache, overrideEnvVar } from "../src/download";

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

let server: Server;
let baseUrl: string;
let requestCount: number;
let cacheDir: string;
const savedEnv = { ...process.env };

beforeEach(async () => {
  requestCount = 0;
  cacheDir = await mkdtemp(join(tmpdir(), "canto-dl-test-"));
  server = createServer((req, res) => {
    requestCount += 1;
    if (req.url === "/ok.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("hello cache");
    } else if (req.url === "/html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<html>Blocked by proxy</html>");
    } else if (req.url === "/broken") {
      // Promise more bytes than we send, then kill the socket mid-body.
      res.writeHead(200, { "content-length": "1000" });
      res.write("partial");
      setTimeout(() => res.destroy(), 20);
    } else {
      res.writeHead(404);
      res.end("nope");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) delete process.env[key];
  }
  Object.assign(process.env, savedEnv);
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(cacheDir, { recursive: true, force: true });
});

describe("overrideEnvVar", () => {
  it("uppercases and replaces non-alphanumerics with underscores", () => {
    expect(overrideEnvVar("wordshk-dump")).toBe("CANTO_SRC_WORDSHK_DUMP");
    expect(overrideEnvVar("wordshk-all.csv.gz")).toBe("CANTO_SRC_WORDSHK_ALL_CSV_GZ");
  });
});

describe("fetchToCache", () => {
  it("downloads into the cache dir under the given name", async () => {
    const path = await fetchToCache(`${baseUrl}/ok.txt`, "ok.txt", { cacheDir });
    expect(path).toBe(join(cacheDir, "ok.txt"));
    expect(await readFile(path, "utf8")).toBe("hello cache");
    expect(requestCount).toBe(1);
  });

  it("creates the cache dir if missing", async () => {
    const nested = join(cacheDir, "a", "b");
    const path = await fetchToCache(`${baseUrl}/ok.txt`, "ok.txt", { cacheDir: nested });
    expect(await readFile(path, "utf8")).toBe("hello cache");
  });

  it("does not hit the server on the second call", async () => {
    const first = await fetchToCache(`${baseUrl}/ok.txt`, "ok.txt", { cacheDir });
    const second = await fetchToCache(`${baseUrl}/ok.txt`, "ok.txt", { cacheDir });
    expect(second).toBe(first);
    expect(requestCount).toBe(1);
  });

  it("throws naming the URL and status on HTTP 404, leaving no files", async () => {
    const url = `${baseUrl}/missing`;
    const err = await fetchToCache(url, "missing.txt", { cacheDir }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain(url);
    expect(err.message).toContain("Not Found (HTTP 404)");
    expect(await readdir(cacheDir)).toEqual([]);
  });

  it("leaves no partial file when the connection dies mid-body", async () => {
    const url = `${baseUrl}/broken`;
    const err = await fetchToCache(url, "broken.bin", { cacheDir }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain(url);
    expect(await readdir(cacheDir)).toEqual([]);
  });

  it("uses the override path instead of downloading", async () => {
    const manual = join(cacheDir, "manual.gz");
    await writeFile(manual, "manual");
    process.env[overrideEnvVar("wordshk-dump")] = manual;
    const path = await fetchToCache(`${baseUrl}/ok.txt`, "wordshk-dump", { cacheDir });
    expect(path).toBe(manual);
    expect(requestCount).toBe(0);
  });

  it("throws naming the variable and path when the override file is missing", async () => {
    const missing = join(cacheDir, "nope.gz");
    process.env[overrideEnvVar("wordshk-dump")] = missing;
    const err = await fetchToCache(`${baseUrl}/ok.txt`, "wordshk-dump", { cacheDir }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("CANTO_SRC_WORDSHK_DUMP");
    expect(err.message).toContain(missing);
    expect(requestCount).toBe(0);
  });

  it("rejects a 200 text/html page and leaves no files", async () => {
    const url = `${baseUrl}/html`;
    const err = await fetchToCache(url, "a.zip", { cacheDir }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain(url);
    expect(err.message).toContain("HTML page");
    expect(await readdir(cacheDir)).toEqual([]);
  });

  it("includes the underlying cause for network failures", async () => {
    const port = (server.address() as AddressInfo).port;
    await new Promise((resolve) => server.close(resolve));
    const err = await fetchToCache(`http://127.0.0.1:${port}/ok.txt`, "x", { cacheDir }).catch((e) => e);
    expect(err.message).toMatch(/fetch failed \(.+\)/);
    expect(await readdir(cacheDir)).toEqual([]);
  });

  it("treats an empty override env var as unset", async () => {
    process.env[overrideEnvVar("ok.txt")] = "";
    const path = await fetchToCache(`${baseUrl}/ok.txt`, "ok.txt", { cacheDir });
    expect(path).toBe(join(cacheDir, "ok.txt"));
    expect(requestCount).toBe(1);
  });
});

describe("fetchToCache sha256 pin", () => {
  it("accepts a download whose hash matches", async () => {
    const path = await fetchToCache(`${baseUrl}/ok.txt`, "ok.txt", { cacheDir, sha256: sha256("hello cache") });
    expect(await readFile(path, "utf8")).toBe("hello cache");
  });

  it("throws on a hash mismatch, naming the URL and both hashes, and leaves no file", async () => {
    const url = `${baseUrl}/ok.txt`;
    const expected = sha256("something else");
    const err = await fetchToCache(url, "ok.txt", { cacheDir, sha256: expected }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain(url);
    expect(err.message).toContain(expected);
    expect(err.message).toContain(sha256("hello cache"));
    expect(err.message).toMatch(/update the pinned hash in urls\.ts/);
    expect(await readdir(cacheDir)).toEqual([]);
  });

  it("verifies a cached file's hash instead of trusting it", async () => {
    await writeFile(join(cacheDir, "ok.txt"), "stale content");
    const err = await fetchToCache(`${baseUrl}/ok.txt`, "ok.txt", { cacheDir, sha256: sha256("hello cache") }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain(sha256("stale content"));
    expect(err.message).toContain(sha256("hello cache"));
    expect(requestCount).toBe(0);
  });

  it("returns a cached file whose hash matches without downloading", async () => {
    await writeFile(join(cacheDir, "ok.txt"), "hello cache");
    const path = await fetchToCache(`${baseUrl}/ok.txt`, "ok.txt", { cacheDir, sha256: sha256("hello cache") });
    expect(path).toBe(join(cacheDir, "ok.txt"));
    expect(requestCount).toBe(0);
  });

  it("does not hash-check an override file", async () => {
    const manual = join(cacheDir, "manual.csv");
    await writeFile(manual, "my own data");
    process.env[overrideEnvVar("pinned")] = manual;
    const path = await fetchToCache(`${baseUrl}/ok.txt`, "pinned", { cacheDir, sha256: sha256("hello cache") });
    expect(path).toBe(manual);
  });
});
