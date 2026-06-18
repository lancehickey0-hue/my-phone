/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleNameMapper: {
    // Mock react-native
    '^react-native$': '<rootDir>/__mocks__/react-native.js',
    // Mock expo modules
    '^expo$': '<rootDir>/__mocks__/expo.js',
    '^expo-constants$': '<rootDir>/__mocks__/expo-constants.js',
    '^expo-crypto$': '<rootDir>/__mocks__/expo-crypto.js',
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/__mocks__/@react-native-async-storage/async-storage.js',
    // Map absolute paths
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react' } }],
  },
  globals: {},
};