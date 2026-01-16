//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
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
]
