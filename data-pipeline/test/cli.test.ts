// The build runner (cli.ts): flag handling, exit codes, and the step order that keeps a failed
// validation from touching any asset.
import Database from "better-sqlite3";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, helpText, main, STEPS, type BuildConfig } from "../src/cli";
import { fixtureInputs } from "../src/fixtureInputs";
import { merge } from "../src/merge/merge";
import { MIN_SOURCE_ROWS, NO_MINIMUMS } from "../src/validate";

const FIXTURE_AUDIO_DIR = join(import.meta.dirname, "../fixtures/audio");
const fixtureClips = async (): Promise<Map<string, string>> =>
  new Map(["aa1", "faan6", "sik6"].map((s) => [s, join(FIXTURE_AUDIO_DIR, `${s}.mp3`)]));

/** Output paths in a fresh temp dir. */
function outputs() {
  const dir = mkdtempSync(join(tmpdir(), "canto-cli-test-"));
  return {
    db: join(dir, "canto.db"),
    pack: { packPath: join(dir, "syllables.pack"), indexPath: join(dir, "syllables.json") },
    report: join(dir, "build-report.html"),
  };
}

/** A full build (DB, audio pack, report) from the fixtures into `out`. */
function fullConfig(out: ReturnType<typeof outputs>, minimums = NO_MINIMUMS): BuildConfig {
  return {
    loadInputs: async () => fixtureInputs(),
    minimums,
    dbPath: out.db,
    audio: { loadClips: fixtureClips, outputs: out.pack, reportPath: out.report },
  };
}

const silenced = () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  return vi.spyOn(console, "error").mockImplementation(() => {});
};

afterEach(() => vi.restoreAllMocks());

describe("cli", () => {
  it("lists every step in the help text", () => {
    for (const step of STEPS) expect(helpText()).toContain(step);
  });

  it("prints help and exits 0 for --help", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const configFor = vi.fn();
    expect(await main(["--help"], configFor)).toBe(0);
    expect(log).toHaveBeenCalledWith(helpText());
    expect(configFor).not.toHaveBeenCalled();
  });

  it("rejects unknown flags and positional arguments with exit code 1, building nothing", async () => {
    const error = silenced();
    const configFor = vi.fn();
    expect(await main(["--fixtures"], configFor)).toBe(1);
    expect(error.mock.calls.flat().join("\n")).toContain("unknown argument: --fixtures");
    expect(await main(["build"], configFor)).toBe(1);
    expect(configFor).not.toHaveBeenCalled();
  });

  it("picks the fixture config for --fixture and the real one otherwise", async () => {
    silenced();
    const out = outputs();
    const configFor = vi.fn((_fixture: boolean): BuildConfig => ({ loadInputs: async () => fixtureInputs(), minimums: NO_MINIMUMS, dbPath: out.db }));
    expect(await main(["--fixture"], configFor)).toBe(0);
    expect(await main([], configFor)).toBe(0);
    expect(configFor.mock.calls).toEqual([[true], [false]]);
  });

  it("exits 1 and prints the error when a step throws", async () => {
    const error = silenced();
    const configFor = (): BuildConfig => ({
      loadInputs: async () => {
        throw new Error("download failed: boom");
      },
      minimums: NO_MINIMUMS,
      dbPath: outputs().db,
    });
    expect(await main([], configFor)).toBe(1);
    expect(error.mock.calls.flat().join("\n")).toContain("download failed: boom");
  });

  it("leaves canto.db, the audio pack and the report untouched when validate throws", async () => {
    silenced();
    const out = outputs();
    const paths = [out.db, out.pack.packPath, out.pack.indexPath, out.report];
    for (const path of paths) writeFileSync(path, `previous ${path}`);
    // The fixtures are far below the real minimums, so validate throws.
    await expect(build(fullConfig(out, MIN_SOURCE_ROWS))).rejects.toThrow(/below their minimum row count/);
    for (const path of paths) expect(readFileSync(path, "utf8")).toBe(`previous ${path}`);
  });

  it("checks the clip count before packing: too few clips fails validation and writes nothing", async () => {
    silenced();
    const out = outputs();
    await expect(build(fullConfig(out, { ...NO_MINIMUMS, audioClips: 4 }))).rejects.toThrow(/audioClips: 3 rows \(minimum 4\)/);
    for (const path of [out.db, out.pack.packPath, out.pack.indexPath, out.report]) expect(existsSync(path), path).toBe(false);
  });

  it("writes canto.db, the audio pack and the report", async () => {
    silenced();
    const out = outputs();
    const summary = await build(fullConfig(out));
    const { entries } = merge(fixtureInputs());
    const db = new Database(out.db, { readonly: true });
    expect((db.prepare("SELECT count(*) AS n FROM entries").get() as { n: number }).n).toBe(entries.length);
    db.close();
    expect(Object.keys(JSON.parse(readFileSync(out.pack.indexPath, "utf8")))).toEqual(["aa1", "faan6", "sik6"]);
    const html = readFileSync(out.report, "utf8");
    expect(html).toContain("canto-dict build report");
    expect(html).toContain("Clips packed");
    expect(summary.entries).toBe(entries.length);
    expect(summary.packBytes).toBeGreaterThan(0);
  });

  it("writes only canto.db when the config has no audio (the fixture build)", async () => {
    silenced();
    const out = outputs();
    await build({ loadInputs: async () => fixtureInputs(), minimums: NO_MINIMUMS, dbPath: out.db });
    expect(existsSync(out.db)).toBe(true);
    for (const path of [out.pack.packPath, out.pack.indexPath, out.report]) expect(existsSync(path), path).toBe(false);
  });
});
