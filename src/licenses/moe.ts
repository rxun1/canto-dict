// The MoE dictionary's credit and usage notes (spec §4.1: Mandarin definitions from 教育部《重編國語辭典修訂本》
// via g0v/moedict-data, CC BY-ND 3.0 TW). The notes require the credit in their format and that anyone using
// the data keep the full notes with it, so the licenses screen shows both.

/**
 * MoE's 版本編號 of the dictionary text canto.db is built from. A copy of MOEDICT_RELEASE in
 * data-pipeline/src/sources/urls.ts (outside the app's tsconfig and Jest); moe.test.ts checks they match.
 */
export const MOEDICT_RELEASE = "2015_20260625";

/**
 * The credit in the usage notes' format (一(三)). A copy of MOEDICT_ATTRIBUTION in
 * data-pipeline/src/sources/moedict.ts; moe.test.ts checks they match.
 */
export const MOEDICT_ATTRIBUTION = `中華民國教育部（Ministry of Education, R.O.C.）。《重編國語辭典修訂本》（版本編號：${MOEDICT_RELEASE}）網址：http://dict.revised.moe.edu.tw/`;

/**
 * 《重編國語辭典修訂本》公眾授權使用說明, verbatim, one string per paragraph. Source: the official MoE
 * 公眾授權網 (https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/index.html), file
 * reviseddict_10312.odt (sha256 ea1086d297ac5a7a795246f088cc49fd950f816ea508ed903fee936c4f8718ef),
 * fetched 2026-11-01. Only trailing spaces at paragraph ends were dropped; the blank in (三) is the
 * notes' own space for the release number.
 */
export const MOE_USAGE_NOTES: readonly string[] = [
  "《重編國語辭典修訂本》公眾授權使用說明",
  "一、授權方式及範圍",
  "(一) 教育部《重編國語辭典修訂本》係受國際著作權公約與中華民國著作權法保護之著作。",
  "(二) 教育部《重編國語辭典修訂本》採用「創用CC－姓名標示－禁止改作 臺灣3.0版授權條款」釋出。此授權條款的內容詳見網址：http://creativecommons.org/licenses/by-nd/3.0/tw/legalcode",
  "(三) 「姓名標示」部分請標示如下：",
  "中華民國教育部（Ministry of Education, R.O.C.）。《重編國語辭典修訂本》（版本編號：                        ）網址： http://dict.revised.moe.edu.tw/",
  "(四) 額外授權聲明：",
  "依本著作權利人中華民國教育部（Ministry of Education, R.O.C.）之聲明，任何使用者皆得依照「創用CC－姓名標示－禁止改作 臺灣3.0版授權條款」的規定，使用《重編國語辭典修訂本》之資料與素材。使用者對於《重編國語辭典修訂本》個別條目的詞目、部首、筆畫、字形、音讀及釋義等內容不得為任何修改，或轉為簡化字。惟依教育部所提供對照表內容作字碼改換，或不涉及更改《重編國語辭典修訂本》個別條目所有內容之調整行為，可不被認定構成上述禁止修改條款之拘束範圍。",
  "二、使用者承諾事項",
  "使用者利用教育部公眾授權之《重編國語辭典修訂本》資料與素材，無論再散布與否，都必須完整保留本使用說明，並確認資料版本訊息；如發現原始內容錯誤或遺漏，應同意無償提供完整資訊予教育部於研究及修訂之參考。",
  "三、停止提供",
  "其有下列情形之一者，教育部得隨時停止提供《重編國語辭典修訂本》資料與素材，民眾不得向教育部請求任何賠償或補償，教育部亦不負任何賠償或補償之責任：",
  "(一) 因政策變更或其他正當事由，致教育部認為繼續提供資料供民眾使用，已不符合公共利益之要求。",
  "(二) 教育部公開之資料與素材有侵害第三人智慧財產權、隱私權或其他權利之疑慮。",
];
