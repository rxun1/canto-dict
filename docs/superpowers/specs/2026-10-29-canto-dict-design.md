# canto-dict — Design Spec

Date: 2026-10-29
Status: Approved in brainstorming; awaiting written-spec review

## 1. Goal

A personal iPhone app (React Native / Expo) that:

1. Looks up Cantonese characters (字) and words (詞) **offline**, showing Jyutping (e.g. `sik6`), a Mandarin meaning, English, example sentences, and real-person pronunciation audio.
2. Translates a Mandarin sentence into Cantonese with Jyutping and reads it aloud. Works offline with a rule-based converter; when online, upgrades the result using a free LLM API (Gemini by default).

## 2. Decisions and constraints

| Topic | Decision |
|---|---|
| Audience | Personal / sideload only. Non-commercial data (words.hk) is allowed. Nothing is published to an app store. |
| Platform | iPhone only |
| Stack | Expo (latest SDK, confirmed when the plan is written), dev build via `npx expo run:ios --device`, Expo Router, TypeScript |
| Script | Input accepted in simplified or traditional. Display in **simplified**. Characters with no simplified form (嘅, 冇, 喺) display unchanged. |
| App size | < 200 MB. No on-device neural translation model. |
| v1 extras | Search history, favorites, search by Jyutping / English, example sentences |
| Online translation | OpenAI-compatible client. Default preset: Gemini API free tier. Presets for Z.ai GLM-4.7-Flash and Custom. Key stored in the iOS Keychain. |
| Sentence read-aloud | Default: iOS Cantonese voice. Toggle: real-person syllable playback. |
| Jyutping source | Always computed locally (dictionary first, `to-jyutping` fallback), never taken from an LLM |

Research behind these decisions lives in `docs/research/`:
`lexical-datasets.md`, `audio-datasets.md`, `translation.md`, `free-llm-apis.md`.

## 3. Repository layout

```
canto-dict/
├── data-pipeline/        Node/TypeScript build scripts (not shipped)
│   ├── src/sources/      One module per source: download + parse
│   ├── src/merge/        Merge, normalize (OpenCC), rank readings
│   ├── src/build/        Write canto.db, syllables.pack, syllables.json, phrase table
│   ├── fixtures/         Small sample files for parser tests
│   └── .cache/           Downloaded raw data (git-ignored)
├── app/                  Expo Router screens
│   ├── (tabs)/lookup.tsx
│   ├── (tabs)/translate.tsx
│   ├── (tabs)/saved.tsx
│   ├── (tabs)/settings.tsx
│   └── entry/[id].tsx
├── src/
│   ├── db/               Opens canto.db; all dictionary SQL; DB interface for tests
│   ├── dictionary/       Input classification, search, ranking
│   ├── jyutping/         Text → Jyutping; syllable parser/normalizer
│   ├── audio/            Syllable player; sentence speaker (expo-speech)
│   ├── translate/
│   │   ├── offline/      Phrase table + reorder rules
│   │   ├── online/       OpenAI-compatible client, presets, prompt
│   │   └── index.ts      translate(text) orchestrator
│   ├── settings/         Provider config; expo-secure-store key storage
│   └── userdata/         user.db: history + favorites
├── assets/               Generated canto.db, syllables.pack, syllables.json (git-ignored)
├── dashboard/            Progress dashboard (index.html + progress.js)
└── docs/
```

Screens hold no business logic. Each `src/` module exposes a small typed API and is unit-testable without a device.

## 4. Data pipeline

Run on the Mac with `npm run data:build`. Steps: download → parse → merge → validate → build. Any download or validation failure stops the build.

### 4.1 Sources

| Data | Source | License (personal use OK for all) |
|---|---|---|
| Character readings, ranked | rime-cantonese `char.csv` → LSHK `list.tsv` → Unihan `kCantonese` (priority order) | CC BY 4.0 / CC BY 4.0 / Unicode v3 |
| Word readings | rime `jyut6ping3.words.dict.yaml` + words.hk public word list | CC BY 4.0 / public domain |
| Definitions (yue + eng), examples (yue / zho / eng) | words.hk full dump (`all-*.csv.gz` via the request form) | words.hk NC-ODL 1.0 |
| Mandarin equivalents of Cantonese words | Kaifangcidian 開放詞典 (Yale → Jyutping) + Wiktionary dialect-synonym tables (reversed) | CC BY 3.0 / CC BY-SA |
| Mandarin definitions of standard words | MoE 國語辭典 via g0v/moedict-data | CC BY-ND 3.0 TW |
| English fallback | CC-Canto, CC-CEDICT Cantonese readings | CC BY-SA 3.0 |
| Syllable audio | words.hk female syllable set (3,902 clips) from `AlienKevin/wordshk_app` `assets/jyutping_female` | No published license. Personal use only; never redistribute. |
| Translation test set | HKAllen corpus sample + raptorkwok-base sample | CC BY 4.0 / CC0 |

### 4.2 Merge rules

- Normalize every headword key with OpenCC so rime (OpenCC forms) and words.hk (HK forms) join correctly. Store `trad` and `simp` for every headword and example.
- Reading rank from rime (預設 default / 常用 common / 罕見 rare / 棄用 obsolete). LSHK merged "lazy" readings (e.g. `m5`/`ng5`) become `variant`, never default.
- Strip or translate source-specific markers: CC-Canto `dou3*2` changed tones, words.hk `!` loan-syllable markers.
- Validate every Jyutping against the syllable inventory, allowing sentence particles (`la1`, `ga3`, …).

### 4.3 `canto.db` schema

```sql
entries     (id INTEGER PK, trad TEXT, simp TEXT, kind TEXT CHECK(kind IN ('char','word')), freq REAL)
readings    (entry_id, jyutping TEXT, rank TEXT, source TEXT)
mandarin    (entry_id, word_simp TEXT, word_trad TEXT, source TEXT)
definitions (entry_id, sense INTEGER, pos TEXT, yue TEXT, eng TEXT, zho TEXT, source TEXT)
examples    (entry_id, sense INTEGER, yue_trad TEXT, yue_simp TEXT, jyutping TEXT, zho TEXT, eng TEXT)
search_keys (key TEXT, entry_id, type TEXT CHECK(type IN ('toned','toneless','joined')))
english_fts USING fts5(entry_id UNINDEXED, text)
-- indexes on entries(trad), entries(simp), search_keys(key)
```

### 4.4 Audio pack

All syllable clips are re-encoded to 32 kbps mono AAC/MP3 and concatenated into `syllables.pack` (~6 MB). `syllables.json` maps `jyutping → [offset, length]`. Syllables with no clip are listed in the build report.

### 4.5 Phrase table

Generated by reversing Kaifangcidian + Wiktionary mappings (Mandarin → Cantonese), then merged with a hand-curated list of ~300 high-frequency phrases in `src/translate/offline/curated.ts`. The curated list wins on conflict.

### 4.6 Build report

`data-pipeline/build-report.md`: entry counts per source, reading coverage, audio coverage (types and token-weighted), DB size, and validation warnings. Key numbers are copied onto the dashboard.

## 5. Lookup

### 5.1 Input classification and search

Debounced 150 ms; top 50 results.

| Input | Type | Matching |
|---|---|---|
| Contains CJK | Characters | Exact (`trad` or `simp`) → prefix → contains |
| Latin with tone digits that splits into valid Jyutping syllables (`sik6`, `sik6 faan6`) | Jyutping only | Prefix on `search_keys`. Spaces are ignored. |
| Latin without digits that splits into valid Jyutping syllables (`sik`, `sikfaan`, `sin`) | Jyutping **and** English | Two labelled groups, Jyutping first. Toneless syllables match all tones. |
| Any other Latin text (`eat`) | English only | FTS5 on `english_fts` |

Ranking: match quality (exact > prefix > contains) → `freq` (rime weights) → shorter headword.

### 5.2 Entry screen

- Headword in simplified (large) + traditional (small) when different.
- Each reading with 🔊 (real-person syllables) and its rank tag.
- Mandarin line, in fallback order: (1) `mandarin` table equivalents; (2) MoE definition (`definitions.zho`); (3) words.hk Cantonese explanation, labelled 粤语释义.
- English, definitions by sense, examples with Jyutping, Mandarin and 🔊.
- For words: each character links to its own entry.
- ☆ toggles favorite. Opening an entry appends to history.

### 5.3 Saved

`user.db` (writable, separate from `canto.db`):

```sql
favorites (entry_id PK, added_at)
history   (id PK, kind TEXT CHECK(kind IN ('lookup','translation')), entry_id NULL, input TEXT NULL, output TEXT NULL, at)
```

History is newest first and capped at 500 rows, with a Clear button. Tapping a translation reopens it on the Translate tab.

## 6. Translation

### 6.1 Flow

`translate(text) → { cantonese, jyutping[], source: 'offline' | 'online', note? }`

1. Validate: trimmed, non-empty, ≤ 500 characters.
2. **Offline (always, immediate):** OpenCC s2t → phrase table (longest match) → reorder rules → Jyutping via `src/jyutping` → OpenCC t2s for display. Tagged 离线.
3. **Online (if a connection and key are present, started in parallel):** on success, replace the offline result and tag it AI. On failure, keep the offline result and show a note.

### 6.2 Offline rules (initial set)

Word substitutions (的→嘅, 是→係, 没有→冇, 他/她→佢, 在→喺, 看→睇, 什么→乜嘢, 吃→食, …) plus reorder rules: comparatives (A比B高 → A高過B), 先 placement (你先走 → 你行先), 给我 → 畀我, progressive 在V → V緊, 了 → 咗/喇, A-not-A questions.

### 6.3 Online client

- `POST {baseURL}/chat/completions` (OpenAI-compatible), `Authorization: Bearer <key>`, 15 s timeout.
- Presets:
  - **Gemini (default):** base `https://generativelanguage.googleapis.com/v1beta/openai/`, model `gemini-3.8-flash`. On HTTP 429, retry once with `gemini-3.5-flash-lite`.
  - **Z.ai:** base `https://api.z.ai/api/paas/v4/`, model `glm-4.7-flash`.
  - **Custom:** user-entered base URL, model and key.
- Prompt: translate into natural Hong Kong colloquial Cantonese in traditional characters, with few-shot examples. Request JSON `{"cantonese": "..."}`. If parsing fails, accept raw text only if it contains CJK.
- The key is stored with `expo-secure-store` and never logged.

### 6.4 Read-aloud

- Default: `expo-speech` with the first installed voice whose language is `yue-HK` or `zh-HK`.
- Toggle: real-person syllables in sequence, using the displayed Jyutping.
- Dictionary characters and words always use real-person syllables.

## 7. Error handling

| Situation | Behaviour |
|---|---|
| `canto.db` fails to open/copy | Full-screen error + Retry |
| Syllable has no clip | Speak that character with iOS TTS; show a small "TTS" tag |
| No Cantonese voice installed | Show download steps (Settings → Accessibility → Spoken Content → Voices) |
| No API key | Offline result + hint to Settings |
| 401 | "API key invalid" + link to Settings; keep offline result |
| 429 | Retry once with the fallback model, then keep offline result |
| Timeout / bad JSON / no CJK in reply | Keep offline result + note |
| Input > 500 characters | Ask the user to shorten it |
| Pipeline download or validation failure | Build stops with a clear message; no partial outputs |

## 8. Testing

- **Unit (Jest, `jest-expo`):** input classifier, Jyutping parser/normalizer, search ranking, offline rules (golden input→output pairs), online client (mocked fetch: 200 / 401 / 429 / timeout / bad JSON), history cap.
- **DB tests:** `src/db` depends on a small `Db` interface; tests use `better-sqlite3` against a fixture DB built by the pipeline from `data-pipeline/fixtures/`.
- **Pipeline tests:** each source parser against fixture files (e.g. Yale → Jyutping).
- **Translation eval:** `npm run eval:translate` prints chrF of the offline converter on the test set; the score is tracked on the dashboard.
- **Device QA checklist:** search (characters / Jyutping / English), syllable and sentence audio, translate in airplane mode, online upgrade replaces the offline result.
- Development is test-first.

## 9. Out of scope for v1

- Android, App Store distribution.
- On-device neural translation models (size budget).
- Per-word recordings (Lingua Libre / Commons) and Common Voice alignment. Possible v1.x add-on.
- Cloud TTS (Azure / Google / Polly).
- Favoriting translations; flashcards; sync across devices.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Gemini free-tier limits or model names change | Presets are data, not code; Custom preset; Z.ai fallback |
| Gemini unavailable in HK / mainland China | Z.ai preset works there |
| Offline translation sounds stiff | Labelled 离线; online upgrade; chrF eval to track improvements |
| `to-jyutping` uses JS syntax Hermes may not support | Verify early in the plan; transpile or vendor if needed |
| words.hk dump requires a manual request form | Pipeline accepts a manually downloaded file path if automated download fails |
| `expo-sqlite` FTS5 availability | Confirm in the first plan task; fall back to `LIKE` on a lowercase English column |
