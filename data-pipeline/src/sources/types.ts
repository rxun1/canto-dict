export type ReadingRank = "default" | "common" | "rare" | "obsolete";

export interface CharReading {
  char: string;
  jyutping: string;
  rank?: ReadingRank;
}
