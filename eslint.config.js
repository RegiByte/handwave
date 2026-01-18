//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'
import { defineConfig, globalIgnores } from 'eslint/config'
import noRelativeImportPaths from 'eslint-plugin-no-relative-import-paths'

export default [
  ...tanstackConfig,
  // importPlugin.flatConfigs.recommended,
  globalIgnores(['.regibyte']),
  {
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', args: 'none' }],
      'react-refresh/only-export-components': 'off',
      'no-explicit-any': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-fallthrough': 'off',
      'consistent-type-imports': 'off',
      '@typescript-eslint/no-unused-vars': [
        'off',
        { argsIgnorePattern: '^_', args: 'none' },
      ],
      'import/order': [
        'error',
        {
          groups: [['builtin', 'external'], 'parent', 'sibling', 'index'],
        },
      ],
    },
  },
  {
    plugins: {
      'no-relative-import-paths': noRelativeImportPaths,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*'],
              message: 'Use alias imports (@/) instead of relative imports.',
            },
          ],
        },
      ],
      'no-relative-import-paths/no-relative-import-paths': [
        'error',
        { allowSameFolder: true, rootDir: 'src', prefix: '@' },
      ],
    },
  },
]
