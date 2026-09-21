// VisionCamera throws at import time when its native module is missing, which
// is always the case under Jest. Tests only need the JS surface to resolve.
module.exports = {
  Camera: () => null,
  useCameraDevice: () => undefined,
  useCameraPermission: () => ({
    hasPermission: false,
    requestPermission: jest.fn(() => Promise.resolve(false)),
  }),
  useCodeScanner: () => ({}),
};
