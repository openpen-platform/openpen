import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Only lint src/; electron/, tests/, and packages/ are not covered yet.
  { ignores: ['dist/**', 'release/**', 'electron/**', 'tests/**', 'packages/**'] },

  js.configs.recommended,

  // TypeScript recommended rules (error-level only).
  ...tseslint.configs.recommended,

  // Vue SFC rules — flat/essential, no stylistic opinions.
  ...pluginVue.configs['flat/essential'],

  {
    files: ['src/**/*.vue'],
    languageOptions: {
      parserOptions: {
        // vue-eslint-parser handles .vue files; delegate <script> to TypeScript parser
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
  },

  {
    files: ['src/**/*.{ts,vue}'],
    rules: {
      // TypeScript: catch common mistakes; `any` allowed but warned.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_$', varsIgnorePattern: '^_$' }],
      '@typescript-eslint/no-require-imports': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Identifier[name=/^_[A-Za-z][A-Za-z0-9_]*$/]',
          message: 'Avoid leading underscore identifiers. Use camelCase; reserve "_" only for intentionally unused parameters.',
        },
      ],

      // Vue: structural errors only, no stylistic opinions.
      'vue/no-unused-components': 'error',
      'vue/no-unused-vars': 'error',
      'vue/multi-word-component-names': 'off', // single-word component names are fine in this project
      'vue/require-default-prop': 'off',       // TypeScript handles this
      'vue/no-mutating-props': 'off',          // mutating a passed `draft` object is intentional
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',

      // Disable JS rules that duplicate TypeScript coverage.
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
)
