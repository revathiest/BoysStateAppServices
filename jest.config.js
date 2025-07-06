module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
  roots: ['<rootDir>/__tests__'],
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  moduleDirectories: ['node_modules', '<rootDir>'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  },

  // === COVERAGE SETTINGS ===
  collectCoverage: true,                        // always gather coverage
  coverageDirectory: 'coverage',               // output folder
  coverageReporters: ['text', 'lcov'],         // text = console table, lcov for HTML
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    'prisma/**/*.{js,ts}',
    '!**/node_modules/**',
    '!**/__mocks__/**'
  ],
  "coverageThreshold": {
    "global": {
      "branches": 65,
      "functions": 80,
      "lines": 80,
      "statements": 80
    }
  },

  // === SILENT MODE ===
  verbose: false,
  silent: true,
  reporters: ['default']
};