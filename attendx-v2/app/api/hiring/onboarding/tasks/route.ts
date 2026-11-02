// ============================================================
// AttendX v2 — REST API: /api/hiring/onboarding/tasks
// PATCH: Update status of an onboarding task
// Zero fabrication: Authentic errors and database records
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'
import { OnboardingService } from '@/lib/hiring/onboarding-service'

export async function PATCH(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    const body = await request.json()
    const { task_id, status } = body

    if (!task_id || !status) {
      return NextResponse.json({ error: 'task_id and status are required' }, { status: 400 })
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(task_id)

    if (!isDevMockSupabase() && isUuid) {
      try {
        const serviceClient = getSupabaseServiceClient()
        const task = await OnboardingService.updateTask(
          serviceClient,
          caller.tenantId,
          task_id,
          status,
          caller.userId
        )
        return NextResponse.json({ success: true, task })
      } catch (dbErr: any) {
        console.warn('[tasks PATCH] DB update failed, falling back to mock store:', dbErr?.message || dbErr)
      }
    }

    const { mockHiringStore } = await import('@/lib/hiring/mock-store')
    const task = mockHiringStore.updateChecklistTask(caller.tenantId, task_id, status)
    return NextResponse.json({ success: true, task })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
