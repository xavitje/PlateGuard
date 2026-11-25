import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Layering in the API (presentation -> business -> data), enforced here:
 *  - controllers may not touch the database or repositories,
 *  - services may not touch the database client directly (types are fine),
 *  - only src/integrations knows adapter brands.
 */
const noDbInControllers = {
  files: ['apps/api/src/**/*.controller.ts'],
  rules: {
    '@typescript-eslint/no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@plateguard/db', '@prisma/client'],
            message: 'Controllers do not talk to the database. Call a service.',
          },
          {
            group: ['**/*.repository.js', '**/*.repository'],
            message: 'Controllers call services, not repositories.',
          },
          {
            group: ['**/prisma.service.js'],
            message: 'Controllers call services, not the database.',
          },
        ],
      },
    ],
  },
};

const noDbClientInServices = {
  files: ['apps/api/src/**/*.service.ts'],
  // PrismaService is the data layer's connection holder, not a business service.
  ignores: ['apps/api/src/common/prisma.service.ts'],
  rules: {
    '@typescript-eslint/no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@plateguard/db', '@prisma/client'],
            allowTypeImports: true,
            message: 'Services use repositories for data.',
          },
          { group: ['**/prisma.service.js'], message: 'Services use repositories for data.' },
        ],
      },
    ],
  },
};

const noBrandsOutsideIntegrations = {
  files: ['apps/api/src/**/*.ts'],
  ignores: ['apps/api/src/integrations/**'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/integrations/adapters/**'],
            message: 'Only the integrations module knows adapter brands.',
          },
        ],
      },
    ],
  },
};

/** The engine stays pure: no I/O, no clock, no framework. */
const pureDomain = {
  files: ['packages/domain/src/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [
              'node:*',
              'fs',
              'http',
              'https',
              'net',
              '@prisma/*',
              '@nestjs/*',
              'react',
              'react-*',
            ],
            message: 'The engine is pure: no I/O or framework.',
          },
        ],
      },
    ],
    'no-restricted-globals': ['error', 'fetch', 'Date', 'localStorage', 'process'],
  },
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dev-dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'packages/i18n/src/resources.generated.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node }, ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Nest injects by the class at runtime: constructor parameter types must stay value imports.
    files: ['apps/api/src/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
  noDbInControllers,
  noDbClientInServices,
  noBrandsOutsideIntegrations,
  pureDomain,
);
