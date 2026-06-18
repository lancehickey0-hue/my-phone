// Mock for @react-native-async-storage/async-storage
const store = new Map();

const AsyncStorage = {
  getItem: jest.fn(async (key) => store.get(key) ?? null),
  setItem: jest.fn(async (key, value) => { store.set(key, value); }),
  removeItem: jest.fn(async (key) => { store.delete(key); }),
  clear: jest.fn(async () => { store.clear(); }),
  getAllKeys: jest.fn(async () => Array.from(store.keys())),
  _store: store,
  _reset: () => store.clear(),
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;