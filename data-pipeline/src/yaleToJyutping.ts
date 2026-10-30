/**
 * Converts one Kaifangcidian "Yale with numeric tones" syllable (e.g. "cheut7") to Jyutping
 * ("ceot1"). The mappings were derived from the 2021-07-14 cidian_zhyue ylshu file, whose 1,996
 * distinct syllables all fit `initial + final + tone digit 1-9`.
 *
 * Pure and table-driven; it only checks that the pieces are known. Whether the result is a real
 * Jyutping syllable is the caller's job (isValidSyllable), e.g. "ak7" converts but "aa7" does not.
 * Yale "eu" always maps to Jyutping oe, so a reading of Jyutping's colloquial eu final (e.g. deu6)
 * comes out as oe; rime readings outrank Kaifangcidian's in merge.
 */

/** Yale initial -> Jyutping initial. Everything not listed here is spelled the same in both. */
const INITIALS: Readonly<Record<string, string>> = {
  b: "b", p: "p", m: "m", f: "f",
  d: "d", t: "t", n: "n", l: "l",
  g: "g", k: "k", ng: "ng", h: "h",
  gw: "gw", kw: "kw", w: "w", s: "s",
  j: "z", ch: "c", y: "j",
  "": "",
};

/**
 * Yale final -> Jyutping final. Yale writes the long vowel "a" once ("sa" for Jyutping saa) and the
 * short one before a coda, and spells Jyutping oe/eo as eu; the empty final is a syllabic nasal (m, ng).
 */
const FINALS: Readonly<Record<string, string>> = {
  "": "",
  a: "aa", aai: "aai", ai: "ai", aau: "aau", au: "au",
  aam: "aam", am: "am", aan: "aan", an: "an", aang: "aang", ang: "ang",
  aap: "aap", ap: "ap", aat: "aat", at: "at", aak: "aak", ak: "ak",
  e: "e", ei: "ei", em: "em", en: "en", eng: "eng", et: "et", ek: "ek",
  eu: "oe", eung: "oeng", euk: "oek", eui: "eoi", eun: "eon", eut: "eot",
  i: "i", ip: "ip", im: "im", in: "in", ing: "ing", it: "it", ik: "ik", iu: "iu",
  o: "o", oi: "oi", on: "on", ong: "ong", ot: "ot", ok: "ok", ou: "ou",
  u: "u", ui: "ui", un: "un", ung: "ung", ut: "ut", uk: "uk",
  yu: "yu", yun: "yun", yut: "yut",
};

/**
 * Yale spells Jyutping's jyu / jyun / jyut with the initial y plus u / un / ut (yu5, yun4), so after
 * the initial y these finals are the yu-finals. After any other initial the yu-finals are spelled
 * out (syu, chyun), which FINALS already covers.
 */
const FINALS_AFTER_Y: Readonly<Record<string, string>> = { u: "yu", un: "yun", ut: "yut" };

/** Yale tone digit -> Jyutping tone digit. 7, 8 and 9 are the checked (entering) tones. */
const TONES: Readonly<Record<string, string>> = {
  "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6",
  "7": "1", "8": "3", "9": "6",
};

const YALE_SYLLABLE = /^([a-z]*?)([1-9])$/;

/** Initials longest first, so "ng" is tried before "n" and "ch" is never split. */
const INITIALS_LONGEST_FIRST = Object.keys(INITIALS).sort((a, b) => b.length - a.length);

/** Converts one Yale syllable to Jyutping, or returns undefined when any part is unknown. */
export function yaleToJyutping(syllable: string): string | undefined {
  const match = YALE_SYLLABLE.exec(syllable);
  if (match === null) return undefined;
  const [, body = "", toneDigit = ""] = match;
  if (body === "") return undefined;
  const tone = TONES[toneDigit];
  if (tone === undefined) return undefined;

  for (const initial of INITIALS_LONGEST_FIRST) {
    if (!body.startsWith(initial)) continue;
    const yaleFinal = body.slice(initial.length);
    const jyutpingFinal = (initial === "y" ? FINALS_AFTER_Y[yaleFinal] : undefined) ?? FINALS[yaleFinal];
    if (jyutpingFinal !== undefined) return `${INITIALS[initial]}${jyutpingFinal}${tone}`;
  }
  return undefined;
}
