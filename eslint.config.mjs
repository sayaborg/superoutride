import tseslint from 'typescript-eslint';

const files = ['src/**/*.ts', 'tests/**/*.mjs', 'tools/**/*.ts', 'tools/**/*.mts', 'tools/**/*.mjs'];

export default [
  { ignores: ['dist/**', 'node_modules/**', '_site/**'] },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files })),
  {
    files,
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
      'no-constant-binary-expression': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-loss-of-precision': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-fallthrough': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'no-unexpected-multiline': 'error',
      'valid-typeof': 'error',
      'object-shorthand': ['error', 'always'],
      eqeqeq: ['error', 'always'],
    },
  },
];
