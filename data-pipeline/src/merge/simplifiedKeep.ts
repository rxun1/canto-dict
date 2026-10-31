// Characters toSimplified leaves unchanged after OpenCC's traditional → simplified conversion
// (decided 2026-10-30). Merge lists both groups in its stats for the build report.

/**
 * Cantonese characters kept in Cantonese text (toSimplified's "yue": displayed headwords and the
 * words.hk dump's definitions and example sentences). Not applied to Mandarin text ("zho-hk": the
 * Mandarin translations of words.hk examples; "zho-tw": MoE definitions, Wiktionary's Mandarin
 * words), where 係 is the Mandarin character of 關係 and simplifies to 系 as usual. Sorted by
 * code point.
 */
export const CANTONESE_KEEP: readonly string[] = [
  // hai6 "to be": OpenCC gives 系, which Cantonese readers do not write for the copula. The
  // Mandarin-origin words below (XI_TEXT_PHRASES, XI_HEADWORDS) still get 系.
  "係",
  // go2 "that": OpenCC gives 𠮶 (U+20BB6), outside the BMP; also in NON_BMP_KEEP.
  "嗰",
  // sung3 "dishes eaten with rice": OpenCC gives 𩠌 (U+2980C), outside the BMP; also in NON_BMP_KEEP.
  "餸",
];

/**
 * Mandarin-origin words in which Cantonese text still simplifies 係 to 系, matched anywhere in the
 * text before the keep-list applies. A phrase goes here only when every occurrence in the words.hk
 * dump (definitions, examples) and in every headword is that word, never the copula 係 next to a
 * character that happens to complete it. merge reports how often each one applied.
 */
export const XI_TEXT_PHRASES: readonly string[] = [
  // 關係 "relationship": all 194 hits in words.hk definitions and examples, and all 38 headwords
  // (人際關係, 沒關係, 關係到, …), are the noun; none is a word ending in 關 (海關, 機關) + copula.
  "關係",
];

/**
 * Headwords in which every 係 simplifies to 系, matched only as the whole headword, because in
 * running text the 係 can be the copula: 佢係數學老師 "he is a maths teacher", 但係數量. Each was
 * checked against its reading and sense; merge reports which applied.
 */
export const XI_HEADWORDS: readonly string[] = [
  // 係數 "coefficient" (hai6 sou3), and the headwords containing it (rime words): 二項式係數
  // "binomial coefficient", 勁度係數 "stiffness", 基尼係數 / 堅尼係數 "Gini coefficient". In
  // words.hk text all 3 hits of 係數 are copula + 數 (淨係數嘢, 但係數量, 係數學界).
  "係數",
  "二項式係數",
  "勁度係數",
  "基尼係數",
  "堅尼係數",
  // 介係詞 "preposition" (rime; 介系詞 in Taiwan, 介系词 simplified).
  "介係詞",
  // University departments (系), rime words: 外文係 "foreign languages department", 漢學係
  // "sinology department". Not matched as 學係/文係 in text: 香港大學係喺1911年成立.
  "外文係",
  "漢學係",
];

/**
 * Characters whose OpenCC simplified form (hk→cn or tw→cn; the two agree on all of them) lies
 * outside the BMP (above U+FFFF), kept in all text: such forms (嗰 → 𠮶, 餸 → 𩠌, 鮟鱇 → 𩽾𩾌) are
 * rare characters that fonts and input methods often lack, so the traditional form is the safer
 * display. Every code point in the CJK blocks U+2E80–U+2FDF, U+3000–U+9FFF, U+F900–U+FAFF and
 * U+20000–U+3347F was run through OpenCC (opencc-js 1.4.2), so the list covers characters any
 * source may bring, not just today's data; test/merge.simplifiedKeep.test.ts re-derives it and
 * fails when an OpenCC update changes it. 145 of them are themselves outside the BMP (𠁞 → 𠀾).
 * The scan includes the CJK Compatibility Ideographs (U+F900–U+FAFF), and 7 entries come from
 * there (U+FA6C, U+FACF–U+FAD1, U+FAD5–U+FAD7). They look like unified ideographs but are distinct
 * code points, not duplicates: their canonical (NFC) equivalents (U+242EE, …) are not in the list.
 * Sorted by code point.
 */
export const NON_BMP_KEEP: readonly string[] = [
  "㗲", "㜢", "㠣", "㺏", "䁪", "䓣", "䡵", "䥕", "䧢", "䮄", "僤", "勣", "嗰", "嚧", "埨", "塸", "塿", "墠", "壗", "娙",
  "孻", "嵽", "巘", "廞", "彄", "晛", "暐", "曥", "朥", "桱", "梜", "橯", "櫍", "欓", "浿", "湋", "漍", "潕", "澫", "濆",
  "灒", "灙", "熰", "燀", "燖", "璊", "璕", "璗", "瓅", "瓛", "睍", "礐", "篢", "篸", "籅", "紃", "紞", "絪", "絺", "綄",
  "綎", "綖", "綝", "綡", "綧", "綪", "縯", "繶", "繻", "纁", "纆", "纕", "膢", "蒍", "蔄", "蔯", "蔿", "蘟", "虉", "蝀",
  "蟳", "襀", "訏", "詀", "詝", "詪", "詷", "諓", "諟", "諲", "諴", "謏", "譓", "譞", "軏", "軝", "輄", "輋", "輗", "輮",
  "輶", "鄩", "鄳", "醲", "釴", "釿", "鈇", "鉊", "鉝", "鉥", "鉧", "鉮", "鉷", "銈", "銶", "鋐", "鋗", "鋹", "錀", "錞",
  "錤", "鍭", "鎓", "鎝", "鏏", "鏻", "鐄", "鐇", "鐍", "鐏", "鐩", "鐽", "鑪", "闉", "闑", "隑", "隤", "隮", "頍", "頔",
  "頠", "頫", "頵", "顗", "餗", "餸", "饘", "馼", "駃", "駉", "駓", "駪", "駼", "騄", "騊", "騑", "騞", "騠", "騱", "騵",
  "驎", "魟", "鮀", "鮆", "鮈", "鮟", "鮠", "鮡", "鮸", "鯻", "鰊", "鰤", "鰶", "鱀", "鱇", "鱚", "鱲", "鵏", "鵟", "鶠",
  "鶱", "鷟", "鷭", "鸑", "麬", "麳", "齘", "齮", "齯", "齼", "𤋮", "𢡊", "𢡄", "𣏕", "𥉉", "𥳐", "𧻓", "𠁞", "𡃕", "𡅏",
  "𡑍", "𡑭", "𡓾", "𡔖", "𡮉", "𡮣", "𡳳", "𢣚", "𢶫", "𢹿", "𣞻", "𣠩", "𣠲", "𤁣", "𤅶", "𤓩", "𤳸", "𥊝", "𥌃", "𥕥",
  "𥖅", "𥗽", "𥸠", "𥼽", "𦘧", "𦣎", "𧟀", "𨤻", "𨧀", "𨨏", "𨭆", "𨭎", "𩠴", "𠄢", "𠘺", "𠔜", "𠕋", "𩇟", "𠨬", "𠭣",
  "𡓤", "𡚨", "𡛪", "𡧈", "𡬘", "𡷤", "𡷦", "𢆃", "𪎒", "𢌱", "𢌱", "𣊸", "𦇚", "𢛔", "𢬌", "𢯱", "𣀊", "𣏃", "𣑭", "𣚣",
  "𣢧", "𣪍", "𡴋", "𣫺", "𣲼", "𣴞", "𣻑", "𣽞", "𣾎", "濆", "𠔥", "𤉣", "𤎫", "𤘈", "𤜵", "𤠔", "𤰶", "𤲒", "𢆟", "𤾡",
  "𤾸", "𥁄", "𥃳", "𥃲", "𥄙", "𥄳", "𥐝", "𥘦", "𥚚", "𥛅", "𥥼", "𥪧", "𥪧", "𥮫", "𥲀", "𥾆", "𦈨", "𦉇", "𦋙", "𦌾",
  "𦓚", "𦔣", "𦖨", "𣍟", "𦞧", "𦞵", "𣎓", "𣎜", "𦬼", "𦰶", "𦵫", "𦳕", "𧏊", "𦼬", "𦾱", "𧃒", "𧙧", "𧢮", "𧥦", "𧲨",
  "𧼯", "𠠄", "𠣞", "𨗒", "𨗭", "𨜮", "鋗", "𨯺", "𨵷", "𩅅", "𩈚", "𩐊", "𩒖", "𩖶", "𩬰", "鱀", "𪃎", "𪄅", "𪈎", "𪊑",
  "𪘀", "𰻞",
];
