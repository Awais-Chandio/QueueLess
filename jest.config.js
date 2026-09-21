module.exports = {
  preset: 'react-native',
  setupFiles: [
    // Registers the RNGestureHandlerModule TurboModule mock. App.tsx mounts a
    // real GestureHandlerRootView, which @gorhom/bottom-sheet requires, and
    // that fails to resolve without this.
    './node_modules/react-native-gesture-handler/jestSetup.js',
    './jest.setup.js',
  ],
  moduleNameMapper: {
    // Mirrors the Metro alias in metro.config.js so `moti/skeleton` resolves
    // under Jest too. See src/shims/expo-linear-gradient.ts.
    '^expo-linear-gradient$': '<rootDir>/src/shims/expo-linear-gradient.ts',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-native-firebase|@react-navigation|react-native-gesture-handler|react-native-safe-area-context|react-native-screens|react-native-url-polyfill|react-native-chart-kit|react-native-linear-gradient|react-native-inappbrowser-reborn|react-native-reanimated|react-native-worklets|@supabase|@react-native-async-storage|@react-native-community/datetimepicker|react-native-toast-message|moti|@motify|@gorhom/bottom-sheet|lottie-react-native|react-native-haptic-feedback)/)',
  ],
};
