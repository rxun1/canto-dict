/** A problem found in a source file, tied to its 1-based line number. */
export interface Problem {
  readonly line: number;
  readonly message: string;
}

export const MAX_REPORTED_PROBLEMS = 20;

export function formatProblems(source: string, problems: readonly Problem[]): string {
  const shown = problems
    .slice(0, MAX_REPORTED_PROBLEMS)
    .map((p) => `  line ${p.line}: ${p.message}`);
  const hidden = problems.length - shown.length;
  if (hidden > 0) shown.push(`  … and ${hidden} more`);
  return `${source} has ${problems.length} problem(s):\n${shown.join("\n")}`;
}

export function throwIfProblems(source: string, problems: readonly Problem[]): void {
  if (problems.length > 0) throw new Error(formatProblems(source, problems));
}

/** What a tolerant source parser returns: the rows it kept, plus the row-level problems it skipped. */
export interface Parsed<T> {
  readonly rows: T[];
  readonly skipped: Problem[];
}
