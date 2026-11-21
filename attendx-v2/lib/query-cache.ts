// Saved data cache: what each signed-in user last saw, kept on their device so
// screens open instantly after a reload or app restart and refresh quietly in
// the background. One entry per user; every sign-out wipes all of them.

/** localStorage key prefix; the user's id follows it. */
export const QUERY_CACHE_PREFIX = 'attendx-cache:'

/** How long saved data may be shown before it is thrown away unseen. */
export const QUERY_CACHE_MAX_AGE = 24 * 60 * 60 * 1000

/** Changes with every deploy, so a new build never reads an old build's data. */
export const QUERY_CACHE_BUSTER = process.env.NEXT_PUBLIC_BUILD_ID || 'dev'

/** Removes every user's saved data from this device (called on sign-out). */
export function clearPersistedQueryCache() {
  if (typeof window === 'undefined') return
  try {
    const storage = window.localStorage
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i)
      if (key?.startsWith(QUERY_CACHE_PREFIX)) storage.removeItem(key)
    }
  } catch {
    // Storage blocked (private mode, disabled site data): nothing was saved.
  }
}
