// The saved data cache must vanish on sign-out (every user's entry), and must
// leave other site data alone.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clearPersistedQueryCache, QUERY_CACHE_PREFIX } from '../lib/query-cache.ts'

function fakeStorage(initial) {
  const data = new Map(Object.entries(initial))
  return {
    get length() { return data.size },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    keys: () => [...data.keys()],
  }
}

test('clearPersistedQueryCache removes every user cache and nothing else', () => {
  const storage = fakeStorage({
    [`${QUERY_CACHE_PREFIX}user-a`]: '{}',
    [`${QUERY_CACHE_PREFIX}user-b`]: '{}',
    'attendx-theme': 'dark',
  })
  globalThis.window = { localStorage: storage }
  try {
    clearPersistedQueryCache()
    assert.deepEqual(storage.keys(), ['attendx-theme'])
  } finally {
    delete globalThis.window
  }
})

test('clearPersistedQueryCache is safe when storage is blocked', () => {
  globalThis.window = { get localStorage() { throw new Error('blocked') } }
  try {
    assert.doesNotThrow(() => clearPersistedQueryCache())
  } finally {
    delete globalThis.window
  }
})
