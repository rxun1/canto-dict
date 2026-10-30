// Dependency-free Jyutping patterns, shared by syllables.ts and the data-pipeline generator.

/** Valid tone digits. */
export const TONE_CLASS = "[1-6]";

/** A lowercase toneless base followed by one tone digit; groups: 1 = base, 2 = tone. */
export const TONED_SYLLABLE = new RegExp(`^([a-z]+)(${TONE_CLASS})$`);

/** A single tone digit. */
export const TONE_DIGIT = new RegExp(`^${TONE_CLASS}$`);

/** Every tone digit, for stripping. */
export const TONE_DIGITS_GLOBAL = new RegExp(TONE_CLASS, "g");

/**
 * Sentence-final particles that some sources write outside the standard table
 * (e.g. la1, ga3). Keep this list small and explicit; it widens what counts as Jyutping.
 * Most are also attested in rime char.csv; listing them here keeps them valid even if a
 * future data refresh drops them (the generator fails if one goes missing).
 */
export const PARTICLES: readonly string[] = ["a", "aa", "ga", "gaa", "la", "laa", "ma", "maa", "me", "ne", "o", "wo", "ze", "zaa"];
