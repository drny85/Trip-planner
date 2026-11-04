// Expo's Metro config handles pnpm workspaces automatically:
// https://docs.expo.dev/guides/monorepos/  Uniwind: https://docs.uniwind.dev/
const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

const config = getDefaultConfig(__dirname);

// withUniwindConfig must be the outermost wrapper.
module.exports = withUniwindConfig(config, {
  cssEntryFile: "./global.css",
  dtsFile: "./src/uniwind-types.d.ts",
});
