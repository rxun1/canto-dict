# Cantonese pronunciation audio for an offline dictionary app: sources, licenses, sizes

*Researched 2026-10-29. All coverage numbers were measured directly (HTTP HEAD/GET probes, GitHub tree listings, Hugging Face / Wikimedia APIs), not copied from marketing text. Small samples were inspected under `/tmp` only.*

---

## TL;DR

| Need | Recommendation | License status | App-size impact |
|---|---|---|---|
| **(a) Per-syllable audio** (main approach) | **words.hk female syllable set** (3,902 files; 99.5% token coverage of the words.hk lexicon). Fallback: **commission your own recordings** of about 2,600 syllables. Open fallback: Ekho `jyutping-wong` (GPL-2.0, male). | words.hk audio is **not openly licensed**. You need written permission from Hong Kong Lexicography Ltd. If you commission your own recordings, you own them outright. | About 5–7 MB (AAC/MP3 at 32 kbps, 22 kHz mono, trimmed to about 2,600 syllables) |
| **(b) Per-word audio** (bonus) | **Lingua Libre + Wikimedia Commons** Cantonese recordings: about 7,400 + 800 files, about 5,000 distinct multi-character words. Later, maybe Common Voice clips cut out with forced alignment (CC0). | CC BY-SA 4.0 (mostly) or CC BY-SA 3.0. Bundling is allowed in free and paid apps, with attribution and share-alike on the audio files. Common Voice is CC0. | About 25–30 MB for all LL/Commons files after transcoding. Best shipped as an optional download pack. |
| **(c) Sentence read-aloud, offline** | **Platform TTS** (iOS Sinji/Aasing, Android Google `yue-HK-x-*-local`) through `expo-speech` / `react-native-tts`. If no Cantonese voice is installed, **fall back to syllable concatenation**. | OS-provided, so nothing to license or bundle | 0 MB |
| **(d) Online / premium quality** | Azure `zh-HK-HiuMaan/WanLung/HiuGaai` Neural, Google `yue-HK-Chirp3-HD-*` (30 voices), Amazon Polly `Hiujin`. Cache the results, or pre-generate a per-word pack. | Commercial APIs. Polly says "your Polly output belongs to you" and allows cache/replay. | 0 MB (streamed), or about 4 KB per word if you pre-generate a pack |

**Do not bundle** the CUHK 粵語審音配詞字庫, EdUHK CKC, HK EDB 學習字詞表, CantoDict or Forvo audio. None of them grants a redistribution license; EDB and Forvo explicitly forbid commercial use.

---

## 1. Background: how many syllables do we need?

- Every distinct toned syllable in the **LSHK 電腦用漢字粵語拼音表** (`lshk-org/jyutping-table`, `list.tsv`, CC BY 4.0) gives **2,336 toned syllables**. Of these, 1,825 occur in at least 3 characters (many of the rest are rare readings). Computed from the `JP` column of https://github.com/lshk-org/jyutping-table/blob/master/list.tsv.
- The **words.hk public-domain word list** (`https://words.hk/faiman/analysis/wordslist.json`, "Data License: public domain") has **62,635 headwords** that use **2,519 distinct toned syllables**. This includes colloquial and changed-tone syllables such as `lau2`, `lei2`, `em1`, `fen1`.
- So "about 1,800" covers the core. A dictionary that faithfully shows colloquial and changed-tone readings needs **about 2,300–2,600** syllables.

Coverage below is given two ways. **Types** = how many of the 2,519 words.hk syllables have a recording. **Token-weighted** = the share of syllable occurrences across all 62,635 words.hk pronunciations that have a recording. The second number is what users actually experience.

---

## 2. Per-syllable recording sets (the core asset)

### 2.1 words.hk female syllable set (also mirrored by wordshk_app and jyutping.org) ⭐ best coverage

- **Where it lives (three copies of the same recordings):**
  - words.hk serves them for its own pages: `https://words.hk/static/jyutping/<syllable>.mp3`. The site's player concatenates syllables. From the words.hk entry page JS: `var url = "/static/jyutping/" + jp + ext;` and the comment `// TODO: Deal with audio-with-the-whole-phrase later.`
  - **AlienKevin/wordshk_app** (official words.hk mobile app, Flutter, MIT for code): `assets/jyutping_female/*.mp3`, **3,902 files, 9.78 MB**. https://github.com/AlienKevin/wordshk_app/tree/main/assets/jyutping_female. The README describes loudness normalisation to −16 LUFS and silence trimming via `process_audios.sh`. The last edit to the words.hk static files (`Last-Modified: Sun, 03 Jul 2022`) matches the wordshk_app commit `579afc0d` on 2022-07-03 ("Peak normalize jap6sing1 audios…").
  - **CanCLID/jyutping.org** (repo license MIT): `public/audio/*.mp3`, **3,924 files, 17.7 MB**. 3,884 of the syllable names overlap with wordshk_app; the files are processed differently. The site itself credits the source: `src/content/jyutping/yue/index.mdx:8` says "錄音數據來源係粵典" ("the recordings come from words.hk").
- **Contents:** one female speaker, isolated citation syllables. The 3,902 names include many theoretically possible syllables that never occur, which is harmless. Estimated F0 is about 320 Hz on `si1` and 160 Hz on `si4`, consistent with a female voice. Format: MP3, 22.05 kHz mono, about 32 kbps, about 0.6 s per syllable.
- **Measured coverage:**
  - LSHK list: 2,285 / 2,336 on words.hk static. The 51 misses are mostly `gwu*`/`kwu*` spellings (words.hk writes `gu1`) plus rare syllabic nasals like `hm1` and `ngm4`.
  - words.hk lexicon: **2,282 / 2,519 types (90.6%), 99.52% token-weighted**. The top misses are rare colloquial `e`-finals: `em1, en1, fen1, gat4, bet4, zeu1…`.
- **License: ⚠️ none published for the audio.**
  - The words.hk "open data" page (https://words.hk/base/hoifong/) covers only content explicitly marked as open data. That content is under the *Non-Commercial Open Data License 1.0*, copyright 香港辭書有限公司 (Hong Kong Lexicography Ltd): "除咗特別批准，你唔可以用本產品做商業用途" ("except with special permission, you may not use this product for commercial purposes").
  - The syllable audio is not marked or mentioned anywhere. The wordshk_app README "Legal" section only says "Dictionary: Copyright (C) 2014-2022 Hong Kong Lexicography Limited".
  - jyutping.org's MIT license is CanCLID's and cannot relicense words.hk's recordings.
  - **Treat it as all-rights-reserved until words.hk grants permission.** They are approachable: the official app and jyutping.org already use the audio. Contact: the email on https://words.hk/base/about/.
- **Maintenance:** stable since 2022. jyutping.org is active (pushed 2026-10-29).

### 2.2 HK Education Bureau 香港小學學習字詞表 (EDB)

- **URL:** https://www.edbchinese.hk/lexlist_ch/. Audio: `https://www.edbchinese.hk/EmbziciwebRes/jyutping/<syllable>.mp3`. The page JS (`doSoundyp`) also plays words by **concatenating syllables**.
- **Contents:** female voice (F0 about 276 Hz on `si1`, 180 Hz on `si4`). MP3 at 44.1 kHz, 96 kbps (about 8 KB/syllable). **2,487 syllables found.** Coverage: 2,205 / 2,519 types (87.5%), **99.26% token-weighted**. A full set is about 18 MB as served.
- **License: ❌ not bundleable.** The EDB Important Notices (https://www.edb.gov.hk/en/important-notices/index.html) allow downloads only "solely for personal or non-commercial internal use". Any other reproduction or distribution "is strictly prohibited" without prior written authorisation from EDB.

### 2.3 CUHK 粵語審音配詞字庫 (lexi-can)

- **URL:** https://humanum.arts.cuhk.edu.hk/Lexis/lexi-can/. Audio: `…/lexi-can/sound/<syllable>.wav`. This is what `sammyfung/playyue` and several scrapers hotlink.
- **Contents:** recorded by 陳京英老師 (former tutor at CUHK's Yale-China Chinese Language Centre), per `main.php`: "本校雅禮中國語文研習所前導師陳京英老師義務參與本網頁之錄音工作". **8-bit unsigned PCM, 11.025 kHz** (low fidelity, audible hiss), about 1.5 s per file including silence. **1,867 syllables found.** Coverage: 1,737 / 2,519 types (69%), 96.8% token-weighted.
  - Many misses are spelling-system differences. CUHK follows the "正讀" style: `ngok6` not `ok6`, `gu1` not `gwu1`.
  - Many are also colloquial or changed-tone syllables (`lau2, lei2, lung2, laa4, deoi2…`).
- **License: ❌ none.** QEF-funded project (`team.php`: "網頁製作所涉的所有資源，概由香港優質教育基金 (QEF) 提供"). No license is given, so assume all rights reserved.
- **Maintenance:** legacy site (frames, Big5), still online.

### 2.4 EdUHK 中台港常用字粵普聲韻調交互對照表 (CKC)

- **URL:** https://ckc.eduhk.hk/ckc/can/. A copy of its syllable WAVs is in `handong66/Cantonese-Mandarin-Cross-Ref/sound/yue/` (**1,260 WAVs, 52.5 MB**, 16 kHz).
- **Speaker:** female, 陳淑貞博士 (`credit.htm`).
- **Coverage:** 1,258 / 2,519 types (50%), 90.3% token-weighted. Common syllables only.
- **License: ❌ none stated.** Assume all rights reserved. The GitHub copy's MIT license does not cover EdUHK's audio.

### 2.5 Ekho TTS Cantonese voice "jyutping-wong" (Cameron Wong) ✅ open, with GPL strings attached

- **URL:** https://github.com/hgneng/ekho (1.2k★, active, pushed 2026-10-29).
  - Raw recordings: https://sourceforge.net/projects/e-guidedog/files/Ekho-Voice-Data/0.2/. `jyutping-wong-44100-v9.tar.bz2` is 103 MB; `jyutping-wong-16000-v6.tar.bz2` is 19.6 MB.
  - The repo also ships a packed `ekho-data/jyutping.voice` (5.6 MB).
- **Contents:** one male speaker recording isolated Jyutping syllables. Ekho is a *concatenative* syllable TTS. Its Cantonese lexicon `zhy_list` uses 2,205 distinct toned syllables. I did not verify the exact recorded count; the download was blocked in this environment.
- **License:** `ekho-data/jyutping/COPYING-cantonese-wong`: "Copyright (C) 2008-2022 by Cameron Wong … GNU GENERAL PUBLIC LICENSE Version 2". The dictionary `zhy_list` is CC BY-SA 3.0.
- **Bundling:**
  - GPL-2.0 applies to the audio data. You must ship it under GPL, provide the "source" (the WAVs) and pass the license on.
  - Shipping it as separate data files next to proprietary code is arguably "mere aggregation". However, **distributing GPL works through the Apple App Store is legally contentious**, because App Store terms add restrictions (the 2011 VLC removal is the well-known case).
  - Fine for Android/F-Droid or an open-source app. Risky for a closed-source iOS app.
- **Quality:** older recordings (2008–2011). Usable, but less polished than words.hk.

### 2.6 Not suitable / dead ends checked

- **jyutping.org / LSHK sound charts:** LSHK's own pages (https://lshk.org/jyutping-scheme/) have no audio. jyutping.org's audio is the words.hk set (§2.1).
- **Shtooka/SWAC:** no Cantonese pack.
- **Jyut Dictionary** (`aaronhktan/jyut-dict`, MIT): plays OS TTS (`QTextToSpeech`). It can also download a ZIP of per-syllable clips it **pre-generated with Google/Azure TTS** (`src/dictionaries/tts/azure.py` uses `zh-HK-WanLungNeural` with `<phoneme alphabet='sapi' …>`). Those clips are synthetic, not human. The technique is useful though (§6.3).
- **Pleco Cantonese audio:** a commercial add-on, not licensable.

---

## 3. Per-word human recordings

### 3.1 Lingua Libre (Wikimedia Commons, `Category:Lingua Libre pronunciation-other (Q9186)`) ✅

- **URL:** https://commons.wikimedia.org/wiki/Category:Lingua_Libre_pronunciation-other_(Q9186). File pattern: `LL-Q9186 (yue)-<Speaker>-<word>.wav`.
- **Contents (enumerated via API):** **7,410 files.**
  - By length: 1,488 single-character, 5,094 two-character, 347 three-character, 195 four-character, 276 longer phrases.
  - 1,082 distinct single characters. Many are polyphonic, so syllable coverage is only an estimated 500–800 of about 2,500.
- **Speakers:** Luilui6666 (5,393), Justinrleung (947), Jonashtand (617), Wandering Maiden (378), plus a few others. Mixed genders and mics; quality is generally good home-studio level.
- **Format/size:** WAV (about 75 KB each, about 550 MB raw). About 4 KB each at 32 kbps AAC, so **about 30 MB** for everything.
- **License:** **CC BY-SA 4.0** (checked via `extmetadata.LicenseShortName` on samples, e.g. `File:LL-Q9186 (yue)-Luilui6666-一.wav` → "CC BY-SA 4.0"; Artist "Speaker: Luilui6666"). Legal code: https://creativecommons.org/licenses/by-sa/4.0/.
  - **Bundling in a free or paid app is allowed** if you credit each speaker, link the license, and license any *adapted* audio under BY-SA.
  - Plain transcoding or trimming arguably counts as a "technical modification" under CC 4.0 §2(a)(4), so it is not an adaptation. The app's code is not affected.
  - Caveat: CC 4.0 §2(a)(5)(C) forbids imposing "Effective Technological Measures" on the material. Keep the audio as plain files, not DRM-wrapped. This is generally accepted for App Store distribution of CC-BY-SA assets, but document the attribution in-app.
- **Maintenance:** ongoing community recording.

### 3.2 Wikimedia Commons `Category:Cantonese pronunciation` / Wiktionary

- **URL:** https://commons.wikimedia.org/wiki/Category:Cantonese_pronunciation. **820 files**, mostly `Yue-<romanisation>.ogg` by **Jyugulik** (CC BY-SA 4.0, 687 files: 105 single-syllable, 456 two-syllable) and `Zh-yue-*.opus` by **Justinrleung** (CC BY-SA 3.0, 114 files).
- **Licenses:** mostly CC BY-SA 3.0/4.0, a few CC0 / CC BY 2.5 / CC BY-SA 1.0. Check per file.
- English Wiktionary has **2,913 entries** in "Category:Cantonese terms with audio pronunciation". They draw on the files above plus Lingua Libre.

### 3.3 Forvo ❌

- Pronunciations stay owned by their users. The public license lets users use them "in any way as long as they are not used for commercial purposes" (archived https://forvo.com/license/).
- API plans (https://api.forvo.com/plans-and-pricing/): Non-Profit plan "Commercial Use: Not Allowed"; commercial plans cost $28.95+/month and are **request-based (online), not a bulk offline license**.
- **Not bundleable** without a separate negotiated deal.

### 3.4 CantoDict ❌

- https://www.cantonese.sheik.co.uk has only a small number of example-sentence MP3s (`/audio/exampleNN.mp3`). "Copyright Adam Sheik 2003-2026". Not bundleable.

---

## 4. Sentence-level speech corpora (could be mined for words)

| Corpus | Size | License | Bundle? | Notes |
|---|---|---|---|---|
| **Mozilla Common Voice `yue`** (v27.0, 2026-09-11) | 279,396 clips, 210.8 validated h / 307 h total, 1,188 speakers, 6.4 GB; 62% female-tagged | **CC0** | ✅ (public domain) | Stats from `common-voice/cv-dataset` `datasets/scripted-speech/cv-corpus-27.0-2026-09-11.json`. Download now via **Mozilla Data Collective** (https://mozilladatacollective.com/). Its download terms ask you not to try to identify speakers. |
| **Common Voice `zh-HK`** (v27.0) | 124,379 clips, 108.6 validated h, 3,114 speakers, 3.7 GB | **CC0** | ✅ | same |
| **MDCC** (HKUST) | about 73 h | Signed license, "**research purposes only**" (https://github.com/HLTCHKUST/cantonese-asr README) | ❌ | |
| **CantoMap** | 12 h 48 min map-task dialogues | Recordings "available to academic researchers upon request" (https://github.com/gwinterstein/CantoMap) | ❌ | |
| **HKCanCor** | transcripts CC BY; audio | "only samples of the sound are available for download, the complete files were not released" (https://github.com/fcbond/hkcancor) | ❌ | |
| **CanCLID/zoengjyutgaai** 張悅楷講古 | storytelling, HF dataset | Labelled **CC0** on HF | ⚠️ | 1950s–90s Guangzhou storyteller. Wrong register for a dictionary, and the provenance of the CC0 claim (broadcast rights) is uncertain. |
| `AlienKevin/wordshk_cantonese_speech` (HF) | 114,988 clips, 2.3 GB | Labelled CC BY 4.0 | ⚠️ | **Synthetic.** Its sibling tooling `wordshk-tools/tts/tts.py` generates audio with **Amazon Polly**. Not human recordings. |
| `alvanlii/cantonese-youtube`, `cantonese-radio` (HF) | scraped media | no license | ❌ | |

### 4.1 Cutting word clips out of Common Voice with forced alignment: effort estimate

- **Tools:** Montreal Forced Aligner, plus the **MIT-licensed HK Cantonese acoustic models and lexicons** at https://github.com/chenchenzi/HKCantonese_models. These are trained on CV zh-HK + yue v19 (308.7 h, 3,400 speakers) and come with Jyutping lexicons.
- **Pipeline:**
  1. Convert CV sentences to Jyutping (ToJyutping/pycantonese).
  2. Run MFA align to get word/syllable TextGrids.
  3. Cut out dictionary words.
  4. Score each candidate (alignment log-likelihood, SNR, CV up/down votes, speaker consistency) and keep the best token per word, ideally from a few "house" speakers.
- **Effort:** about 1–2 weeks engineering plus significant manual QA listening. A realistic yield is a few thousand clean common words, but many dictionary words never appear in CV sentences.
- **Quality caveats:**
  - Words cut from running speech carry coarticulation and sentence prosody, and are often clipped at the edges.
  - Mic quality varies wildly between speakers.
  - The upside: natural changed tones (變調) are preserved.
- **Verdict:** a phase-2 project. Not a substitute for a clean syllable set.

---

## 5. Offline TTS for sentences

### 5.1 Built-in platform voices (recommended for sentences)

- **iOS/macOS (AVSpeechSynthesizer):**
  - Cantonese (Hong Kong) is listed under "VoiceOver, Live Speech, Read & Speak" at https://www.apple.com/ios/feature-availability/.
  - Voices: **Sinji** (female; compact/enhanced/premium tiers) and **Aasing** (male). Source: `readium/speech` `json/yue.json`, https://github.com/readium/speech/blob/main/json/yue.json.
  - Verified on this Mac: `AVSpeechSynthesisVoice.speechVoices()` returns `yue-HK Sinji com.apple.voice.super-compact.zh-HK.Sinji`. **Recent OS versions report the language as `yue-HK`; older ones use `zh-HK`. Match both.**
  - Enhanced/premium voices are user-downloaded (Settings › Accessibility › Spoken Content) and then work offline.
- **Android (Google Speech Services):** five Cantonese voices, each with an offline `-local` variant: `yue-hk-x-jar-local`, `yue-hk-x-yuc-local` (female), `yue-hk-x-yud-local`, `yue-hk-x-yue-local`, `yue-hk-x-yuf-local` (male) (readium `yue.json`).
  - Availability depends on the device. Phones without Google services (e.g. Huawei, many China-market ROMs) may have no Cantonese engine at all.
- **React Native APIs:**
  - **`expo-speech`** (https://docs.expo.dev/versions/latest/sdk/speech/): `Speech.speak(text, { language: 'zh-HK' | 'yue-HK', voice })`, `getAvailableVoicesAsync()` → `{identifier, language, name, quality: Default|Enhanced}`. The docs do not say how it behaves offline.
  - **`react-native-tts`** (https://github.com/ak1394/react-native-tts, last push 2024-06): `Tts.voices()` exposes `networkConnectionRequired` and `notInstalled` (Android only) and `quality` (300/500). `Tts.requestInstallData()` opens the voice download. That makes it easier to **guarantee offline**: filter out voices that need the network.
- **Pros:** 0 MB, natural sentence prosody.
- **Cons:**
  - Cannot be pinned to a Jyutping reading: polyphonic characters (行 hang4/hong4, 樂 lok6/ngok6) and colloquial characters may be misread.
  - Changed tones are hit-or-miss.
  - The voice varies by device.
  - iOS 16+ has `AVSpeechSynthesisIPANotationAttribute` for IPA-forced pronunciation, but I did not test it with Cantonese, and expo-speech doesn't expose it.

### 5.2 Open-source on-device neural TTS (not recommended to bundle yet)

| Model | Size | License | Notes |
|---|---|---|---|
| **sherpa-onnx `vits-cantonese-hf-xiaomaiiwn`** (https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models; `csukuangfj/vits-cantonese-hf-xiaomaiiwn`) | 102 MB tar.bz2 / **108.7 MB ONNX** | **No license** on upstream `xiaomaiiwn/vits-cantonese` (HF card missing) | Runs on-device via sherpa-onnx (iOS/Android/RN bindings exist). Legally unusable without the author's permission. |
| **hon9kon9ize/bert-vits-zoengjyutgaai-onnx** | **213 MB** ONNX (plus a BERT front-end) | No license on the model repo; data labelled CC0 | Storyteller voice (old Guangzhou style). Too big, unclear terms. |
| **hon9kon9ize/bert-vits2-cantonese** | about 700 MB `.pth` checkpoints | MIT | Needs export and pruning; still far too large for mobile. |
| **jmtl/hk-cantonese-cc0-qwen3-tts** (LoRA on Qwen3-TTS 1.7B; GGUF build) | **about 2.2 GB** GGUF | Apache-2.0 (base-model data undisclosed) | Good quality, desktop-class only. |
| **Ekho** (concatenative, §2.5) | about 6–20 MB voice | GPL-2.0 | Robotic, but it is the only truly open *and* small option. Android APK `ekho-cantonese-9.0.apk` (22 MB). |
| Piper / MeloTTS / Kokoro | none | — | No Cantonese voices (Piper `voices.json` has only `zh_CN-*`). |

---

## 6. Approach trade-offs for words and sentences

### 6.1 Syllable concatenation

- **Pros:**
  - Real human voice, tiny (about 5–7 MB), works 100% offline on every device.
  - Exactly matches the dictionary's Jyutping, including the reading chosen for a polyphonic character.
  - If the dictionary marks **changed tones** explicitly (words.hk writes e.g. `ngan4 zi2`, 仔女 `zai2 neoi2`), you just play the changed-tone syllable.
- **Cons:**
  - Each syllable is a citation-form, full-length recording. There is no coarticulation, no phrase-final lengthening and no sentence intonation, so the result sounds choppy.
  - Entering tones (-p/-t/-k) and short particles (咗, 嘅) sound unnaturally isolated.
  - Fine for **words of 2–4 syllables**, poor for sentences.
- **Mitigations:**
  - Trim leading/trailing silence (wordshk_app already does).
  - Overlap syllables by about 30–60 ms with a short crossfade.
  - Speed up non-final syllables slightly (about 0.85× duration).
  - Normalise loudness (−16 LUFS).
  - Changed-tone syllables (e.g. `*2`, high-level `*1`) must exist in the set, which is why ≥2,300 syllables matter.

### 6.2 Platform TTS

- Natural prosody and free. However, coverage depends on the device, you can't control the reading, and the voice is inconsistent across devices. Best for example sentences, with a "TTS" label.

### 6.3 Cloud TTS, pre-generated

- You can ask the cloud engine for exact phonemes:
  - Polly SSML `<phoneme alphabet="x-amazon-jyutping" ph="…">`, used in `wordshk-tools/tts/tts.py`.
  - Azure `<phoneme alphabet='sapi'>`, used in `jyut-dict/src/dictionaries/tts/azure.py`.
- That gives correct readings with natural prosody. Generate every headword once and ship it as an optional pack, or stream and cache.
- Synthetic, but the most natural-sounding *controllable* option.

---

## 7. Comparison table

| Source | Level | Items | Coverage of 2,519 words.hk syllables (types / token-weighted) | Speaker | Format (as served) | Total size | License | Bundle free app? | Bundle paid app? | Maintained |
|---|---|---|---|---|---|---|---|---|---|---|
| **words.hk female set** (words.hk / wordshk_app / jyutping.org) | syllable | 3,902 | **90.6% / 99.52%** | 1 F | MP3 22 kHz ~32 kbps | 9.8 MB | None published (© HK Lexicography Ltd presumed) | ⚠️ ask | ⚠️ ask | stable (2022) |
| EDB 學習字詞表 | syllable | 2,487 | 87.5% / 99.26% | 1 F | MP3 44.1 kHz 96 kbps | ~19 MB | © HKSAR EDB, personal/non-commercial only | ❌ | ❌ | active site |
| CUHK lexi-can | syllable | 1,867 | 69.0% / 96.79% | 1 (陳京英) | WAV 8-bit 11 kHz | ~30 MB | none (QEF-funded) | ❌ | ❌ | legacy |
| EdUHK CKC | syllable | 1,260 | 49.9% / 90.28% | 1 F (陳淑貞) | WAV 16 kHz | 52 MB | none | ❌ | ❌ | legacy |
| Ekho jyutping-wong | syllable | ~2,200 (unverified) | not measured | 1 M (Cameron Wong) | WAV 16k/44.1k; packed .voice | 19.6 / 103 MB raw; 5.6 MB packed | **GPL-2.0** | ✅ (GPL duties) | ⚠️ GPL + App Store conflict | active repo |
| Lingua Libre yue | char/word | 7,410 (5,094 two-char) | ~500–800 syllables (est.) | ~10 speakers | WAV | ~550 MB raw → ~30 MB AAC | **CC BY-SA 4.0** | ✅ attribution | ✅ attribution | ongoing |
| Commons Cantonese pronunciation | syllable/word | 820 | small | Jyugulik, Justinrleung… | OGG/Opus | small | CC BY-SA 3.0/4.0 (per file) | ✅ | ✅ | ongoing |
| Forvo | word | many | — | many | MP3 via API | — | User-owned, non-commercial; paid API | ❌ | ❌ (no offline license) | active |
| Common Voice yue + zh-HK | sentence | 403k clips / 319 validated h | via alignment | 4,300 volunteers | MP3 | ~10 GB | **CC0** | ✅ | ✅ | active |
| MDCC / CantoMap / HKCanCor | sentence | 73 h / 13 h / samples | — | many | WAV | — | research-only / on request / unreleased | ❌ | ❌ | — |
| iOS Sinji/Aasing; Android yue-HK local | TTS | — | full | F/M | OS | 0 | OS-provided | ✅ | ✅ | OS |
| sherpa-onnx vits-cantonese | TTS | — | full | 1 | ONNX | 109 MB | **none** | ❌ | ❌ | 2023 |
| bert-vits zoengjyutgaai ONNX | TTS | — | full | 1 M | ONNX | 213 MB | unclear | ⚠️ | ⚠️ | 2024 |
| Qwen3-TTS HK LoRA | TTS | — | full | 1 F | GGUF | 2.2 GB | Apache-2.0 | size-prohibitive | size-prohibitive | active |
| Azure / Google Chirp3-HD / Polly Hiujin | cloud TTS | — | full | many | API | 0 (stream) | commercial ToS | online | online | active |

---

## 8. Recommendation

### (a) Per-syllable audio (primary)

1. **First choice: ask words.hk (Hong Kong Lexicography Ltd) for a written license to the female syllable set.**
   - Best measured coverage: 99.5% of syllable tokens in their 62k-word lexicon.
   - Already loudness-normalised and trimmed for mobile by the official app, and consistent with the words.hk data you are likely to use for definitions anyway.
   - Their open-data license is non-commercial by default, so a **paid app needs explicit commercial permission**. A free app still needs permission because the audio isn't marked open.
   - Credit as jyutping.org does ("錄音數據來源係粵典").
2. **If permission is refused or slow: commission your own syllable recordings** (one native HK speaker, ideally female/male pair).
   - Build the list from the words.hk lexicon (2,519 syllables) ∪ LSHK (2,336), about 2,600 items.
   - At roughly 6–10 s per take including retakes, that's about 4–7 hours of studio time plus editing.
   - Use a work-for-hire/assignment contract so you own the copyright and could even release it CC BY. Budget: low thousands of USD.
   - Record citation form **and** the common changed-tone variants.
3. **Open interim fallback:** Ekho `jyutping-wong` (GPL-2.0) if the app is Android-only or open source. Avoid it in a closed-source iOS build.
4. **Do not ship** CUHK, EdUHK or EDB recordings. EDB is explicitly non-commercial/personal; the others have no license.

**Size:** about 2,600 syllables × about 2.4 KB (measured: ADTS AAC 32 kbps, 22 kHz mono averaged 2,395 B per words.hk syllable; MP3 32 kbps averaged 2,526 B) ≈ **6 MB**.
- Avoid per-file MP4/M4A containers: the M4A header overhead made each clip about **6.4 KB** in testing, almost 3× the size.
- Pack all syllables into one audio "sprite" plus an offset index, or use raw ADTS/MP3. This also avoids thousands of tiny files in the app bundle.

### (b) Per-word audio

- **Bundle or offer as a download pack: Lingua Libre (7,410) + Commons (820) CC BY-SA recordings.** That's about 5,000 multi-character words (common vocabulary is over-represented), about 25–30 MB as AAC.
  - Show the speaker and license on the entry, plus an attributions screen.
  - Keep the audio files un-DRM'd and separately licensed (CC BY-SA). App code stays proprietary.
- Phase 2: mine **Common Voice (CC0)** with MFA + `chenchenzi/HKCantonese_models` for more words.
- Optionally, pre-generate the rest with cloud TTS using explicit Jyutping phonemes, labelled "synthetic".

### (c) Sentence read-aloud offline

- **Primary: platform TTS** (iOS Sinji/Aasing; Android `yue-HK-x-*-local`).
  - Use `react-native-tts` if you need `networkConnectionRequired`/`notInstalled` filtering to guarantee offline; `expo-speech` works if you're on Expo.
  - Detect both `zh-HK` and `yue-HK` voice codes.
  - Prompt the user to download the enhanced voice.
- **Fallback: syllable concatenation** with crossfades, from the dictionary's own Jyutping, which already carries changed tones. Always available and always reads the correct syllables, but robotic for long sentences.
- **Trade-off summary:**
  - TTS: better prosody and intonation, but may misread polyphonic and colloquial characters and changed tones, and isn't guaranteed to be installed.
  - Concatenation: always correct per syllable (including written changed tones), but no coarticulation or intonation.
  - Don't bundle a neural model now: the small ones (109–213 MB) have no clear license, and the licensed one is 2.2 GB.

### (d) Online-quality option

- Azure `zh-HK-HiuMaanNeural` / `WanLungNeural` / `HiuGaaiNeural`, Google `yue-HK-Chirp3-HD-*` (30 voices; `yue-HK-Standard-A..D` cheaper), Amazon Polly **Hiujin** (neural; Polly FAQ: "You can cache and replay Amazon Polly's generated speech at no additional cost"; "your Polly output belongs to you").
- Use SSML phonemes so the audio follows the dictionary's Jyutping. Cache on device.
- Can also be used offline-first by **pre-rendering a per-word pack**: about 60k headwords × about 4 KB ≈ 240 MB, so make it an optional download. A top-10k pack is about 40 MB.

### App-size budget (suggested)

| Component | Size |
|---|---|
| Syllable sprite (~2,600 syllables, AAC 32 kbps) | ~6 MB, bundled |
| LL/Commons human word pack | ~25–30 MB, optional download |
| Platform TTS | 0 MB |
| Cloud-TTS pre-rendered word pack (optional) | ~40 MB (top 10k) to ~240 MB (all) |

---

## 9. License caveats checklist

- **words.hk audio:** no public license, so get written permission (commercial permission if the app is paid). The jyutping.org repo's MIT license does **not** cover these recordings.
- **CC BY-SA (Lingua Libre/Commons):**
  - Credit the speaker or uploader, the license and the source URL for each file.
  - Edited audio (adaptations) must stay BY-SA. Transcoding/trimming is arguably only a technical modification.
  - Don't wrap the files in DRM.
  - Some older files are BY-SA 3.0 or 1.0, so check per file via the Commons API (`prop=imageinfo&iiprop=extmetadata`).
- **GPL-2.0 (Ekho):** ship the license and the WAV "source". The conflict with App Store terms is unresolved; prefer Android/open-source distribution.
- **Common Voice:** CC0, but respect the dataset terms (no attempts to identify speakers) and consider speaker privacy when extracting clips.
- **EDB / CUHK / EdUHK / Forvo / CantoDict / MDCC / CantoMap:** not redistributable in an app without explicit permission.
- **Neural TTS models:** check both the model license and the training-data license. `xiaomaiiwn` has neither.
- **Cloud TTS:** read each provider's terms on storing and redistributing output (Polly explicitly allows caching and replay).

---

## 10. Method notes / reproducibility

- **Coverage probes:** `curl -I` for each of the 2,336 LSHK syllables against words.hk, EDB and CUHK, plus GET for the 509 extra words.hk syllables against EDB and CUHK. EDB and words.hk return 404 for nonsense syllables (`zzz9`), so 200s are genuine.
- **GitHub tree listings:** `gh api repos/<repo>/git/trees/HEAD?recursive=1` for `AlienKevin/wordshk_app`, `CanCLID/jyutping.org`, `handong66/Cantonese-Mandarin-Cross-Ref`, `hgneng/ekho`.
- **Commons:** `list=categorymembers` and `prop=imageinfo&iiprop=extmetadata` (rate-limited; enumerated in two directions to get all 7,410).
- **Speaker F0:** a crude autocorrelation estimate on `si1`/`si4` samples, used only for gender plausibility. The CUHK result was inconclusive because of 8-bit noise.
- **Size measurements:** `afconvert` on 30 random words.hk syllables. ADTS-AAC 32 kbps averaged 2,395 B; M4A averaged 6,385 B (container overhead).
