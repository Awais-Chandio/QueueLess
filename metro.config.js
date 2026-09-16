const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    extraNodeModules: {
      // See src/shims/expo-linear-gradient.ts for why this alias exists.
      'expo-linear-gradient': path.resolve(__dirname, 'src/shims/expo-linear-gradient.ts'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
