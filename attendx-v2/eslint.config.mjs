import next from 'eslint-config-next'

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'public/**', 'next-env.d.ts', '**/*.py'],
  },
  ...next,
  {
    rules: {
      // Encodes a failure mode this codebase has actually shipped: an auth
      // bypass that returned success from a catch block. Empty catches hide
      // exactly that. Non-negotiable — keep at error.
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],

      // ---- EXISTING DEBT (27 violations at the time this linter landed) ----
      // Downgraded to warn so CI can go green today WITHOUT hiding them.
      // These are real bugs, not style nits — set-state-in-effect can cause
      // render loops, and immutability violations cause stale-state bugs.
      // Drive these to zero, then promote each back to 'error'.
      // Track with: npm run lint:strict
      //   react-hooks/set-state-in-effect .. 10
      //   react/no-unescaped-entities ...... 12
      //   react-hooks/immutability .........  5
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react/no-unescaped-entities': 'warn',
    },
  },
]
