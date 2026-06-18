// Mock for expo module used in Jest tests

// Factory to create a mock native module with configurable methods
function createMockNativeModule(methods = {}) {
  return methods;
}

module.exports = {
  requireOptionalNativeModule: jest.fn((moduleName) => {
    // Return null by default (module not available)
    return null;
  }),
};