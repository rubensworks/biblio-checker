module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': [ 'ts-jest', {
      tsconfig: {
        module: 'CommonJS',
        moduleResolution: 'Node',
        verbatimModuleSyntax: false,
        isolatedModules: false,
      },
    }],
  },
  testMatch: [ '<rootDir>/test/**/*.test.ts' ],
  collectCoverageFrom: [ 'src/lib/**/*.ts' ],
};
