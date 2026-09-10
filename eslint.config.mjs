import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/**', 'node_modules/**', '_site/**', '.audit-baseline/**'] },
  {
    files: ['src/**/*.ts', 'tests/**/*.mjs', 'tools/**/*.mjs'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    languageOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      'no-constant-binary-expression': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-loss-of-precision': 'error',
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
