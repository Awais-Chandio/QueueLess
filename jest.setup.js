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
  };

  return {
    __esModule: true,
    default: animated,
    Easing: {
      ease: passthrough,
      linear: passthrough,
      out: passthrough,
      inOut: passthrough,
    },
    useAnimatedStyle: updater => (typeof updater === 'function' ? updater() : {}),
    useSharedValue: value => ({ value }),
    withDelay: (_delay, value) => value,
    withRepeat: value => value,
    withSequence: (...values) => values[values.length - 1],
    withTiming: value => value,
  };
});

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
}));
