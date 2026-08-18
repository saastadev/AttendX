// ============================================================
// AttendX v2 — Offline Queue (IndexedDB via idb)
// Queues writes made while offline, syncs on reconnect
// ============================================================

import { openDB, type IDBPDatabase } from 'idb'
import type { OfflineQueueItem } from '@/types/database'

const DB_NAME = 'attendx-offline'
const DB_VERSION = 1
const STORE_QUEUE = 'offline_queue'
const STORE_CACHE = 'data_cache'
const STORE_DRAFTS = 'form_drafts'

let _db: IDBPDatabase | null = null

async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db

  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Offline write queue
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const queueStore = db.createObjectStore(STORE_QUEUE, { keyPath: 'id' })
        queueStore.createIndex('status', 'status')
        queueStore.createIndex('entityType', 'entityType')
        queueStore.createIndex('createdAt', 'createdAt')
      }

      // Data cache (stale-while-revalidate)
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        const cacheStore = db.createObjectStore(STORE_CACHE, { keyPath: 'key' })
        cacheStore.createIndex('expiresAt', 'expiresAt')
      }

      // Form drafts (draft persistence across navigation)
      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        db.createObjectStore(STORE_DRAFTS, { keyPath: 'id' })
      }
    },
  })

  return _db
}

// ============================================================
// OFFLINE QUEUE OPERATIONS
// ============================================================

export async function addToOfflineQueue(
  item: Omit<OfflineQueueItem, 'status' | 'createdAt'>
): Promise<void> {
  const db = await getDB()
  await db.put(STORE_QUEUE, {
    ...item,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    attempts: 0,
    nextAttemptAt: new Date().toISOString(),
  })
}

/** Every PENDING item, including ones still inside their backoff window. */
export async function getPendingQueueItems(): Promise<OfflineQueueItem[]> {
  const db = await getDB()
  const index = db.transaction(STORE_QUEUE).store.index('status')
  return index.getAll('PENDING')
}

/** PENDING items that are actually due for a retry right now. */
export async function getDueQueueItems(): Promise<OfflineQueueItem[]> {
  const now = Date.now()
  const pending = await getPendingQueueItems()
  return pending.filter(
    item => !item.nextAttemptAt || new Date(item.nextAttemptAt).getTime() <= now
  )
}

/** Items that exhausted their retries and need a human. */
export async function getDeadLetterItems(): Promise<OfflineQueueItem[]> {
  const db = await getDB()
  const index = db.transaction(STORE_QUEUE).store.index('status')
  return index.getAll('FAILED')
}

export async function updateQueueItemStatus(
  id: string,
  status: 'SYNCED' | 'FAILED',
  errorMessage?: string
): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(STORE_QUEUE, 'readwrite')
  const item = await tx.store.get(id) as OfflineQueueItem | undefined
  if (item) {
    await tx.store.put({
      ...item,
      status,
      errorMessage,
      syncedAt: status === 'SYNCED' ? new Date().toISOString() : undefined,
    })
  }
  await tx.done
}

export async function clearSyncedQueueItems(): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(STORE_QUEUE, 'readwrite')
  const index = tx.store.index('status')
  const synced = await index.getAll('SYNCED')
  await Promise.all(synced.map(item => tx.store.delete(item.id)))
  await tx.done
}

export async function getAllQueueItems(): Promise<OfflineQueueItem[]> {
  const db = await getDB()
  return db.getAll(STORE_QUEUE)
}

// ============================================================
// DATA CACHE OPERATIONS (stale-while-revalidate)
// ============================================================

interface CacheEntry<T> {
  key: string
  data: T
  cachedAt: string
  expiresAt: string
}

export async function setCache<T>(
  key: string,
  data: T,
  ttlSeconds = 300  // 5 minutes default
): Promise<void> {
  const db = await getDB()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000)

  await db.put(STORE_CACHE, {
    key,
    data,
    cachedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  })
}

export async function getCache<T>(key: string): Promise<T | null> {
  const db = await getDB()
  const entry = await db.get(STORE_CACHE, key) as CacheEntry<T> | undefined

  if (!entry) return null

  // Return stale data regardless of expiry — caller decides freshness
  return entry.data
}

export async function isCacheStale(key: string): Promise<boolean> {
  const db = await getDB()
  const entry = await db.get(STORE_CACHE, key) as CacheEntry<unknown> | undefined

  if (!entry) return true
  return new Date(entry.expiresAt) < new Date()
}

export async function clearCache(key?: string): Promise<void> {
  const db = await getDB()
  if (key) {
    await db.delete(STORE_CACHE, key)
  } else {
    await db.clear(STORE_CACHE)
  }
}

// ============================================================
// FORM DRAFT OPERATIONS
// ============================================================

export async function saveDraft<T>(draftId: string, data: T): Promise<void> {
  const db = await getDB()
  await db.put(STORE_DRAFTS, {
    id: draftId,
    data,
    savedAt: new Date().toISOString(),
  })
}

export async function getDraft<T>(draftId: string): Promise<T | null> {
  const db = await getDB()
  const draft = await db.get(STORE_DRAFTS, draftId) as { id: string; data: T } | undefined
  return draft?.data ?? null
}

export async function deleteDraft(draftId: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORE_DRAFTS, draftId)
}

// ============================================================
// SYNC ENGINE — called on connectivity restore
// ============================================================

const MAX_SYNC_ATTEMPTS = 5

/**
 * Postgres/PostgREST codes that will never succeed on retry. Retrying these
 * just burns the queue, so they go straight to the dead-letter state.
 *   23505 unique_violation      - already synced
 *   23503 foreign_key_violation - references a row that doesn't exist
 *   23514 check_violation       - payload violates a constraint
 *   42501 insufficient_privilege- RLS rejected the write
 *   22P02 invalid_text_repr     - malformed payload
 */
const PERMANENT_ERROR_CODES = new Set([
  '23505', '23503', '23514', '42501', '22P02', 'PGRST116', 'PGRST204',
])

function isPermanentError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code
  return typeof code === 'string' && PERMANENT_ERROR_CODES.has(code)
}

/** Exponential backoff with jitter: ~2s, 4s, 8s, 16s, 32s (capped at 5 min). */
function backoffMs(attempts: number): number {
  const base = Math.min(2000 * 2 ** Math.max(0, attempts - 1), 5 * 60 * 1000)
  return base + Math.floor(Math.random() * 1000)
}

/** Record a failed attempt: reschedule with backoff, or dead-letter it. */
async function recordFailure(item: OfflineQueueItem, err: unknown): Promise<'retry' | 'dead'> {
  const db = await getDB()
  const attempts = (item.attempts ?? 0) + 1
  const message = err instanceof Error ? err.message : String(err)
  const permanent = isPermanentError(err)
  const exhausted = attempts >= MAX_SYNC_ATTEMPTS

  if (permanent || exhausted) {
    await db.put(STORE_QUEUE, {
      ...item,
      status: 'FAILED',
      attempts,
      errorMessage: message,
      permanentFailure: true,
    })
    return 'dead'
  }

  await db.put(STORE_QUEUE, {
    ...item,
    status: 'PENDING',
    attempts,
    errorMessage: message,
    nextAttemptAt: new Date(Date.now() + backoffMs(attempts)).toISOString(),
  })
  return 'retry'
}

export async function syncOfflineQueue(
  supabaseClient: import('@supabase/supabase-js').SupabaseClient
): Promise<{ synced: number; failed: number; retrying: number }> {
  // Only items past their backoff window, so a transient outage no longer
  // burns through every attempt in one tight loop.
  const dueItems = await getDueQueueItems()
  let synced = 0
  let failed = 0
  let retrying = 0

  for (const item of dueItems) {
    try {
      if (item.entityType === 'attendance') {
        await syncAttendanceRecord(supabaseClient, item)
      } else if (item.entityType === 'leave') {
        await syncLeaveApplication(supabaseClient, item)
      } else if (item.entityType === 'case') {
        await syncCaseSubmission(supabaseClient, item)
      } else {
        throw new Error(`Unknown entityType: ${String(item.entityType)}`)
      }

      await updateQueueItemStatus(item.id, 'SYNCED')
      synced++
    } catch (err) {
      const outcome = await recordFailure(item, err)
      if (outcome === 'dead') {
        failed++
        console.error(`[OfflineSync] Giving up on ${item.entityType} ${item.id}:`, err)
      } else {
        retrying++
        console.warn(
          `[OfflineSync] Will retry ${item.entityType} ${item.id} ` +
          `(attempt ${(item.attempts ?? 0) + 1}/${MAX_SYNC_ATTEMPTS}):`,
          err
        )
      }
    }
  }

  // Only SYNCED items are cleared. FAILED items are kept deliberately so the
  // user can be shown what didn't make it rather than losing it silently.
  await clearSyncedQueueItems()

  return { synced, failed, retrying }
}

async function syncAttendanceRecord(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  item: OfflineQueueItem
): Promise<void> {
  const payload = item.payload as Record<string, unknown>

  // Upsert using offline_id for idempotency — prevents duplicate clock-ins
  const { error } = await supabase
    .from('attendance_records')
    .upsert(
      { ...payload, offline_id: item.id, sync_status: 'SYNCED' },
      { onConflict: 'tenant_id,employee_id,date', ignoreDuplicates: false }
    )

  if (error) throw error
}

async function syncLeaveApplication(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  item: OfflineQueueItem
): Promise<void> {
  const payload = item.payload as Record<string, unknown>

  const { error } = await supabase
    .from('leaves')
    .insert({ ...payload, offline_id: item.id, sync_status: 'SYNCED', is_draft: false })

  if (error) {
    // If it's a duplicate (already synced), mark as synced
    if (error.code === '23505') return
    throw error
  }
}

async function syncCaseSubmission(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  item: OfflineQueueItem
): Promise<void> {
  const payload = item.payload as Record<string, unknown>

  const { error } = await supabase
    .from('cases')
    .insert({ ...payload, offline_id: item.id, sync_status: 'SYNCED' })

  if (error) {
    if (error.code === '23505') return
    throw error
  }
}
