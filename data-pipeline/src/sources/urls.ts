// Pinned source URLs. Dependency-free on purpose: scripts/gen-syllables.ts imports this
// and must not reach src/jyutping/syllableList.ts (the file it generates).

/** Pinned upstream commit of CanCLID/rime-cantonese-upstream, so rebuilds are reproducible. */
export const RIME_CHARS_COMMIT = "4cb67a486312e5f0f13cc842433617104d75de87";

export const RIME_CHARS_URL = `https://raw.githubusercontent.com/CanCLID/rime-cantonese-upstream/${RIME_CHARS_COMMIT}/char.csv`;

/** Cache name includes the short SHA so a different pin never reuses a stale download. */
export const RIME_CHARS_CACHE_NAME = `rime-char-${RIME_CHARS_COMMIT.slice(0, 7)}.csv`;
