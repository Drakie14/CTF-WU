// @ts-check
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';

export default defineConfig(
  {
    ignores: ['dist/', 'dist-fixtures/', '.astro/', 'node_modules/', 'fixtures/', '.cache/', 'public/admin/', '.lighthouseci/'],
  },
  tseslint.configs.recommended,
  astro.configs.recommended,
);
