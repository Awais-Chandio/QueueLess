/**
 * Bare-React-Native stand-in for `expo-linear-gradient`.
 *
 * `moti/skeleton` — the only skeleton subpath moti lists in its package
 * `exports` map — imports `expo-linear-gradient`. moti does ship a bare-RN
 * variant, but only at an unexported deep path, which makes Metro fall back to
 * file-based resolution and warn on every build. Aliasing the Expo module to
 * react-native-linear-gradient (already a dependency of this app) in
 * metro.config.js lets screens use the canonical `moti/skeleton` import.
 */
export { default as LinearGradient } from 'react-native-linear-gradient';
export { default } from 'react-native-linear-gradient';
