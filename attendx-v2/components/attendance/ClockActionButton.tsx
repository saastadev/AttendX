'use client'

import Link from 'next/link'
import { CheckCircle2, Clock, LogIn, LogOut } from 'lucide-react'
import { clockStateOf, useTodayAttendance } from '@/hooks/useTodayAttendance'

/**
 * The one clock button every page uses. It reads the shared status, so it
 * always offers the right next step: Clock In, Clock Out, or (after the shift)
 * a link to today's record.
 */
export function ClockActionButton({
  className = 'btn btn-primary',
  id,
}: {
  className?: string
  id?: string
}) {
  const { data } = useTodayAttendance()
  const state = clockStateOf(data)

  const label =
    state === 'clocked-in' ? 'Clock Out'
    : state === 'done' ? 'Shift done'
    : state === 'loading' ? 'Attendance'
    : 'Clock In'
  const Icon =
    state === 'clocked-in' ? LogOut
    : state === 'done' ? CheckCircle2
    : state === 'loading' ? Clock
    : LogIn

  return (
    <Link href="/attendance/checkin" className={className} id={id} aria-live="polite">
      <Icon size={18} aria-hidden="true" /> {label}
    </Link>
  )
}
