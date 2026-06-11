import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Only lint src/; electron/, tests/, and packages/ are not covered yet.
  { ignores: ['dist/**', 'release/**', 'electron/**', 'packages/**'] },

  js.configs.recommended,

  // TypeScript recommended rules (error-level only).
  ...tseslint.configs.recommended,

  // Vue SFC rules — flat/essential, no stylistic opinions.
  ...pluginVue.configs['flat/essential'],

  // tests/ — class-selector gate: locator('.'), querySelector('.'), wrapper.find('.')
  // are forbidden as interaction selectors; use data-testid instead.
  // Whitelist: toHaveClass / not.toHaveClass are pure state assertions, not selectors.
  {
    files: ['tests/**/*.{js,ts}'],
    languageOptions: {
      globals: {
        // Browser globals (Playwright evaluate callbacks run in renderer context)
        document: 'readonly',
        window: 'readonly',
        MouseEvent: 'readonly',
        PointerEvent: 'readonly',
        getComputedStyle: 'readonly',
        navigator: 'readonly',
        // Test framework globals
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
      },
    },
    rules: {
      // Environment-specific rules not applicable to test files
      'no-undef': 'off',
      'no-empty': 'off',
      'no-empty-pattern': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      // Class-selector gate.
      //
      // Two layers of coverage:
      //   1. Query-callee form — any wrapper/page query (find, findAll, get,
      //      getAll, locator, querySelector(All), waitForSelector, click, $, $$,
      //      waitForFunction) whose first argument is a string-literal class
      //      selector. The value regex matches BOTH a leading-dot selector
      //      (`.diag-row`) AND a compound `tag.class` / `[attr].class` / descendant
      //      `parent .child` selector (`button.app-seg-btn`,
      //      `[data-testid="x"].vbar-free`, `... .child`) that does not start with
      //      a dot. At a query call site any dotted token is a selector, so the
      //      compound branch is safe here.
      //   2. Variable form — a leading-dot string literal assigned to / declared as
      //      a variable that could be routed into a query call by Identifier (the
      //      indirection the call-site literal rules miss, e.g. `const s = '.tab'`).
      //      Restricted to the leading-dot shape so URLs / filenames / dotted
      //      identifiers (`report.spec.js`, `a.b`) are never false-flagged.
      //
      // Whitelist: toHaveClass / not.toHaveClass and classList.contains are pure
      // state assertions, not query selectors, and never take a leading-dot/compound
      // class selector here.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name=/^(find|findAll|get|getAll|locator|querySelector|querySelectorAll|waitForSelector|click|waitForFunction)$/][arguments.0.type='Literal'][arguments.0.value=/(^\\s*\\.[a-zA-Z])|([a-zA-Z0-9\\])]\\.[a-zA-Z][\\w-]*)|(\\s\\.[a-zA-Z])/]",
          message:
            "CSS class selectors are forbidden in tests (including compound `tag.class` and descendant `.child` selectors). Use data-testid selectors instead: getByTestId('...') or locator('[data-testid=\"...\"]'). Exception: toHaveClass/not.toHaveClass are allowed for state assertions.",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(\\$|\\$\\$)$/][arguments.0.type='Literal'][arguments.0.value=/(^\\s*\\.[a-zA-Z])|([a-zA-Z0-9\\])]\\.[a-zA-Z][\\w-]*)|(\\s\\.[a-zA-Z])/]",
          message:
            "CSS class selectors are forbidden in tests (including compound `tag.class` and descendant `.child` selectors). Use data-testid selectors instead.",
        },
        {
          selector:
            "VariableDeclarator[init.type='Literal'][init.value=/^\\s*\\.[a-zA-Z][\\w-]*(\\s|\\.|\\[|:|,|$)/]",
          message:
            "CSS class selector stored in a variable is forbidden in tests; routing a class selector through an Identifier does not bypass the gate. Use a data-testid selector instead.",
        },
        {
          selector:
            "AssignmentExpression[right.type='Literal'][right.value=/^\\s*\\.[a-zA-Z][\\w-]*(\\s|\\.|\\[|:|,|$)/]",
          message:
            "CSS class selector stored in a variable is forbidden in tests; routing a class selector through an Identifier does not bypass the gate. Use a data-testid selector instead.",
        },
      ],
    },
  },

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
