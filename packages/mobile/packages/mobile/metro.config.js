const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Watch the shared package source
config.watchFolders = [
  path.resolve(__dirname, '../../packages/shared/src'),
];

// Resolve @wechat-clone/shared to the local source
config.resolver.extraNodeModules = {
  '@wechat-clone/shared': path.resolve(__dirname, '../../packages/shared/src'),
};

// Ensure node_modules in the workspace root are found
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '../../node_modules'),
];

module.exports = config;
