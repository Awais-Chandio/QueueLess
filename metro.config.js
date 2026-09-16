const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const rootNodeModules = path.resolve(__dirname, 'node_modules');

const config = {
  resolver: {
    extraNodeModules: {
      // See src/shims/expo-linear-gradient.ts for why this alias exists.
      'expo-linear-gradient': path.resolve(__dirname, 'src/shims/expo-linear-gradient.ts'),
    },
    // Force every `react` (and `react/*`, e.g. react/jsx-runtime) import to
    // resolve to the single root copy. extraNodeModules alone is NOT enough:
    // it's only a fallback Metro uses when normal upward node_modules
    // resolution fails, and nested copies like
    // moti/node_modules/react (pulled in transitively via framer-motion,
    // whose react peer range doesn't match ours) get found first by that
    // normal walk. A duplicate React instance means hooks called from
    // moti's Skeleton get a null dispatcher -> "Invalid hook call" /
    // "Cannot read property 'useContext' of null".
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'react' || moduleName.startsWith('react/')) {
        return {
          type: 'sourceFile',
          filePath: require.resolve(moduleName, { paths: [rootNodeModules] }),
        };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
