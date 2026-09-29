// ============================================================
// AttendX v2 — REST API: /api/hiring/onboarding/convert-employee
// POST: Convert candidate to active employee in the organization
// Atomic transition: DOCUMENTS_VERIFIED -> ONBOARDED
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { OnboardingService } from '@/lib/hiring/onboarding-service'
import type { UserRole } from '@/types/database'

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR'
    ], request)

    const body = await request.json()
    const { onboarding_id, work_email, department_id, joining_date, job_title, role } = body

    if (!onboarding_id || !work_email) {
      return NextResponse.json(
        { error: 'onboarding_id and work_email are required' },
        { status: 400 }
      )
    }

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'

    const serviceClient = getSupabaseServiceClient()
    const result = await OnboardingService.convertToEmployee(
      serviceClient,
      caller.tenantId,
      caller.userId,
      caller.role as UserRole,
      {
        onboarding_id,
        work_email,
        department_id,
        joining_date,
        job_title,
        role,
      },
      ip,
      userAgent
    )

    return NextResponse.json(result)
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
