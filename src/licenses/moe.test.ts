// The app's copy of the MoE credit must match the data pipeline's (data-pipeline is outside the app's
// tsconfig and Jest, so the pipeline file is read as text). The usage notes must be the full text.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MOEDICT_ATTRIBUTION, MOEDICT_RELEASE, MOE_USAGE_NOTES } from "./moe";

const SOURCES_DIR = join(__dirname, "../../data-pipeline/src/sources");
const read = (file: string) => readFileSync(join(SOURCES_DIR, file), "utf8");

describe("MoE credit", () => {
  it("has the same release as the pipeline", () => {
    const release = read("urls.ts").match(/export const MOEDICT_RELEASE = "([^"]+)";/)?.[1];
    expect(release).toBeDefined();
    expect(MOEDICT_RELEASE).toBe(release);
  });

  it("matches the pipeline's MOEDICT_ATTRIBUTION", () => {
    const template = read("moedict.ts").match(/export const MOEDICT_ATTRIBUTION = `([^`]+)`;/)?.[1];
    expect(template).toBeDefined();
    expect(MOEDICT_ATTRIBUTION).toBe(template!.replace("${MOEDICT_RELEASE}", MOEDICT_RELEASE));
  });

  it("keeps the whole usage notes, from the title to the last clause", () => {
    const text = MOE_USAGE_NOTES.join("\n");
    expect(MOE_USAGE_NOTES[0]).toBe("《重編國語辭典修訂本》公眾授權使用說明");
    for (const heading of ["一、授權方式及範圍", "二、使用者承諾事項", "三、停止提供"]) expect(MOE_USAGE_NOTES).toContain(heading);
    expect(text).toContain("都必須完整保留本使用說明");
    expect(MOE_USAGE_NOTES[MOE_USAGE_NOTES.length - 1]).toMatch(/^\(二\) 教育部公開之資料與素材.*疑慮。$/);
  });
});
