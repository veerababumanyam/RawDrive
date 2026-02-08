const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project root (monorepo root)
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo
config.watchFolders = [monorepoRoot];

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Force Metro to resolve (sub)dependencies only from the project's node_modules
config.resolver.disableHierarchicalLookup = true;

// 4. Enable source extensions for TypeScript
config.resolver.sourceExts = ['js', 'jsx', 'json', 'ts', 'tsx', 'cjs', 'mjs'];

// 5. Enable SVG transformer
config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer');

// 6. Asset extensions (exclude SVG since it's handled by the transformer)
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg');
config.resolver.sourceExts.push('svg');

module.exports = config;
