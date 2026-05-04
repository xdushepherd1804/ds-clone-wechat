const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Resolve @wechat-clone/shared to local shared-src (included in EAS archive)
// Also resolve @/ aliases to ./src/ for EAS build environment
config.resolver.extraNodeModules = {
  '@wechat-clone/shared': path.resolve(__dirname, 'shared-src'),
  '@': path.resolve(__dirname, 'src'),
};

module.exports = config;
