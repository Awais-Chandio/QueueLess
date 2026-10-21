// Only used to detect the Jest runtime (JEST_WORKER_ID). App config such as
// Supabase keys comes from react-native-config, not process.env.
declare const process: {
  env: Record<string, string | undefined>;
};

declare module 'react-native-chart-kit';
