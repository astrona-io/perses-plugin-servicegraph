// Standalone version of the config `percli plugin generate` writes (it imports ../jest.shared from the
// perses/plugins monorepo, which does not exist outside it). Plain CommonJS so Jest needs no ts-node.
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  transform: { '^.+\\.(ts|tsx|js|jsx)$': '@swc/jest' },
  setupFilesAfterEnv: ['<rootDir>/src/setup-tests.ts'],
};
