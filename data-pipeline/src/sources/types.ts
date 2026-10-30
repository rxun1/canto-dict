export type ReadingRank = "default" | "common" | "rare" | "obsolete";

export interface CharReading {
  readonly char: string;
  readonly jyutping: string;
  readonly rank?: ReadingRank;
}
