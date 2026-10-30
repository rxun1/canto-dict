# Lexical datasets for an offline Cantonese dictionary app

_Research date: 2026-10-29. Every count below comes from files I downloaded to `/tmp` and parsed myself, unless it says otherwise. License quotes come from each project's own LICENSE, README or terms page, linked inline._

## 0. TL;DR

| Need | Primary source | Supplements | License you inherit |
|---|---|---|---|
| (a) char → Jyutping (multiple readings, ranked) | **rime-cantonese-upstream `char.csv`** (27k chars, with `預設/常用/罕見/棄用` rank) | **LSHK `list.tsv`** (29k chars), **Unihan `kCantonese`** (29.9k chars), **words.hk charlist** (public domain) | CC BY 4.0 + Unicode License v3 (both permissive) |
| (b) word → Jyutping | **rime-cantonese `jyut6ping3.words.dict.yaml`** (101.8k words) | **words.hk wordslist** (62.6k, public domain), KFCD 粵語詞典 Jyutping; optionally CC-CEDICT Cantonese readings (share-alike) | CC BY 4.0 / PD (optionally CC BY-SA 3.0) |
| (c) Mandarin equivalent / Mandarin meaning | **Kaifangcidian 開放粵語詞典 (`cidian_zhyue-kfcd`)**: Cantonese word → Mandarin equivalents (≈12.5k of 40.7k entries in the 2019 file; the site now reports 84,783 words) | **Wiktionary dialectal-synonym tables** (≥2,500 concept tables, share-alike); KFCD `yyzd` (sparse Mandarin char definitions); MoE 國語辭典 (verbatim only) for standard words | CC BY 3.0 (permissive); optional CC BY-SA 4.0 / CC BY-ND 3.0 TW |
| English glosses (nice-to-have) | **CC-CEDICT** (125k) + **CC-Canto** (34k) | Unihan `kDefinition` | CC BY-SA 4.0 / 3.0 (share-alike) + Unicode |
| (d) Fallback g2p for arbitrary text | **`to-jyutping`** npm (BSD-2-Clause, pure JS, ~389 KB bundle incl. data) | PyCantonese (MIT, Python, build-time only) | BSD-2 |
| Highest-quality definitions (Cantonese + English) | **words.hk 粵典** full dump | – | ⚠️ **Non-Commercial Open Data License 1.0**: no ads, no paid app, no sub-licensing, unless you get a separate license |

**Bottom line:** a **commercial-safe core** (rime-cantonese + LSHK + Unihan + words.hk public-domain lists + Kaifangcidian + to-jyutping) needs **attribution only**. Adding **CC-CEDICT / CC-Canto / Wiktionary** gets you English glosses and more Mandarin equivalents, but the bundled database then has to be shared under **CC BY-SA**. Adding **words.hk definitions** limits you to a **non-commercial** app (free, no ads) unless Hong Kong Lexicography Ltd grants you a separate license.

---

## 1. Background concepts (short primer)

- **Jyutping (粵拼)** is the LSHK romanization scheme: initial + final + tone digit 1–6 (`sik6`). Datasets sometimes differ in (1) which variant readings they allow (e.g. "lazy" merged readings such as `ng5`/`m5` or `n-`/`l-`), (2) whether a word records **changed tone (變調)** (e.g. 蛋 `daan2` alone vs 蛋糕 `daan6 gou1`), and (3) non-standard particle syllables (`la1`, `ga3`).
- **Char vs word readings:** a character can have several readings (行 `hang4/haang4/hong4/hang6`). Word lists settle which one applies in context, which is why you want both a char table and a word table, plus a g2p segmenter for free text.
- **g2p (grapheme-to-phoneme)** means automatic conversion from characters to Jyutping. Cantonese g2p tools use longest-match segmentation over a word list, then fall back to the most common reading of each character.
- **License terms that matter for an app:**
  - **Attribution (BY):** credit the source and link the license (an "About / Licenses" screen is enough).
  - **ShareAlike (SA):** if you *adapt* the data (merge, convert, filter), the adapted data must be released under the same or a compatible license. Your app *code* does not have to be open, but anyone can legally extract and reuse your bundled DB. CC 4.0 licenses also say you may not apply "Effective Technological Measures" that restrict recipients' rights. The usual mitigation for App Store distribution is to **also publish the derived dataset openly** (for example as a GitHub release).
  - **NonCommercial (NC):** no use for commercial purposes. words.hk's definition (below) covers ads and paid services.
  - **NoDerivatives (ND):** you can redistribute but not modify the text, so you show it verbatim.

---

## 2. Comparison table

| # | Source | Content | Size (measured) | Format | License | Free app | Paid / ads app | Last update |
|---|---|---|---|---|---|---|---|---|
| 1 | [rime-cantonese](https://github.com/rime/rime-cantonese) / [upstream](https://github.com/CanCLID/rime-cantonese-upstream) | char→jyutping (ranked, 文白, 變調), word→jyutping | chars: 34,362 rows / **27,007 chars**; words: 103,077 rows / **101,811 words**; phrase list 330,701 (no jyutping) | TSV-in-YAML, CSV | **CC BY 4.0** (maps file: ODbL) | ✅ attribution | ✅ attribution | Active (dict version `2026.08.10`, pushed 2026-08-13) |
| 2 | [LSHK 電腦用漢字粵語拼音表](https://github.com/lshk-org/jyutping-table) | char→jyutping (all readings, incl. merged variants) | 38,305 rows / **29,144 chars** | TSV | **CC BY 4.0** | ✅ | ✅ | 2024-01-11 |
| 3 | [Unihan kCantonese](https://www.unicode.org/reports/tr38/#kCantonese) | 1 "most customary" reading per char; `kDefinition` English | **29,936 chars** (draft file) | TXT | **Unicode License v3** | ✅ | ✅ | Unicode 18.0 (UAX#38 rev 41, 2026-09-01) |
| 4a | [words.hk 細數據 char/word lists](https://words.hk/faiman/analysis/) | char→jyutping, word→jyutping | **5,884 chars**; **62,634 words** | CSV/JSON | **Public domain** ("Credits to words.hk appreciated") | ✅ | ✅ | charlist updated 2026-10-08 |
| 4b | [words.hk 粵典 full dump](https://words.hk/faiman/request_data/) | headword, jyutping, POS, labels, Cantonese + English definitions, bilingual examples (some `zho` lines), synonyms/antonyms | ~60k+ headwords (dump not downloaded, see §3.4) | CSV (gz), regenerated on request | **Non-Commercial Open Data License 1.0** | ⚠️ only if fully non-commercial | ❌ unless separately licensed | Daily |
| 5 | [Kaifangcidian 粵語詞典](https://www.kaifangcidian.com/xiazai/) | Cantonese word, Yale/Jyutping, **Mandarin equivalent(s)** | 2019-06-23 file: **40,708 entries, 12,513 with Mandarin**; site now says 84,783 words | TSV / JS-array | **CC BY 3.0** | ✅ | ✅ | Site © 2009-2024; GitHub mirror is 2019 |
| 6 | [Kaifangcidian 粵語字典 `yyzd`](https://github.com/kfcd/yyzd) | char, simp, reading, example words, **Mandarin definition** | 6,577 rows; only **740** have definitions | TSV/CSV/MD (11 romanizations) | **CC BY 3.0** | ✅ | ✅ | 2023-03-30 |
| 7 | [CC-Canto](https://cantonese.org/download.html) | Cantonese words, jyutping, English | **34,335** entries | CEDICT-format TXT | **CC BY-SA 3.0** | ✅ SA | ✅ SA | 2017-02-02 (unmaintained) |
| 8 | [CC-CEDICT Cantonese readings](https://cantonese.org/download.html) | Jyutping for CC-CEDICT headwords | **105,862** lines | CEDICT-format TXT | **CC BY-SA 3.0** | ✅ SA | ✅ SA | 2015-09-23 (unmaintained) |
| 9 | [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) | Mandarin dictionary, English glosses; 68 `(Cantonese)` entries, 14 "Mandarin equivalent" notes | **125,324** entries | TXT | **CC BY-SA 4.0** | ✅ SA | ✅ SA | Daily (2026-10-29) |
| 10 | [English Wiktionary](https://en.wiktionary.org/) / [kaikki.org](https://kaikki.org/dictionary/rawdata.html) | Jyutping, English senses, **dialectal-synonym tables (Standard Written Chinese ↔ Cantonese)** | Chinese: 308,751 word forms; ≥2,500 `Module:zh/data/dial-syn/*` tables | JSONL (raw 2.9 GB gz) / Lua | **CC BY-SA 4.0** (+GFDL) | ✅ SA | ✅ SA | Monthly (extract 2026-10-25) |
| 11 | [zh.wiktionary via kaikki](https://kaikki.org/dictionary/rawdata.html) | Chinese-language definitions (some 〈方〉 Cantonese senses) | zh-extract 223.6 MB gz | JSONL | **CC BY-SA 4.0** | ✅ SA | ✅ SA | Monthly |
| 12 | [to-jyutping](https://github.com/CanCLID/to-jyutping) (JS) / [ToJyutping](https://github.com/CanCLID/ToJyutping) (Py) | Sentence g2p with candidates + IPA | npm 3.1.1, 1.28 MB unpacked, `dist/index.mjs` 389 KB | npm | **BSD-2-Clause** | ✅ | ✅ | npm 2024-09-30; Py repo 2026-02 |
| 13 | [PyCantonese](https://github.com/jacksonllee/pycantonese) | g2p, segmentation, HKCanCor corpus | – | Python | **MIT** (bundled data CC BY / GPL / MPL / CC0) | build-time | build-time | 2026-05 |
| 14 | [MoE 國語辭典 (g0v)](https://github.com/g0v/moedict-data) | Mandarin (Taiwan) definitions of standard words | 重編本 ~160k (not counted) | JSON | **CC BY-ND 3.0 TW** | ✅ verbatim | ✅ verbatim | 2026-07 |
| ✗ | [CUHK 粵語審音配詞字庫](https://humanum.arts.cuhk.edu.hk/Lexis/lexi-can/) | char readings + word examples | 13,060 chars / 18,969 readings (site stats page) | web only | © CUHK, no license | ❌ | ❌ | old |
| ✗ | [CUHK 現代標準漢語與粵語對照資料庫](https://apps.itsc.cuhk.edu.hk/hanyu/Page/Cover.aspx) | Standard Chinese ↔ Cantonese words | n/a | web only | "(c) 2014保留版權" | ❌ | ❌ | completed 2001 |
| ✗ | [CantoDict](https://www.cantonese.sheik.co.uk/) | Cantonese/Mandarin/English | n/a | web | "CantoDict is not public domain" | ❌ | ❌ | active |
| ✗ | [ABC Cantonese-English (Wenlin)](https://wenlin.co/wow/Project:Jyut) | 16,000+ entries | n/a | wiki | "All Rights Reserved" | ❌ | ❌ | active |
| ✗ | [兩岸三地生活差異詞語彙編 (g0v csld)](https://github.com/g0v/moedict-data-csld) | TW/CN/HK/MO word equivalents | 1,006 rows | CSV | CC BY-NC-ND 4.0 granted *to the MoEDict project* | ❌ | ❌ | 2023 |
| ✗ | [jyutnet/cantonese-books-data](https://github.com/jyutnet/cantonese-books-data) (廣州話正音字典 etc.) | historic char readings | – | JSON | no license (book copyright) | ❌ | ❌ | 2026-10 |
| ✗ | [AlienKevin/wordshk-tools `mandarin_variants.tsv`](https://github.com/AlienKevin/wordshk-tools) | LLM-generated Mandarin equivalents of words.hk senses | 20,802 rows | TSV | no license; derived from NC data | ❌ | ❌ | 2025-01 |

---

## 3. Source-by-source details

### 3.1 rime-cantonese and rime-cantonese-upstream (CanCLID)

- **URLs:** <https://github.com/rime/rime-cantonese> (built dictionaries), <https://github.com/CanCLID/rime-cantonese-upstream> (curated CSV source tables)
- **Files and measured counts:**
  - `jyut6ping3.chars.dict.yaml`: 34,362 rows covering **27,007 unique chars**, `char<TAB>jyutping<TAB>weight%`. Example: `行 haang4 5%`, `行 hang4 5%`, `行 hang6 5%`, `行 hong2 3%`, `行 hong4 5%`, `行 hong6 0%`.
  - `jyut6ping3.words.dict.yaml`: 103,077 rows covering **101,811 unique words** (`吖嗪 aa1 ceon4`).
  - `jyut6ping3.phrase.dict.yaml`: 330,701 phrases with **no** jyutping (Rime derives it). Don't use this file as a reading source.
  - Upstream `char.csv`: `char,jyutping,pron_rank,tone_var,literary_vernacular,comment`. `pron_rank` ∈ {`預設` (exactly one default), `常用`, `罕見`, `棄用`}, `tone_var` ∈ {`本調`,`變調`}, `literary_vernacular` ∈ {`文讀`,`白讀`}. Example: `冇,mo5,棄用` / `冇,mou5,預設`; `嘅,ge3,預設` / `嘅,ge2,罕見`. **This is the best ready-made ordering of multiple readings.**
  - Upstream `word.csv`, `fixed_expressions.csv` (成語/諺語), `phrase_fragment.csv`, etc.
- **Conventions (from the upstream README):** keeps ng-/∅- distinct and excludes lazy readings ("唔收懶音，例如 n-/l- 混淆音"). Word readings record **actual (sandhi) pronunciation** ("詞語標音全部記作實際發音，即係變調後嘅發音"). Words are normalized to **OpenCC glyph forms**.
- **Data provenance (upstream README):** char readings come mainly from the LSHK table, with reference to Unihan, CUHK 粵語審音配詞字庫 and 廣州話正音字典. Words come from words.hk's public-domain wordslist, 冚唪唥粵文, 《實用廣州話分類詞典》, and other dictionaries.
- **License:** README: "主體部分循「共享創意-署名-4.0 國際」協議發佈，`jyut6ping3.maps` 循「開放資料庫授權-1.0」協議發佈". `LICENSE-CC-BY` and `LICENSE-ODbL` are in the repo root. **Exclude `jyut6ping3.maps.dict.yaml`** (4,439 HK street names from OpenStreetMap, ODbL share-alike) unless you want ODbL obligations.
- **App use:** ✅ free and paid, with attribution.
- **Maintenance:** very active (version `2026.08.10`).
- **Downloads:** `https://raw.githubusercontent.com/rime/rime-cantonese/main/jyut6ping3.{chars,words}.dict.yaml`, `https://raw.githubusercontent.com/CanCLID/rime-cantonese-upstream/main/{char,word}.csv`
- **Used by:** yuetyam/jyutping (iOS/macOS keyboard + dictionary, CC0 code), PyCantonese, tracywong117/pinyin-dictionary, and others.

### 3.2 LSHK 電腦用漢字粵語拼音表 (Jyutping table)

- **URL:** <https://github.com/lshk-org/jyutping-table>
- **Content:** `list.tsv` with columns `CH UCODE JP INIT FINL TONE DESC DESC_JP`: 38,305 readings covering **29,144 chars** (README: ISO/IEC 10646-1:2000's 27,484 chars + HKSCS-2001's 4,384).
- **Convention caveat:** it lists merged or variant readings that rime excludes, e.g. `㐅 m5, ng5` vs rime `ng5`, and `㐐 lou4, nou4` vs rime `nou4`. 5,968 LSHK chars have at least one reading that rime lacks, and 2,488 LSHK chars are missing from rime entirely (mostly rare CJK Ext-A/HKSCS).
- **License:** README: "粵拼表以 CC BY 4.0 權限發佈" / "The List is released under the CC BY 4.0 license."
- **App use:** ✅ with attribution. **Updated:** 2024-01-11.
- **Download:** `https://raw.githubusercontent.com/lshk-org/jyutping-table/master/list.tsv`

### 3.3 Unicode Unihan `kCantonese` (and `kDefinition`)

- **URL:** <https://www.unicode.org/reports/tr38/#kCantonese>. Draft per-property files are at <https://github.com/unicode-org/unihan-database> (`kCantonese.txt`, `kDefinition.txt`). The release version is in `Unihan.zip` → `Unihan_Readings.txt`.
- **Content:** UAX #38: "The most customary jyutping (Cantonese) reading for this ideograph. This property is targeted specifically for use by CLDR collation and transliteration. The values may not in all cases track the preferred reading in some dictionaries." The current draft has **one reading per char** across **29,936 chars** (0 multi-reading lines). Examples: `U+884C 行 hang4`, `U+5605 嘅 ge3`, `U+5187 冇 mou5`. `kDefinition` gives English glosses.
- **Role:** last-resort coverage for chars in no other table. Not suitable for multiple readings.
- **License:** [Unicode License V3](https://www.unicode.org/license.txt): "Permission is hereby granted, free of charge, … to deal in the Data Files or Software without restriction, including … the rights to use, copy, modify, merge, publish, distribute, and/or sell copies … provided that either (a) this copyright and permission notice appear with all copies … or (b) this copyright and permission notice appear in associated Documentation."
- **App use:** ✅ free and paid (include the notice). **Updated:** Unicode 18.0 (UAX#38 rev 41, 2026-09-01).

### 3.4 words.hk 粵典

There are **two** distinct data products with **different licenses**:

**(a) 細數據 analysis lists: public domain.** <https://words.hk/faiman/analysis/>
- `charlist.csv` (`/faiman/analysis/charlist.csv`): **5,884 chars** → jyutping list (`嘅,ge2,ge3`, `食,sik4,sik6`). Page: "可以用作｛字=>粵拼｝嘅數據 … Data License: public domain. Credits to words.hk appreciated. 授權：公有領域。" Last updated 2026-10-08.
- `wordslist.csv` (`/faiman/analysis/wordslist.csv`): **62,634 headwords** → jyutping(s) (`冇mood,mou5 mut1`). Page: "Contains the wordlist and pronunciations of all entries recorded in the dictionary … Data License: public domain."
- Also public domain: character/word frequency from the 粵文庫 corpus, and an English→Cantonese index.
- Quirk: English-letter loan syllables are prefixed with `!` (e.g. `!es1`) and are not valid Jyutping.

**(b) Full dictionary dump: Non-Commercial.** <https://words.hk/faiman/request_data/>
- Obtained through a form (POST with CSRF token) that returns `/static/generated/all-<timestamp>.csv.gz` and `wordpos-<timestamp>.csv.gz`. I got the links but did not download the dump. CSV columns per the [words-hk-parse types](https://github.com/MarvNC/words-hk-parse): `id, headword, entry, variants, warning, public`. The `entry` text holds `(pos:…)(label:…)(sim:…)(ant:…)(ref:…)`, `<explanation>` with `yue:` + `eng:` lines, and `<eg>` blocks with optional `zho:` (Standard Chinese), `yue:`, `eng:`, `lzh:` lines ([wordshk-tools parse.rs](https://github.com/AlienKevin/wordshk-tools)).
- **Mandarin:** **no** Mandarin-equivalent field. Definitions are in written Cantonese + English, and only some example sentences carry a `zho` line. For 冇, the page shows Cantonese/English definitions, 反義 有, and 參看 links, but no 普通話 equivalent.
- **License:** "粵典嘅詞典資料係以《非商業開放資料授權協議 1.0》發佈" → [Non-Commercial Open Data License 1.0](https://words.hk/base/hoifong/), "Copyright (c) 2015-2025, Hong Kong Lexicography Limited". Key clauses (verbatim):
  - 1(a) "You do not use the Licensed Work for Commercial Purposes as defined in Section 2 unless the conditions in Section 3 are met."
  - 1(b)(i) "All distributions of the Licensed Work or its derivatives in any form must reproduce the above copyright notice, the above disclaimer, and the Credits List…"; (ii) "…must display a prominent link to that website."
  - 1(d) "You do not sub-license any or parts of the Licensed Work."
  - 2: Commercial use "DOES include … a) Collecting advertisement fees … b) Selling any service using the Licensed Work as a value added component. c) Publishing the Licensed Work in exchange for valuable consideration. … f) Any use of the Licensed Work normally protected by copyright, in a commercial setting … it is immaterial whether You make a profit or loss…"
  - 3: exceptions are (a) a separate agreement, (b) no reply after 6 months of good-faith attempts, (c) "The Licensed Work has been published for ten or more years" (old versions only), (d) US fair use, (e) "Use in small personal businesses … sole proprietor with revenue less than 3 times the personal median income".
- **App use:** ✅ in a **free, ad-free, no-IAP** app with the notice, disclaimer, Credits List and a prominent link. ❌ in a paid or ad-supported app unless you get a separate license (or qualify under 3(e)). Note that sub-licensing is forbidden, so you **can't relicense** a merged DB under CC BY-SA. Keep words.hk content in a separate, separately licensed table or file.
- **Maintenance:** very active (daily exports).
- **Related:** the official app ([AlienKevin/wordshk_app](https://github.com/AlienKevin/wordshk_app), Flutter, MIT code) bundles this data. [MarvNC/wordshk-yomitan](https://github.com/MarvNC/wordshk-yomitan) states its build "is licensed under the Non-Commercial Open Data License 1.0 that words.hk is."

### 3.5 Kaifangcidian 開放詞典: 粵語詞典 (words) and 粵語字典 (chars)

- **URLs:** <https://www.kaifangcidian.com/han/yue/>, downloads at <https://www.kaifangcidian.com/xiazai/> (`cidian_zhyue-kfcd.zip` words, `zidian_zhyue-kfcd.zip` chars, `pinyinbiao_yue-kfcd.zip` romanization table), GitHub <https://github.com/kfcd> (`yyzd`, `pingyam`, `yylc` classifiers).
- **Word dictionary (`cidian_zhyue`)**: the format I inspected was the 2019-06-23 simplified + Yale file, mirrored [here](https://github.com/android-app-development-course/2019-B19-CantoneseLearning/tree/master/%E7%B2%A4%E8%AF%AD%E8%AF%8D%E5%BA%93). It has **40,708 rows**, `word<TAB>romanization<TAB>Mandarin equivalents (，-separated)`, and **12,513 rows have a Mandarin equivalent**:
  ```
  嘅	ge3	的
  冇	mou5	没有，没，无
  乜嘢	mat7 ye5	什么，什么东西
  咁	gam3	这么，那么
  佢	keui5	他，她，它
  睇	tai2	看
  ```
  This is **exactly the "Cantonese → Mandarin equivalent" field** you asked for, under a permissive license. The site homepage now reports "字：6654 ・ 詞：84783 ・ 例句：16048", so download the current zip from `/xiazai/` rather than the 2019 mirror. My sandbox blocked downloading it, so I couldn't verify how many rows the current zip has.
  - Romanization: the "ylshu" file is **Yale with numeric tones 1–9** (entering tones 7/8/9 → Jyutping 1/3/6; Yale `j`=Jyutping `z`, `y`=`j`; e.g. `jin3 jang1` = 戰爭 `zin3 zang1`). The zip also contains a Jyutping ("yp") edition, but Jyut Dictionary's parser calls it a single-line JS array ("The Kaifangcidian data for jyutping is horrible…") and shows how to align the two ([parse.py](https://github.com/aaronhktan/jyut-dict/blob/master/src/dictionaries/kaifangcidian/parse.py)).
  - Quality: crowd-sourced and uneven (e.g. one 嘢 row gives "传染"). Treat it as a hint layer and review high-frequency words.
- **Char dictionary (`yyzd`)**: `繁體 | 簡體 | 拼音 | 詞例 | 定義 | 又作`, 6,577 rows, but only **740** have a Mandarin definition (e.g. `行 hang6 … 足以表明品質的舉止行動；可以；能幹…`). Shipped in 11 romanizations under `dist/`. Updated 2023-03-30.
- **License:** site `/yue/cc/`: "本站上所有資源，除非另有聲明，都以創作共用"署名 3.0"許可協議授權發佈". The `yyzd` LICENSE says "本倉庫採用創作共用"署名 3.0"許可協議授權 … 且為任何目的，包含商業性質之使用。… 姓名標示 — 你必須給予 適當表彰、提供指向本授權條款的連結…". Jyut Dictionary records the word dictionary's legal line as "本词典以创作共用"署名 3.0"许可协议授权发布".
- **App use:** ✅ free and paid, attribution only (CC BY 3.0, no SA).

### 3.6 CC-Canto and CC-CEDICT Cantonese readings (Pleco / cantonese.org)

- **URL:** <https://cantonese.org/download.html>: `cccanto-170202.zip`, `cccedict-canto-readings-150923.zip`
- **CC-Canto:** **34,335** entries, CEDICT format plus `{jyutping}`: `一世人 一世人 [yi1 shi4 ren2] {jat1 sai3 jan4} /the whole life…/`. English definitions only, with rough formatting ("the definition formatting in CC-Canto entries is very rough"). Only 12 entries carry a "Mandarin equivalent" note (`冇 … /to not have (Cantonese)/Mandarin equivalent: 没有méiyǒu [没有]/`).
- **CC-CEDICT readings:** **105,862** lines that map CC-CEDICT headwords to Jyutping (`銀行 银行 [yin2 hang2] {ngan4 hong4}`). They are keyed to the 2015 CEDICT, so newer CEDICT entries have no reading.
- **Quirks:** changed-tone notation `dou3*2`, `/`-separated alternatives (`gaa3 zaa3 / zaa4`), stray full-width commas (`，bat1`). I counted 176 invalid tokens in CC-Canto and 454 in the readings file. Agreement with rime on shared words: CC-Canto **14,828 / 16,654 (89%)**, CEDICT readings **51,530 / 53,194 (96.9%)**. Example disagreements: `㗎喇 gaa2 laa1` vs rime `gaa3 laa3`, `㕵㕵狗 gwok3 gwok3 gau2` vs rime `wau1 wau1 gau2`.
- **License:** file headers: "Copyright (c) 2015-17 Pleco Inc. Distributed under a Creative Commons Attribution-Share Alike 3.0 license (http://creativecommons.org/licenses/by-sa/3.0/)". Download page: "All three titles are open-source and distributed under a Creative Commons Attribution-ShareAlike 3.0 license."
- **App use:** ✅ free and paid, **but ShareAlike**: the derived dataset must be CC BY-SA 3.0 or a compatible later version.
- **Maintenance:** ❌ frozen since 2017 / 2015.

### 3.7 CC-CEDICT

- **URL:** <https://www.mdbg.net/chinese/dictionary?page=cc-cedict>, download `https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz`
- **Content:** **125,324** Mandarin entries with English glosses. 68 lines are tagged `(Cantonese)`, and **14** include "Mandarin equivalent: …" (`喺 … /to be at, in or on (Cantonese)/Mandarin equivalent: 在[zai4]/`).
- **License:** header: "License: Creative Commons Attribution-ShareAlike 4.0 International License". **Updated daily** (header date 2026-10-29).
- **Role:** English glosses for shared Mandarin/Cantonese vocabulary. Join it with the CC-CEDICT Cantonese readings and rime words for Jyutping.

### 3.8 Wiktionary (English and Chinese editions) / kaikki.org

- **URLs:** <https://kaikki.org/dictionary/Chinese/index.html> (deprecated per-language JSONL, 1.1 GB; "extracted on 2026-10-25 from the enwiktionary dump dated 2026-10-01"), raw data <https://kaikki.org/dictionary/rawdata.html> (English edition raw JSONL 2.9 GB gz; Chinese edition `downloads/zh/zh-extract.jsonl.gz` 223.6 MB).
- **Content (en):** 308,751 Chinese word forms, with Cantonese pronunciations (Jyutping) in `sounds` and English senses tagged Cantonese.
- **Most valuable for Mandarin equivalents: dialectal-synonym tables.** Each `Module:zh/data/dial-syn/<word>` maps a Written Standard Chinese headword to its forms in every variety. For example, the page for 冇 shows "Dialectal synonyms of 沒有", with the Written Standard Chinese row = 沒有 and the Cantonese rows = 冇 (HK) / 冇, 冇有 (Guangzhou). Through the MediaWiki API I counted **at least 2,500 such modules** before hitting the API rate limit, so the true number is higher. Reversing these tables gives Cantonese → Mandarin mappings that someone has curated. Get them from the Lua module tarball on kaikki's raw page or from the Wiktionary dump. Don't scrape the API.
- **Content (zh):** Chinese-language definitions. For 冇: "〈方〉 指没有，读"mǒu"。与有相对…", with 粤拼 `mou5`.
- **License:** Wiktionary text is **CC BY-SA 4.0** (and GFDL). kaikki asks academic users to cite Tatu Ylönen.
- **App use:** ✅ with ShareAlike obligations.
- **Precedent:** Jyut Dictionary ships a Wiktionary add-on built from kaikki data ([wiktionary/README](https://github.com/aaronhktan/jyut-dict/tree/master/src/dictionaries/wiktionary)).

### 3.9 CUHK resources: not usable

- **粵語審音配詞字庫** (<https://humanum.arts.cuhk.edu.hk/Lexis/lexi-can/>): the stats page reports 字庫總收字 **13,060**, 字庫總讀音 **18,969**. It is the authoritative reference for 審音 (word examples per reading), but it is web only, with no download and no license. rime-cantonese lists it as a *reference* source only.
- **現代標準漢語與粵語對照資料庫** (<https://apps.itsc.cuhk.edu.hk/hanyu/>): has exactly the Mandarin ↔ Cantonese mapping you want, but "(c) 2014保留版權". It was completed in 2001 and offers no download. Jyut Dictionary only ships a *scraper* for it ([cuhk/](https://github.com/aaronhktan/jyut-dict/tree/master/src/dictionaries/cuhk)), not the data. ❌ Don't bundle it.

### 3.10 G2P libraries

- **`to-jyutping` (JS/TS)**: <https://github.com/CanCLID/to-jyutping>, npm `to-jyutping@3.1.1`, **BSD-2-Clause** ("Copyright (c) 2024 Cantonese Computational Linguistics Infrastructure Development Workgroup"). No runtime dependencies; ships ESM/CJS/browser builds. The data is an embedded trie (`src/trie.txt`, 379 KB; `dist/index.mjs` is 389 KB total). API: `getJyutpingList`, `getJyutpingText`, `getJyutpingCandidates` (ranked), `getIPA*`, `customize({word: 'jyutping' | null})`. The README claims "an accuracy rate of 99%" and shows `咁啱老世要求佢等陣要開會…` → `gam3 ngaam1 lou5 sai3 jiu1 kau4 …`. The trie's provenance isn't documented, but it comes from the rime-cantonese team (CanCLID). **Recommended runtime fallback.** It uses modern syntax (private `#fields`, `||=`), which Metro/Babel transpiles, but test it on Hermes.
- **ToJyutping (Python)**: same engine and data. Useful at build time to precompute readings for words that lack them.
- **PyCantonese**: <https://github.com/jacksonllee/pycantonese>, MIT. README: "PyCantonese includes data from … Hong Kong Cantonese Corpus (CC BY), CantoMap (GPL-3.0), rime-cantonese (CC BY 4.0), Common Voice Cantonese (MPL 2.0), Cantonese-Traditional Chinese Parallel Corpus (CC0)". `characters_to_jyutping` / `g2p` segment text and disambiguate (蛋 `taːn25` vs 蛋糕 `taːn22 kou55`). It's Python only, so use it for build-time QA and don't bundle it in RN.
- Other npm packages (`cantonese-romanisation`, `jyutpingify`, `yuepin`, `lingua-han-cantonese`) are small, stale (2013–2023) char-level lookups. Not recommended.

### 3.11 Open-source dictionary apps: what they bundle

- **Jyut Dictionary** (<https://github.com/aaronhktan/jyut-dict>, MIT code, very active): README says it bundles "CEDICT, CC-CANTO, words.hk 粵典, the Unihan database, 開放詞典, and Chinese sentences from Tatoeba … over 200,000 entries". It has Python parsers for each source (`src/dictionaries/{cedict,words_hk,kaifangcidian,unihan,wiktionary,cuhk,cantodict,abc_,…}`) that write into one SQLite schema (entries → definitions → sources with a `legal` text column). Repo note: "for copyright reasons, data for these sources may not be included in this repository". Restricted sources ship as separately downloaded add-ons. **This is the best reference for an ETL + SQLite schema.**
- **yuetyam/jyutping** (iOS/macOS Cantonese keyboard + lookup, repo labelled **CC0**): credits Rime-Cantonese as its lexicon. Its `Modules/Preparing/Resources/` includes `jyutping.txt`, `definition.txt` (Unihan English), and `wordshk.txt` (words.hk definitions). ⚠️ The repo's CC0 label **does not override** words.hk's NC license, so don't copy data from aggregator repos. Always go back to the original source and license.
- **words.hk official app** (Flutter, MIT code) bundles the words.hk dump. Its tools repo has an **LLM-generated** `mandarin_variants.tsv` (20,802 sense → Mandarin rows, e.g. `仆街 → 倒霉/遭殃/完蛋`). It has no license and is derived from NC data, so ❌.

### 3.12 Other things checked

- **MoE 國語辭典 (重編本 / 簡編本 / 小字典)** via [g0v/moedict-data](https://github.com/g0v/moedict-data): "創用CC-姓名標示- 禁止改作 3.0 臺灣授權條款 … 允許使用者重製、散布、傳輸著作（包括商業性利用）… 但不得修改該著作". Usable for **Mandarin definitions of standard (non-colloquial) words**, shown verbatim with attribution to 中華民國教育部. It uses Taiwan Mandarin norms, and ND means you can't edit or trim the definitions.
- **Hugging Face:** no lexical Cantonese datasets turned up. There are sentence-level Cantonese ↔ Standard Chinese parallel corpora, e.g. `raptorkwok/cantonese-chinese-parallel-corpus-base` (**CC0**), `HKAllen/cantonese-chinese-parallel-corpus` (CC BY 4.0), and `botisan-ai/cantonese-mandarin-translations` (CC BY-NC-SA, ❌). The CC0 corpus could later be mined (word alignment) to propose more Mandarin equivalents, but it's not a ready-made dictionary.
- **HKCanCor** ([fcbond/hkcancor](https://github.com/fcbond/hkcancor)): CC BY 4.0, a segmented and Jyutping-annotated corpus. Useful for frequency ranking and QA, not definitions.
- **OpenCC** (Apache-2.0) / **opencc-js** (MIT AND Apache-2.0, 6 MB unpacked): Traditional ↔ Simplified and HK-variant normalization at build time. Avoid shipping the full opencc-js. Precompute simplified forms into the DB instead.
- **CantoDict** (copyright page: "CantoDict is not public domain … The only thing you cannot do is sell any of my work or publish it in any form.") ❌. **ABC Cantonese-English** ("Copyright © 2017–2026 Wenlin Institute, Inc. SPC, All Rights Reserved") ❌.

---

## 4. Cross-source agreement (measured)

Script: `/tmp/cantoresearch/scripts/compare.py` (outside the repo).

| Metric | Value |
|---|---|
| Unique chars: rime / LSHK / Unihan / words.hk | 27,007 / 29,144 / 29,936 / 5,884 |
| **Union of chars** | **32,335** |
| LSHK chars absent from rime | 2,488 |
| LSHK chars with ≥1 reading absent in rime (mostly merged-initial variants) | 5,968 |
| Unihan chars whose single reading isn't in rime | 5,796 (includes chars rime lacks) |
| words.hk words ∩ rime words, sharing ≥1 reading | **47,797 / 48,117 (99.3%)** |
| CC-CEDICT readings ∩ rime words, agree | 51,530 / 53,194 (96.9%) |
| CC-Canto ∩ rime words, agree | 14,828 / 16,654 (89.0%) |
| **Union of multi-char words** (rime + words.hk + CC-Canto + CEDICT readings) | **162,924** |
| Invalid-Jyutping tokens: rime words / words.hk / CC-Canto / CEDICT-readings | 206 (`la1`,`la3`,`a1`,`ga3`… particles) / 349 (`!`-prefixed English) / 176 (`*2`, punctuation) / 454 (full-width commas) |

---

## 5. Recommendation

### (a) char → Jyutping (multiple readings)
1. **Base:** rime-cantonese-upstream `char.csv`. Keep every reading and store `pron_rank` (預設 > 常用 > 罕見 > 棄用), `tone_var` and `literary_vernacular`. Hide `棄用` by default.
2. **Add** LSHK `list.tsv` readings for chars rime lacks (2,488), plus any LSHK reading not in rime, flagged `rank=lshk_extra`. Many of these are merged-initial variants (`m5`/`ng5`, `l`/`n`), so show them as "variant" and never as the default.
3. **Add** Unihan `kCantonese` for any char still missing (rank `unihan`).
4. **Cross-check** with words.hk `charlist.csv` (public domain). It reflects readings actually used in words.hk entries, so it's a good signal for "colloquial" readings to promote.
5. Default ordering: rime `預設` → rime `常用` (by rime weight %) → words.hk-attested → LSHK → Unihan.

### (b) word → Jyutping
1. **Base:** rime `jyut6ping3.words.dict.yaml` (or upstream `word.csv` + `fixed_expressions.csv`): 101.8k words, CC BY 4.0, readings with sandhi applied.
2. **Add** words.hk `wordslist.csv` (public domain) for the remaining ~14k words. Drop `!`-prefixed English tokens or keep them as a raw display string.
3. **Add** Kaifangcidian word readings (convert Yale 1–9 → Jyutping) for words with Mandarin equivalents that are still missing.
4. **Optional (share-alike):** CC-CEDICT Cantonese readings to cover standard Mandarin vocabulary. Normalize `*2` → changed-tone reading, split `/` alternatives, strip punctuation.
5. For any remaining dictionary headword (for example a CC-CEDICT entry with no reading), **precompute** with ToJyutping at build time and mark it `source=g2p` so the UI can say "auto-generated".

### (c) Mandarin meaning / Mandarin equivalent
1. **Mandarin equivalent for colloquial words:** **Kaifangcidian 粵語詞典** (CC BY 3.0). It's the only sizeable permissive Cantonese → Mandarin word mapping (≥12.5k mapped entries, likely more in the current 84.8k-word release). Store the values as a list (`冇 → [没有, 没, 无]`) and convert to Traditional with OpenCC at build time.
2. **Curate on top:** reverse Wiktionary dial-syn tables (≥2,500 concepts; CC BY-SA 4.0) if you accept ShareAlike. Otherwise hand-curate the top ~2,000 colloquial words (嘅/冇/佢/睇/嘢/咗/喺/啲/乜嘢/點解…) and check them against Kaifangcidian.
3. **Mandarin char definitions:** Kaifangcidian `yyzd` (740 readings with definitions, CC BY 3.0). For broader coverage of standard chars and words, show **MoE 國語辭典簡編本** definitions verbatim (CC BY-ND 3.0 TW, commercial OK) or zh.wiktionary (CC BY-SA). Don't use words.hk Cantonese explanations as "Mandarin meaning": they are written Cantonese, and they're NC.
4. **English:** CC-CEDICT + CC-Canto (both share-alike) + Unihan `kDefinition` (permissive). If you want to avoid share-alike completely, use only Unihan `kDefinition` for chars and skip word-level English.
5. **words.hk definitions:** only if the app is and stays **free, ad-free, no IAP**. Ship them as a separate table carrying its own notice, disclaimer, Credits List and link, or email Hong Kong Lexicography Ltd for a separate license.

### (d) Fallback g2p for arbitrary text
- **Runtime:** `to-jyutping` (BSD-2-Clause, about 389 KB, pure JS, offline). Use `getJyutpingCandidates` to show alternatives, and `customize()` to inject your own dictionary overrides so g2p agrees with your DB.
- **Build time:** ToJyutping/PyCantonese to fill gaps and to QA dictionary readings (flag entries where the DB and g2p disagree).

### Merge and normalization rules (handling conflicts)
- **Canonical key:** Traditional (HK) form plus a precomputed Simplified column, both indexed. Normalize glyph variants with OpenCC (`hk2t` / `t2s`), because rime uses OpenCC glyphs while words.hk uses HK glyphs (e.g. 着/著, 衞/衛). Keep the original surface form as `display`.
- **Jyutping normalization:** validate each syllable with a regex over the LSHK inventory. Map or flag: CC-Canto `X*2` → store both base and changed tone; `/` → multiple readings; words.hk `!xxx` → non-Jyutping loan syllable; rime particle syllables `la1`/`ga3`/`a1` → accept as an extended inventory (they're real particle pronunciations). Kaifangcidian Yale → Jyutping via `kfcd/pingyam` tables.
- **Lazy / merged readings:** rime excludes n-/l- and ng-/∅- mergers. LSHK lists some (`m5`/`ng5`). Store them, mark them `variant`, and never pick them as the default.
- **Tone sandhi:** word readings (rime, words.hk) record 變調. Don't reject a word reading just because it isn't a concatenation of each char's default reading.
- **Precedence for a word's primary reading:** rime → words.hk → Kaifangcidian → CEDICT-readings → g2p. Keep *all* distinct readings with a `sources` bitmask so the UI can show "also read as…".
- **Provenance per row:** keep a `source_id` on every reading and definition, as Jyut Dictionary's `sources(name, version, legal, link)` table does. That keeps attribution, ShareAlike separation and later removal of a source simple.

### Suggested packaging
- `core.sqlite` (attribution-only): rime + LSHK + Unihan + words.hk PD lists + Kaifangcidian. Credit "rime-cantonese / CanCLID (CC BY 4.0)", "LSHK Jyutping Workgroup (CC BY 4.0)", "Unicode Unihan (Unicode License v3)", "words.hk (public-domain data lists)", "開放詞典 kaifangcidian.com (CC BY 3.0)".
- `en.sqlite` (CC BY-SA, optional): CC-CEDICT, CC-Canto, Wiktionary-derived tables. Publish the derived file publicly under CC BY-SA 4.0 as well, to meet the SA and no-DRM terms.
- `wordshk.sqlite` (NC, optional, free builds only): words.hk definitions, plus the license notice, disclaimer, Credits List and link to words.hk.

---

## 6. License compliance checklist

| Source | Must do |
|---|---|
| rime-cantonese (CC BY 4.0) | Credit "rime-cantonese, CanCLID", link the license, state that you modified the data. Don't include `jyut6ping3.maps` (ODbL) unless you accept ODbL. |
| LSHK Jyutping table (CC BY 4.0) | Credit "香港語言學學會粵拼小組 / LSHK", link the license, note modifications. |
| Unihan (Unicode License v3) | Include the Unicode copyright and permission notice in the app's licenses screen. |
| words.hk analysis lists (PD) | Nothing required. "Credits to words.hk appreciated." |
| words.hk dump (NC-ODL 1.0) | Non-commercial only; copyright notice + disclaimer + Credits List; prominent link to words.hk; no sub-licensing. |
| Kaifangcidian (CC BY 3.0) | Credit "開放詞典 kaifangcidian.com", link CC BY 3.0, note modifications. |
| CC-Canto / CEDICT readings (CC BY-SA 3.0) | Credit "Pleco Inc. / cantonese.org"; the adapted data must be CC BY-SA 3.0+ compatible. |
| CC-CEDICT (CC BY-SA 4.0) | Credit "CC-CEDICT / MDBG"; the adapted data must be CC BY-SA 4.0. |
| Wiktionary (CC BY-SA 4.0) | Credit "Wiktionary contributors" with a link; adapted data must be CC BY-SA 4.0. |
| MoE 國語辭典 (CC BY-ND 3.0 TW) | Verbatim only; credit 中華民國教育部. |
| to-jyutping (BSD-2) | Include its copyright notice and license text. |

_Not legal advice. Before a paid release, have the words.hk and ShareAlike points reviewed._
