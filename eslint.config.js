import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

const DASHBOARDS = ['sales', 'prices', 'billing', 'dispatch'];

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Node-side config files.
    files: ['*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Vendored shadcn primitives export variant objects alongside components by design.
    // Manifests (index.ts) export plain data next to nothing renderable.
    files: ['src/shared/components/ui/**/*.{ts,tsx}', 'src/dashboards/*/index.ts'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Shared code must not depend on any dashboard.
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@/dashboards/*', '@/app/*'], message: 'shared/ must not import dashboards or app code.' }] },
      ],
    },
  },
  // A dashboard may import shared/ and itself — never another dashboard. Keeps each one
  // independently removable and its chunk free of the others' code.
  ...DASHBOARDS.map((id) => ({
    files: [`src/dashboards/${id}/**/*.{ts,tsx,js,jsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: DASHBOARDS.filter((d) => d !== id).map((d) => `@/dashboards/${d}/**`).concat(
                DASHBOARDS.filter((d) => d !== id).map((d) => `@/dashboards/${d}`),
                ['@/app/*'],
              ),
              message: 'Dashboards must not import each other or app/. Move shared code to src/shared/.',
            },
          ],
        },
      ],
    },
  })),
]);
