/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  // data-pipeline has its own package and runs under vitest; it shares src/jyutping, whose tests run here too.
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/data-pipeline/"],
  modulePathIgnorePatterns: ["<rootDir>/data-pipeline/"],
};
