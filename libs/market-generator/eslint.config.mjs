import baseConfig from '../../eslint.config.mjs';

// AssemblyScript-flavored sources: parse and lint only, no type-aware rules,
// and the sources stay outside the application's TypeScript program
// (excluded in the root tsconfig.base.json).
export default [
  ...baseConfig,
  {
    files: ['**/*.ts'],
    rules: {},
  },
];
