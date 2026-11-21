'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { persistQueryClient } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { useAuthStore } from '@/store/auth.store'
import {
  QUERY_CACHE_BUSTER,
  QUERY_CACHE_MAX_AGE,
  QUERY_CACHE_PREFIX,
} from '@/lib/query-cache'

/**
 * Saves the signed-in user's data cache on the device and restores it on the
 * next visit, so pages show the last data at once instead of loading again.
 * Restored data still counts as stale, so each screen refreshes it in the
 * background. Keyed by user id: one person never sees another's data.
 */
export function PersistedQueryCache() {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)

  useEffect(() => {
    if (!userId) return
    let storage: Storage
    try {
      storage = window.localStorage
    } catch {
      return
    }
    const persister = createSyncStoragePersister({
      storage,
      key: `${QUERY_CACHE_PREFIX}${userId}`,
      throttleTime: 1000,
    })
    const [unsubscribe] = persistQueryClient({
      queryClient,
      persister,
      maxAge: QUERY_CACHE_MAX_AGE,
      buster: QUERY_CACHE_BUSTER,
      dehydrateOptions: {
        // Only finished, successful data; a query can opt out with meta.persist = false.
        shouldDehydrateQuery: (query) =>
          query.state.status === 'success' && query.meta?.persist !== false,
      },
    })
    return unsubscribe
  }, [queryClient, userId])

  return null
}
