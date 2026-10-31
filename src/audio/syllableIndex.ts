// Dependency-free format of syllables.json, shared by the app's player and the data-pipeline packer.

/** jyutping → [byte offset, byte length] of its clip in syllables.pack. */
export type SyllableIndex = Record<string, [offset: number, length: number]>;
