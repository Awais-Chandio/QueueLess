module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      // App code logs through src/utils/logger (silent in production builds).
      files: ['src/**/*.{ts,tsx,js}', 'App.tsx', 'index.js'],
      rules: { 'no-console': 'error' },
    },
  ],
};
