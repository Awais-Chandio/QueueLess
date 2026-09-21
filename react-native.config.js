/**
 * React Native CLI configuration.
 *
 * `assets` is consumed by `npx react-native-asset`, which copies the Inter
 * TTFs into android/app/src/main/assets/fonts and registers them in the iOS
 * project's UIAppFonts. Re-run that command after adding or removing a font.
 */
module.exports = {
  project: {
    ios: {},
    android: {},
  },
  assets: ['./src/assets/fonts'],
};
