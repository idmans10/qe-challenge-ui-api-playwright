import js from '@eslint/js';
import playwright from 'eslint-plugin-playwright';

export default [
  { ignores: ['node_modules/', 'test-results/', 'playwright-report/', 'blob-report/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly' },
    },
  },
  {
    ...playwright.configs['flat/recommended'],
    files: ['tests/**/*.js', 'src/**/*.js'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-wait-for-selector': 'error',
      'playwright/no-networkidle': 'error',
      'playwright/no-force-option': 'error',
      'playwright/no-focused-test': 'error',
      'playwright/no-skipped-test': 'error',
      'playwright/no-conditional-in-test': 'error',
    },
  },
];
