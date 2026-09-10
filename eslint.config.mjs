import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/**', 'node_modules/**', '_site/**', '.audit-baseline/**'] },
  {
    files: ['src/**/*.ts', 'tests/**/*.mjs', 'tools/**/*.mjs'],
    languageOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'no-unexpected-multiline': 'error',
      'valid-typeof': 'error',
      'object-shorthand': ['error', 'always'],
      eqeqeq: ['error', 'always'],
    },
  },
];
