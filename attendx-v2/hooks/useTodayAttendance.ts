'use client'

import { useQuery, type QueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth.store'
import type { AttendanceRecord } from '@/types/database'

/**
 * Today's clock-in status, shared by every screen (dashboard, check-in,
 * attendance, team). One cache entry means one answer: after a clock-in or
 * clock-out every page shows the same thing at once.
 */
export const todayAttendanceKey = (userId: string | undefined) => ['today-attendance', userId] as const

export interface TodayAttendance {
  /** Today's record, or null before the first clock-in. */
  today: AttendanceRecord | null
  /** "Today" in the company's timezone (yyyy-MM-dd), from the server. */
  todayDate: string | null
}

export type ClockState = 'loading' | 'not-started' | 'clocked-in' | 'done'

export function clockStateOf(data: TodayAttendance | undefined): ClockState {
  if (!data) return 'loading'
  if (!data.today?.clock_in_at) return 'not-started'
  return data.today.clock_out_at ? 'done' : 'clocked-in'
}

export function useTodayAttendance() {
  const userId = useAuthStore((s) => s.user?.id)
  return useQuery<TodayAttendance>({
    queryKey: todayAttendanceKey(userId),
    queryFn: async () => {
      const res = await fetch('/api/attendance/checkin', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Could not load today's attendance (${res.status})`)
      const json = await res.json()
      return { today: json.today ?? null, todayDate: json.todayDate ?? null }
    },
    enabled: !!userId,
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
    // A saved copy could show "Clock In" after you clocked in elsewhere;
    // always ask the server for this one.
    meta: { persist: false },
  })
}

/** Refreshes every attendance view after a clock-in, clock-out or sync. */
export function invalidateAttendance(queryClient: QueryClient) {
  for (const key of [
    'today-attendance',
    'attendance-records',
    'admin-live-attendance',
    'admin-attendance-records',
    'admin-attendance-glance',
    'manager-team',
  ]) {
    queryClient.invalidateQueries({ queryKey: [key] })
  }
}
