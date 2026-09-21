/* eslint-env jest */

const mockAsyncStorage = {
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
};

global.window = global.window || {};
global.window.dispatchEvent = global.window.dispatchEvent || jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

jest.mock('react-native-reanimated', () => {
  const ReactNative = require('react-native');
  const passthrough = value => value;
  const animated = {
    View: ReactNative.View,
    Text: ReactNative.Text,
    Image: ReactNative.Image,
    ScrollView: ReactNative.ScrollView,
    FlatList: ReactNative.FlatList,
    SectionList: ReactNative.SectionList,
    createAnimatedComponent: component => component,
    // @gorhom/bottom-sheet registers its own UI props at import time.
    addWhitelistedUIProps: jest.fn(),
    addWhitelistedNativeProps: jest.fn(),
  };

  return {
    __esModule: true,
    default: animated,
    Easing: {
      ease: passthrough,
      linear: passthrough,
      out: passthrough,
      inOut: passthrough,
      bezier: () => passthrough,
    },
    // Reduce-motion is reported as off so animated components take their normal
    // path under test; the reduced path is asserted separately where it matters.
    useReducedMotion: () => false,
    ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
    useAnimatedStyle: updater => (typeof updater === 'function' ? updater() : {}),
    useAnimatedProps: updater => (typeof updater === 'function' ? updater() : {}),
    useAnimatedRef: () => ({ current: null }),
    useAnimatedReaction: jest.fn(),
    useAnimatedScrollHandler: () => jest.fn(),
    useDerivedValue: updater => ({
      value: typeof updater === 'function' ? updater() : updater,
    }),
    useSharedValue: value => ({ value }),
    makeMutable: value => ({ value }),
    cancelAnimation: jest.fn(),
    measure: () => null,
    scrollTo: jest.fn(),
    runOnJS: fn => fn,
    runOnUI: fn => fn,
    interpolate: value => value,
    interpolateColor: () => 'transparent',
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    Extrapolate: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    withDelay: (_delay, value) => value,
    withRepeat: value => value,
    withSequence: (...values) => values[values.length - 1],
    withSpring: value => value,
    withTiming: value => value,
    withDecay: value => value,
    FadeIn: { duration: () => ({}) },
    FadeOut: { duration: () => ({}) },
    Layout: { duration: () => ({}) },
  };
});

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
}));

jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MapComponent = ({ children, ...props }) =>
    React.createElement(View, props, children);

  return {
    Map: MapComponent,
    Camera: React.forwardRef((_props, _ref) => null),
    GeoJSONSource: MapComponent,
    Layer: () => null,
  };
});

jest.mock('react-native-geolocation-service', () => ({
  requestAuthorization: jest.fn(() => Promise.resolve('granted')),
  getCurrentPosition: jest.fn(),
  watchPosition: jest.fn(() => 1),
  clearWatch: jest.fn(),
  stopObserving: jest.fn(),
}));

jest.mock('@react-native-firebase/app', () => ({
  initializeApp: jest.fn(),
}));

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  signInWithPhoneNumber: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: jest.fn(() => ({})),
  requestPermission: jest.fn(() => Promise.resolve(1)),
  getToken: jest.fn(() => Promise.resolve('mock-fcm-token')),
  deleteToken: jest.fn(() => Promise.resolve()),
  onTokenRefresh: jest.fn(() => jest.fn()),
  onMessage: jest.fn(() => jest.fn()),
  onNotificationOpenedApp: jest.fn(() => jest.fn()),
  getInitialNotification: jest.fn(() => Promise.resolve(null)),
  setBackgroundMessageHandler: jest.fn(),
  AuthorizationStatus: {
    NOT_DETERMINED: -1,
    DENIED: 0,
    AUTHORIZED: 1,
    PROVISIONAL: 2,
  },
}));
