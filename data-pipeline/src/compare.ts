/** Orders strings by UTF-16 code unit: deterministic, unlike localeCompare. Use as a sort comparator. */
export const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
