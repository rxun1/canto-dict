import { fileURLToPath } from "node:url";

export const STEPS = ["download", "parse", "merge", "validate", "build"] as const;

export type Step = (typeof STEPS)[number];

export function helpText(): string {
  return [
    "Usage: npm run data:build -- [--help] [--fixture]",
    "",
    "Steps (run in order):",
    ...STEPS.map((step, i) => `  ${i + 1}. ${step}`),
  ].join("\n");
}

export function main(args: string[]): void {
  if (args.includes("--help")) {
    console.log(helpText());
    return;
  }
  if (args.includes("--fixture")) {
    console.log("fixture mode: not implemented yet");
    return;
  }
  for (const step of STEPS) {
    console.log(`${step}: not implemented yet`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
