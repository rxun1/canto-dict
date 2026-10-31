// File types bundled as assets beyond Expo's defaults, shared by metro.config.js and jest.config.js.
// canto.db: SQLiteProvider copies it into the app's documents on first launch.
// syllables.pack: syllable clips, sliced out by src/audio/syllablePack.ts.
module.exports = { EXTRA_ASSET_EXTS: ["db", "pack"] };
