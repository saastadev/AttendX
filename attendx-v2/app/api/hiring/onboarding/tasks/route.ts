// ============================================================
// AttendX v2 — REST API: /api/hiring/onboarding/tasks
// PATCH: Update status of an onboarding task
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { OnboardingService } from '@/lib/hiring/onboarding-service'
import { mockHiringStore } from '@/lib/hiring/mock-store'

export async function PATCH(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    const body = await request.json()
    const { task_id, status } = body

    if (!task_id || !status) {
      return NextResponse.json({ error: 'task_id and status are required' }, { status: 400 })
    }

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
    } catch {
      const task = mockHiringStore.updateChecklistTask(caller.tenantId, task_id, status)
      return NextResponse.json({ success: true, task })
    }
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
