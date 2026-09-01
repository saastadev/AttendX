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

      // ---- React 19 compiler rules: kept as warnings, deliberately ----
      //
      // On review most of these are NOT bugs, so failing the build on them
      // would be noise:
      //
      //  set-state-in-effect (10) - reading localStorage / matchMedia in an
      //    effect and then setting state is the correct way to hydrate
      //    client-only state in Next.js. Doing it during render breaks SSR.
      //    The modern alternative is useSyncExternalStore; that is a real
      //    refactor across 10 files, not a fix to bundle into a CI change.
      //
      //  immutability (5) - all are `window.location.href = ...` inside event
      //    handlers. Legitimate navigation; the rule is over-broad here.
      //
      //  no-unescaped-entities (12) - cosmetic (apostrophes in JSX).
      //
      // One genuine bug in this set WAS fixed: hooks/useTheme.tsx registered an
      // OS dark-mode listener with [] deps while reading `contrast`, capturing
      // it forever. Now held in a ref.
      //
      // Review with: npm run lint:strict
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react/no-unescaped-entities': 'warn',
    },
  },
]
