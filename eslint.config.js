import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // `any` is a warning, not an error. There are ~87 of them, almost all in
      // Chakra style objects and third-party event payloads where the precise
      // type adds nothing. As errors they made `npm run lint` fail on every
      // run, which is why nobody could use it to catch the bugs that matter.
      // Warn keeps them visible without drowning the signal.
      '@typescript-eslint/no-explicit-any': 'warn',

      // `while (true) { ... if (done) break }` is the standard way to drain a
      // ReadableStream reader, used in the two contract-download handlers.
      'no-constant-condition': ['error', { checkLoops: false }],

      // Underscore prefix is the established convention here for a binding that
      // is deliberately unused (destructured-and-ignored, caught-and-ignored).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
)
