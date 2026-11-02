// Every data source in spec §4.1, credited on the licenses screen. Licenses as recorded in
// data-pipeline/fixtures/sources.txt (and spec §4.1 for the translation test set).

export interface DataSource {
  /** Unique; names the row's test ids. */
  id: string;
  name: string;
  /** What the app uses it for. */
  use: string;
  license: string;
  url: string;
}

export const SOURCES: readonly DataSource[] = [
  {
    id: "rime-char",
    name: "rime-cantonese 字表（char.csv）",
    use: "单字读音及排序（第一优先）",
    license: "CC BY 4.0",
    url: "https://github.com/CanCLID/rime-cantonese-upstream",
  },
  {
    id: "lshk",
    name: "LSHK 粤拼字表（jyutping-table）",
    use: "单字读音（第二优先）",
    license: "CC BY 4.0",
    url: "https://github.com/lshk-org/jyutping-table",
  },
  {
    id: "unihan",
    name: "Unihan 数据库（kCantonese）",
    use: "单字读音（第三优先）",
    license: "Unicode License v3",
    url: "https://github.com/unicode-org/unihan-database",
  },
  {
    id: "rime-words",
    name: "rime-cantonese 词库（jyut6ping3.words.dict.yaml、essay-cantonese.txt）",
    use: "词语读音及词频",
    license: "CC BY 4.0",
    url: "https://github.com/rime/rime-cantonese",
  },
  {
    id: "wordshk-list",
    name: "粤典 words.hk 公开词表",
    use: "词语读音",
    license: "公有领域（public domain）",
    url: "https://words.hk/faiman/analysis/",
  },
  {
    id: "wordshk-dump",
    name: "粤典 words.hk 完整数据",
    use: "粤语释义及例句。© Hong Kong Lexicography Ltd",
    license: "words.hk NC-ODL 1.0",
    url: "https://words.hk",
  },
  {
    id: "kaifangcidian",
    name: "开放词典 Kaifangcidian（開放詞典）",
    use: "粤语词语的普通话对应词",
    license: "CC BY 3.0",
    url: "https://www.kaifangcidian.com/",
  },
  {
    id: "wiktionary",
    name: "Wiktionary 方言同义词表（经 kaikki.org）",
    use: "粤语词语的普通话对应词",
    license: "CC BY-SA 4.0 / GFDL",
    url: "https://en.wiktionary.org/",
  },
  {
    id: "moedict",
    name: "教育部《重編國語辭典修訂本》",
    use: "普通话释义，经 g0v/moedict-data 转换（https://github.com/g0v/moedict-data）",
    license: "CC BY-ND 3.0 TW",
    url: "https://dict.revised.moe.edu.tw/",
  },
  {
    id: "wordshk-audio",
    name: "粤典 words.hk 女声音节录音（AlienKevin/wordshk_app）",
    use: "真人音节发音",
    license: "未公开授权，仅限个人使用，不得再散布",
    url: "https://github.com/AlienKevin/wordshk_app",
  },
  {
    id: "hkallen",
    name: "HKAllen 粤普平行语料",
    use: "翻译测试集（不随应用发布）",
    license: "CC BY 4.0",
    url: "https://huggingface.co/datasets/HKAllen/cantonese-chinese-parallel-corpus",
  },
  {
    id: "raptorkwok",
    name: "raptorkwok 粤普平行语料（base）",
    use: "翻译测试集（不随应用发布）",
    license: "CC0",
    url: "https://huggingface.co/datasets/raptorkwok/cantonese-chinese-parallel-corpus-base",
  },
];
