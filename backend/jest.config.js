module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  testTimeout: 10000,
  // Giới hạn worker: mỗi suite tự bật mongodb-memory-server, chạy quá nhiều song song gây timeout chập chờn
  maxWorkers: 2,
  verbose: true,
  globalTeardown: '<rootDir>/tests/globalTeardown.js',
  moduleNameMapper: {
    // dateformat is pure-ESM (type: "module"); map it to a CJS shim so Jest can load index.js
    '^dateformat$': '<rootDir>/__mocks__/dateformat.js',
  },
};
