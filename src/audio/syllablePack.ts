// Syllable clips (spec §4.4): syllables.pack ships as an asset, and syllables.json maps each jyutping to
// its [offset, length] in it. A clip is sliced out into the cache the first time it is asked for; later
// calls find the file there and do no slicing work.
import { Asset } from "expo-asset";
import { Directory, File, FileMode, Paths } from "expo-file-system";
import type { SyllableIndex } from "./syllableIndex";

// require, not import: TypeScript would infer a type with ~3,900 keys and number[] (not pair) values.
const INDEX: SyllableIndex = require("../../assets/syllables.json");
const PACK_MODULE = require("../../assets/syllables.pack");
const CACHE_DIR_NAME = "syllables";
/** Each slice is a complete MP3 file (audioPack.ts). */
const CLIP_EXTENSION = "mp3";

let packFile: Promise<File> | null = null;

/** The pack on disk (bundled in a release build; downloaded from Metro once in development). */
function openPack(): Promise<File> {
  packFile ??= Asset.fromModule(PACK_MODULE)
    .downloadAsync()
    .then((asset) => new File(asset.localUri!))
    .catch((e) => {
      packFile = null; // let a later call try again
      throw e;
    });
  return packFile;
}

/**
 * URI of the cached clip for a syllable, or null when the pack has none (the particles la1/a1/ga3/ma3,
 * for one). The file name carries the clip's offset and length, so a rebuilt pack's clips never reuse a
 * stale cached file.
 */
export async function clipPath(syllable: string): Promise<string | null> {
  if (!Object.hasOwn(INDEX, syllable)) return null;
  const [offset, length] = INDEX[syllable];
  const pack = await openPack();

  // Synchronous from here on, so two calls for one syllable can't interleave a half-written file.
  const dir = new Directory(Paths.cache, CACHE_DIR_NAME);
  const clip = new File(dir, `${syllable}-${offset}-${length}.${CLIP_EXTENSION}`);
  if (clip.exists) return clip.uri;

  const handle = pack.open(FileMode.ReadOnly);
  let bytes: Uint8Array;
  try {
    handle.offset = offset;
    bytes = handle.readBytesSync(length);
  } finally {
    handle.close();
  }
  dir.create({ intermediates: true, idempotent: true });
  clip.writeSync(bytes);
  return clip.uri;
}
