// Mock for react-native used in Jest tests
const Platform = {
  OS: 'android',
  select: jest.fn((obj) => obj.android ?? obj.default),
  Version: 26,
};

module.exports = {
  Platform,
  NativeModules: {},
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    removeAllListeners: jest.fn(),
  })),
};