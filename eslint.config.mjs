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
  unicorn.configs.recommended,
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

      // Preserve the project's naming and explicit control-flow style during tool upgrades.
      'unicorn/consistent-boolean-name': 'off',
      'unicorn/consistent-class-member-order': 'off',
      'unicorn/name-replacements': 'off',
      'unicorn/no-break-in-nested-loop': 'off',
      'unicorn/no-computed-property-existence-check': 'off',
      'unicorn/no-declarations-before-early-exit': 'off',
      'unicorn/no-negated-array-predicate': 'off',
      'unicorn/no-return-array-push': 'off',
      'unicorn/no-unnecessary-global-this': 'off',
      'unicorn/no-unreadable-for-of-expression': 'off',
      'unicorn/prefer-await': 'off',
      'unicorn/prefer-boolean-return': 'off',
      'unicorn/prefer-combined-guards': 'off',
      'unicorn/prefer-dom-node-replace-children': 'off',
      'unicorn/prefer-early-return': 'off',
      'unicorn/prefer-else-if': 'off',
      'unicorn/prefer-minimal-ternary': 'off',
      'unicorn/prefer-number-coercion': 'off',
      'unicorn/prefer-number-is-safe-integer': 'off',
      'unicorn/prefer-scoped-selector': 'off',
      'unicorn/prefer-simple-condition-first': 'off',
      'unicorn/prefer-split-limit': 'off',
      'unicorn/prefer-ternary': 'off',
      'unicorn/prefer-then-catch': 'off',
      'unicorn/require-array-sort-compare': 'off',
      'unicorn/single-line-block-comment-style': 'off',

      // Editor modules initialize parser rules and session state; Mocha initializes hooks.
      'unicorn/no-top-level-assignment-in-function': 'off',
      'unicorn/no-top-level-side-effects': 'off',

      // VS Code 1.85.2's extension host does not support iterator helpers.
      'unicorn/prefer-iterator-to-array': 'off',
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
