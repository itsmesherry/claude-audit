import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/reporters/**',
  ],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 95,
      lines: 90,
      statements: 90,
    },
  },
};

export default config;
