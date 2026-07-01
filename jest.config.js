module.exports = {
  preset: 'react-native',
  setupFiles: ['./jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-gesture-handler|react-native-safe-area-context|react-native-screens|react-native-url-polyfill|react-native-chart-kit|react-native-linear-gradient|react-native-inappbrowser-reborn|react-native-reanimated|react-native-worklets|@supabase|@react-native-async-storage|@react-native-community/datetimepicker)/)',
  ],
};
