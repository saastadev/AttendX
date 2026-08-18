'use client'

import { createContext, useContext, useEffect, useCallback, useState } from 'react'
import { syncOfflineQueue, getPendingQueueItems, getDeadLetterItems } from '@/lib/offline/queue'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import type { OfflineQueueItem } from '@/types/database'

interface OfflineSyncContextValue {
  isOnline: boolean
  pendingCount: number
  deadLetterItems: OfflineQueueItem[]
  lastSyncAt: Date | null
  syncNow: () => Promise<{ synced: number; failed: number; retrying: number }>
  refreshQueueStatus: () => Promise<void>
}

const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(null)

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [deadLetterItems, setDeadLetterItems] = useState<OfflineQueueItem[]>([])
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null)
  const user = useAuthStore(s => s.user)

  const refreshQueueStatus = useCallback(async () => {
    try {
      const [pending, dead] = await Promise.all([
        getPendingQueueItems(),
        getDeadLetterItems(),
      ])
      setPendingCount(pending.length)
      setDeadLetterItems(dead)
    } catch (err) {
      console.warn('[OfflineSync] Failed to read IndexedDB queue status:', err)
    }
  }, [])

  const syncNow = useCallback(async () => {
    if (!user) return { synced: 0, failed: 0, retrying: 0 }

    const supabase = getSupabaseBrowserClient()
    const result = await syncOfflineQueue(supabase)

    await refreshQueueStatus()
    setLastSyncAt(new Date())

    if (result.synced > 0) {
      console.info(`[OfflineSync] Synced ${result.synced} items`)
    }
    if (result.retrying > 0) {
      console.info(`[OfflineSync] Rescheduled ${result.retrying} items with backoff`)
    }
    if (result.failed > 0) {
      console.warn(`[OfflineSync] ${result.failed} items moved to dead-letter (FAILED)`)
    }

    return result
  }, [user, refreshQueueStatus])

  useEffect(() => {
    if (typeof window === 'undefined') return

    setIsOnline(navigator.onLine)
    refreshQueueStatus()

    const handleOnline = () => {
      setIsOnline(true)
      syncNow()
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [syncNow, refreshQueueStatus])

  return (
    <OfflineSyncContext.Provider value={{
      isOnline,
      pendingCount,
      deadLetterItems,
      lastSyncAt,
      syncNow,
      refreshQueueStatus,
    }}>
      {children}
    </OfflineSyncContext.Provider>
  )
}

export function useOfflineSync() {
  const context = useContext(OfflineSyncContext)
  if (!context) throw new Error('useOfflineSync must be used within OfflineSyncProvider')
  return context
}
