const { EXTRA_ASSET_EXTS } = require("./assetExts");

/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  // Required assets load as stubs, as Metro's would (jest-expo already covers its default types).
  transform: {
    [`^.+\\.(${EXTRA_ASSET_EXTS.join("|")})$`]: require.resolve("jest-expo/src/preset/assetFileTransformer.js"),
  },
  // data-pipeline has its own package and runs under vitest; it shares src/jyutping, whose tests run here too.
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/data-pipeline/"],
  modulePathIgnorePatterns: ["<rootDir>/data-pipeline/"],
};
