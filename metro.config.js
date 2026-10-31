// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const { EXTRA_ASSET_EXTS } = require("./assetExts");

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push(...EXTRA_ASSET_EXTS);

module.exports = config;
