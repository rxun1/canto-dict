// All-or-nothing file writes: data goes to a uniquely named temporary file next to the target, which
// is then renamed over it, so a failed or concurrent build never leaves a half-written file and keeps
// the previous one.
import { randomBytes } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";

/** A fresh temporary path next to `path` (same directory, so the final rename stays on one file system). */
export const tempPathFor = (path: string): string => `${path}.tmp-${randomBytes(6).toString("hex")}`;

/** Writes `data` to `path` through a temporary file; on failure the temporary file is removed and `path` is untouched. */
export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const temp = tempPathFor(path);
  try {
    await writeFile(temp, data);
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}
