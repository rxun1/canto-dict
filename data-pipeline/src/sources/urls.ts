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
 * Bumping it also moves the essay-cantonese.txt pin (RIME_ESSAY_COMMIT aliases it), so review that
 * parser's skipped rows too.
 */
export const RIME_WORDS_COMMIT = "259f0e48bba840c3a2e0d117539e96937f3d89bc";

export const RIME_WORDS_URL = `https://raw.githubusercontent.com/rime/rime-cantonese/${RIME_WORDS_COMMIT}/jyut6ping3.words.dict.yaml`;

export const RIME_WORDS_CACHE_NAME = `rime-words-${shortSha(RIME_WORDS_COMMIT)}.dict.yaml`;

/**
 * rime-cantonese's essay-cantonese.txt (CC BY 4.0, like the rest of the repo except
 * jyut6ping3.maps), the word-frequency "vocabulary" its jyut6ping3.dict.yaml ranks candidates with.
 * Pinned to the same snapshot as the words dict, so frequencies and readings come from one commit
 * (at this pin: 266,870 lines, 3,416,812 bytes; last changed in e55b938, 2026-06-29). If you bump
 * one independently, give this its own commit constant and review the parser's skipped rows.
 *
 * Caveat: the corpus is mixed. Words Cifu (a Hong Kong Cantonese frequency lexicon) has carry its
 * rescaled Cantonese counts; all other words carry rime-essay's Mandarin counts (see WordFrequency).
 *
 * Why this source (compared 2026-10-30, distinct words): essay covers 60.7% of the rime words dict
 * and 64.9% of the words.hk list. Cifu (gwinterstein/Cifu) covers only 18.1% / 35.0%, is GPL-3.0,
 * last changed in 2020, and 97% of its words are already in essay. HKCanCor (fcbond/hkcancor) is a
 * ~230k-token corpus, not a frequency list.
 */
export const RIME_ESSAY_COMMIT = RIME_WORDS_COMMIT;

export const RIME_ESSAY_URL = `https://raw.githubusercontent.com/rime/rime-cantonese/${RIME_ESSAY_COMMIT}/essay-cantonese.txt`;

export const RIME_ESSAY_CACHE_NAME = `rime-essay-cantonese-${shortSha(RIME_ESSAY_COMMIT)}.txt`;

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
 * is pinned by the zip's SHA-256 and we read two entries out of it: the traditional and simplified Yale-with-
 * numeric-tones files. To bump: re-download the zip from KAIFANGCIDIAN_URL, run
 * `shasum -a 256` on it, check that both KAIFANGCIDIAN_ZIP_ENTRY_* names still exist (its name carries the
 * release date) and review the parser's skipped counts, then update both constants (the cache name
 * follows the hash).
 */
export const KAIFANGCIDIAN_URL = "https://kaifangcidian.com/xiazai/cidian_zhyue-kfcd.zip";

export const KAIFANGCIDIAN_SHA256 = "7ae8f790b2d93931573a090f41e1298e74e59bec91128b937b0e47a310b8aad0";

export const KAIFANGCIDIAN_CACHE_NAME = `kaifangcidian-zhyue-${shortSha(KAIFANGCIDIAN_SHA256)}.zip`;

/**
 * The two zip entries we parse together: cidian_zhyue, ylshu = Yale with numeric tones. They are the
 * same dictionary line for line, one in traditional (ft, 繁體) and one in simplified (jt, 簡體) Chinese.
 */
export const KAIFANGCIDIAN_ZIP_ENTRY_TRAD = "cidian_zhyue-ft-kfcd-ylshu-2021714.txt";

export const KAIFANGCIDIAN_ZIP_ENTRY_SIMP = "cidian_zhyue-jt-kfcd-ylshu-2021714.txt";

/**
 * kaikki.org's tarball of every English Wiktionary Lua module (CC BY-SA 4.0 + GFDL, like all
 * Wiktionary text), from which we read only the Chinese dialectal-synonym tables
 * Module:zh/data/dial-syn/<word> (3,774 entries in this copy). kaikki rebuilds the tarball about
 * weekly at the same URL and keeps no old copies, so it is pinned by SHA-256 (this copy:
 * Last-Modified 2026-10-25, module pages dated 2026-10-23; 93,949,335 bytes) and a fresh download
 * fails loudly once upstream moves on. That is why the pipeline never downloads it: it reads the
 * committed extract data/wiktionary-dialsyn.json, which only scripts/gen-dialsyn.ts (run by hand)
 * builds from this tarball. To bump: download WIKTIONARY_DIALSYN_URL, run `shasum -a 256` on it,
 * update the hash (the cache name follows it), run `npx tsx scripts/gen-dialsyn.ts`, and review its
 * skipped modules and the extract's diff. The loader rejects an extract made from another hash.
 */
export const WIKTIONARY_DIALSYN_URL = "https://kaikki.org/dictionary/wiktionary-modules.tar.gz";

export const WIKTIONARY_DIALSYN_SHA256 = "434fffa3b4afc5cc94699a9e2e4055dd55a678a65cc21b3fe4427b5a983b2c30";

export const WIKTIONARY_DIALSYN_CACHE_NAME = `wiktionary-modules-${shortSha(WIKTIONARY_DIALSYN_SHA256)}.tar.gz`;

/** Wiktionary page-name prefix of the dial-syn tables (Module:zh/data/dial-syn/<word>). */
export const WIKTIONARY_DIALSYN_PAGE_PREFIX = "Module:zh/data/dial-syn/";

/** kaikki stores the page Module:X as the tar entry Module/X.txt. */
export const WIKTIONARY_MODULE_TAR_SUFFIX = ".txt";

/** Directory of the dial-syn tables inside the tarball, derived from the page prefix. */
export const WIKTIONARY_DIALSYN_TAR_DIR = WIKTIONARY_DIALSYN_PAGE_PREFIX.replace(/^Module:/, "Module/");

/**
 * Pinned commit of g0v/moedict-data (dict-revised.json.xz): g0v's JSON conversion of the Ministry of
 * Education's 《重編國語辭典修訂本》 (CC BY-ND 3.0 TW), 161,194 entries; 14,739,512 bytes of xz
 * (80,300,977 bytes of JSON) at this pin. g0v has no JSON of the smaller 《國語辭典簡編本》, so the
 * revised edition is the one we use. To bump: check the new commit's message for the MoE release it
 * imports and update MOEDICT_RELEASE with it (the attribution cites it), then review the parser's
 * skipped counts.
 */
export const MOEDICT_COMMIT = "a6dc997417507eb510fc29822bc514de2c92728c";

/** MoE's 版本編號 of the dictionary text at MOEDICT_COMMIT, from g0v commit 2c6ffd0 ("Update: dict_revised_2015_20260625 from MOE"). */
export const MOEDICT_RELEASE = "2015_20260625";

export const MOEDICT_URL = `https://raw.githubusercontent.com/g0v/moedict-data/${MOEDICT_COMMIT}/dict-revised.json.xz`;

export const MOEDICT_CACHE_NAME = `moedict-revised-${shortSha(MOEDICT_COMMIT)}.json.xz`;

/**
 * Pinned commit of AlienKevin/wordshk_app, whose assets/jyutping_female holds words.hk's female
 * syllable recordings (3,902 MP3s, one per toned syllable, e.g. aa1.mp3; 9,783,518 bytes in all).
 * They have no published licence: personal use only, never redistribute (spec §4.1), which is why
 * the built syllables.pack is git-ignored. Only the 3 clips in fixtures/audio are committed, for tests.
 *
 * The repo snapshot is ~1.6 GB (codeload does not even start streaming its tarball within 15 s), so
 * instead of extracting the folder from a tarball we list it once through the GitHub trees API and
 * fetch each clip from raw.githubusercontent.com at this commit (~10 MB in all). To bump: look up
 * the new commit's assets/jyutping_female tree SHA (GET /repos/AlienKevin/wordshk_app/contents/assets?ref=<sha>)
 * and update both constants; the cache names follow them.
 */
export const WORDSHK_AUDIO_COMMIT = "1571375f5daceab45d0393ac5a1a72b6a47067c0";

/**
 * Git tree SHA of assets/jyutping_female at WORDSHK_AUDIO_COMMIT. The listing is requested by this SHA
 * and parseClipTree checks that the response echoes it, but the entries are not re-hashed against it:
 * the file list and blob SHAs are trusted as GitHub (or the cached listing) returns them. Each clip is
 * then checked against its listed blob SHA.
 */
export const WORDSHK_AUDIO_TREE_SHA = "c604e7eec402fab0a872ff70ae2554bc8c3201db";

export const WORDSHK_AUDIO_TREE_URL = `https://api.github.com/repos/AlienKevin/wordshk_app/git/trees/${WORDSHK_AUDIO_TREE_SHA}`;

export const WORDSHK_AUDIO_TREE_CACHE_NAME = `wordshk-audio-tree-${shortSha(WORDSHK_AUDIO_TREE_SHA)}.json`;

/** Raw URL of one clip (e.g. "aa1.mp3") at the pinned commit. */
export const wordshkAudioClipUrl = (file: string): string =>
  `https://raw.githubusercontent.com/AlienKevin/wordshk_app/${WORDSHK_AUDIO_COMMIT}/assets/jyutping_female/${file}`;

/** Cache subdirectory of the downloaded clips, one file per clip under its upstream name. */
export const WORDSHK_AUDIO_CACHE_DIR = `wordshk-audio-${shortSha(WORDSHK_AUDIO_TREE_SHA)}`;
