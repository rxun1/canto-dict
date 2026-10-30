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

/**
 * words.hk word list (public domain, credit appreciated). words.hk regenerates this file daily and
 * publishes no commit to pin, so the download is pinned by content hash instead: a refresh that
 * changes the bytes fails loudly. Bumping WORDSHK_LIST_SHA256 is a deliberate act: re-fetch,
 * review the diff and the parser's skipped counts, then update this hash (the cache name follows it).
 */
export const WORDSHK_LIST_URL = "https://words.hk/faiman/analysis/wordslist.csv";

export const WORDSHK_LIST_SHA256 = "617e714fdcf0a5bfb327c61952c1f2c2b9f5bea3d713bd5aac42aa5714ea033b";

export const WORDSHK_LIST_CACHE_NAME = `wordshk-list-${shortSha(WORDSHK_LIST_SHA256)}.csv`;

/**
 * Kaifangcidian 開放詞典 Cantonese dictionary (CC BY 3.0). The site ships only a zip of 22 variant
 * files (traditional/simplified x 11 romanization schemes) and publishes no commit, so the download
 * is pinned by the zip's SHA-256 and we read one entry out of it: the simplified-Chinese, Yale-with-
 * numeric-tones file. To bump: re-download the zip from KAIFANGCIDIAN_URL, run
 * `shasum -a 256` on it, check that KAIFANGCIDIAN_ZIP_ENTRY still exists (its name carries the
 * release date) and review the parser's skipped counts, then update both constants (the cache name
 * follows the hash).
 */
export const KAIFANGCIDIAN_URL = "https://kaifangcidian.com/xiazai/cidian_zhyue-kfcd.zip";

export const KAIFANGCIDIAN_SHA256 = "7ae8f790b2d93931573a090f41e1298e74e59bec91128b937b0e47a310b8aad0";

export const KAIFANGCIDIAN_CACHE_NAME = `kaifangcidian-zhyue-${shortSha(KAIFANGCIDIAN_SHA256)}.zip`;

/** The zip entry we parse: cidian_zhyue, jt = simplified (簡體), ylshu = Yale, numeric tones. */
export const KAIFANGCIDIAN_ZIP_ENTRY = "cidian_zhyue-jt-kfcd-ylshu-2021714.txt";
