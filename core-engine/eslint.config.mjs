import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'libs/database/src/migrations/**'],
  },
  ...tseslint.configs.recommended,
  {
    // Typed linting applies to TypeScript sources only — config files like this
    // one are not in the tsconfig project.
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Dependency direction: apps → libs, never the reverse.
    // Without this the cycle (domain importing a controller's DTO) is one
    // careless import away. See core-engine/CLAUDE.md.
    files: ['libs/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/apps/*', '**/apps/**', '@core/../apps/**'],
              message:
                'libs must not import from apps. Dependency direction is apps → libs. See core-engine/CLAUDE.md.',
            },
          ],
        },
      ],
    },
  },
  {
    // Domain layers must stay pure: no framework, no I/O, no ORM.
    files: ['libs/*/src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nestjs/*', 'drizzle-orm', 'drizzle-orm/*', 'bullmq', 'ioredis', 'postgres'],
              message:
                'domain/ must be pure TypeScript — no NestJS, no ORM, no I/O. Move this to application/ or infrastructure/.',
            },
          ],
        },
      ],
    },
  },
);
