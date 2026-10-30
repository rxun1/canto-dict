// Pinned source URLs. Dependency-free on purpose: scripts/gen-syllables.ts imports this
// and must not reach src/jyutping/syllableList.ts (the file it generates).

const shortSha = (sha: string): string => sha.slice(0, 7);

/** Pinned upstream commit of CanCLID/rime-cantonese-upstream, so rebuilds are reproducible. */
export const RIME_CHARS_COMMIT = "4cb67a486312e5f0f13cc842433617104d75de87";

export const RIME_CHARS_URL = `https://raw.githubusercontent.com/CanCLID/rime-cantonese-upstream/${RIME_CHARS_COMMIT}/char.csv`;

/** Cache name includes the short SHA so a different pin never reuses a stale download. */
export const RIME_CHARS_CACHE_NAME = `rime-char-${shortSha(RIME_CHARS_COMMIT)}.csv`;

/**
 * Pinned upstream commit of rime/rime-cantonese (jyut6ping3.words.dict.yaml).
 * After bumping this, re-run scripts/gen-syllables.ts: the dict also feeds the attested syllable list.
 */
export const RIME_WORDS_COMMIT = "259f0e48bba840c3a2e0d117539e96937f3d89bc";

export const RIME_WORDS_URL = `https://raw.githubusercontent.com/rime/rime-cantonese/${RIME_WORDS_COMMIT}/jyut6ping3.words.dict.yaml`;

export const RIME_WORDS_CACHE_NAME = `rime-words-${shortSha(RIME_WORDS_COMMIT)}.dict.yaml`;

/**
 * Pinned upstream commit of lshk-org/jyutping-table (list.tsv, CC BY 4.0).
 * After bumping this, re-run scripts/gen-syllables.ts: the table also feeds the attested syllable list.
 */
export const LSHK_COMMIT = "dad2dd6d6f02fc51138ecc6818f7b38eba5c2ad3";

export const LSHK_URL = `https://raw.githubusercontent.com/lshk-org/jyutping-table/${LSHK_COMMIT}/list.tsv`;

export const LSHK_CACHE_NAME = `lshk-list-${shortSha(LSHK_COMMIT)}.tsv`;

/**
 * Pinned commit of unicode-org/unihan-database (kCantonese.txt, Unicode License v3). That repo is the
 * plain-text, commit-pinnable home of the property; its file lines are `U+XXXX <char>TAB kCantonese TAB value`.
 * As of this pin its 29936 rows match the Unihan 17.0.0 release's kCantonese rows exactly.
 */
export const UNIHAN_COMMIT = "9ca8f73b44b2dd1bee180447537a2af2f437ae12";

export const UNIHAN_URL = `https://raw.githubusercontent.com/unicode-org/unihan-database/${UNIHAN_COMMIT}/kCantonese.txt`;

export const UNIHAN_CACHE_NAME = `unihan-kcantonese-${shortSha(UNIHAN_COMMIT)}.txt`;
