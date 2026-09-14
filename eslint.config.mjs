import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        // tests/ has its own tsconfig (bun types, noEmit) — both projects
        // are listed so typed linting covers test files too.
        project: ['./tsconfig.json', './tests/tsconfig.json'],
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Empty blocks anywhere else (if/for/while). Catch clauses are excluded
      // here and handled by the selector below, so each empty catch reports
      // once rather than through two rules.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // Issue #198: ban the bare `catch {}`. A catch with no statement records
      // nothing about what was expected, so the next reader cannot tell a
      // deliberate decision from an oversight.
      //
      // `no-empty` with allowEmptyCatch:false is NOT sufficient. It treats a
      // block holding only a comment as non-empty, so `catch { // ignore }`
      // passes it, and that was the exact shape of most of the sites #196
      // removed. Matching on `body.length === 0` tests the AST, where comments
      // are not body nodes, so the comment-only form is caught too.
      //
      // This is the mechanical case only. A catch that logs nothing but returns
      // a neutral value (`return null`) still passes, and that class is policed
      // by review. See docs/development/error-handling.md.
      'no-restricted-syntax': ['error', {
        selector: 'CatchClause > BlockStatement[body.length=0]',
        message:
          'Empty catch block. Name the error you expect (err.code === \'ENOENT\') and ' +
          're-throw or debug() anything else. A comment is not a statement. ' +
          'See docs/development/error-handling.md.',
      }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // Disabled: Non-null assertions are intentional for YouTube API responses.
      // Properties are validated before access (e.g., checking items.length > 0).
      // Google APIs use optional types extensively; assertions improve readability.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    ignores: ['node_modules/', 'dist/', 'build/'],
  },
];
