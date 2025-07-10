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
  coverageProvider: 'babel',
  coverageDirectory: 'coverage',               // output folder
  coverageReporters: ['text', 'lcov'],         // text = console table, lcov for HTML
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    'prisma/**/*.{js,ts}',
    '__tests__/**/*.{js,ts}',
    '!**/node_modules/**',
    '!**/__mocks__/**'
  ],
  "coverageThreshold": {
    "global": {
      "branches": 44,
      "functions": 80,
      "lines": 75,
      "statements": 75
    }
  },

  // === SILENT MODE ===
  verbose: false,
  silent: true,
  reporters: ['default']
};