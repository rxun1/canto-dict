// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
// canto.db ships as an asset; SQLiteProvider copies it into the app's documents on first launch.
config.resolver.assetExts.push("db");

module.exports = config;
