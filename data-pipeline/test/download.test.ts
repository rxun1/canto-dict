import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchToCache, overrideEnvVar } from "../src/download";

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
    expect(err.message).toContain("404");
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
    process.env[overrideEnvVar("wordshk-all.csv.gz")] = manual;
    const path = await fetchToCache(`${baseUrl}/ok.txt`, "wordshk-all.csv.gz", { cacheDir });
    expect(path).toBe(manual);
    expect(requestCount).toBe(0);
  });

  it("throws naming the variable and path when the override file is missing", async () => {
    const missing = join(cacheDir, "nope.gz");
    process.env[overrideEnvVar("wordshk-all.csv.gz")] = missing;
    const err = await fetchToCache(`${baseUrl}/ok.txt`, "wordshk-all.csv.gz", { cacheDir }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("CANTO_SRC_WORDSHK_ALL_CSV_GZ");
    expect(err.message).toContain(missing);
    expect(requestCount).toBe(0);
  });
});
