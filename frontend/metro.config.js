const { getDefaultConfig } = require("expo/metro-config");
const path = require('path');
const { FileStore } = require('metro-cache');

const config = getDefaultConfig(__dirname);

// Stable on-disk cache
const root = process.env.METRO_CACHE_ROOT || path.join(__dirname, '.metro-cache');
config.cacheStores = [
  new FileStore({ root: path.join(root, 'cache') }),
];

// Fix ENOSPC: limit what Metro watches
config.watchFolders = [__dirname];
config.resolver.blockList = /node_modules\/.*\/(android|ios|windows|macos|__tests__|\.git)(\/.*)?$/;

// Keep workers low for Termux
config.maxWorkers = 2;

module.exports = config;