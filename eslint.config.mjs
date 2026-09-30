import js from '@eslint/js';
import globals from 'globals';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import unicorn from 'eslint-plugin-unicorn';

export default [
  {
    ignores: ['out/**', 'dist/**', 'coverage/**', 'node_modules/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tsPlugin.configs['flat/recommended'],
  unicorn.configs['flat/recommended'],
  {
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'unicorn/filename-case': ['error', { case: 'kebabCase' }],
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      'unicorn/prefer-module': 'off',
    },
  },
  {
    // The SVG namespace is a fixed HTTP URI, not a web request.
    files: ['src/webview/editor/preview.ts', 'tests/unit/preview.test.ts'],
    rules: {
      'unicorn/prefer-https': 'off',
    },
  },
  {
    // ProseMirror and Mocha provide `this` in their callback contracts.
    files: ['src/webview/editor/document-navigation.ts', 'tests/unit/editor-behavior.test.ts'],
    rules: {
      'unicorn/no-this-outside-of-class': 'off',
    },
  },
];
