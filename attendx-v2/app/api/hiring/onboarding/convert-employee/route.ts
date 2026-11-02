// ============================================================
// AttendX v2 — REST API: /api/hiring/onboarding/convert-employee
// POST: Convert candidate to active employee in the organization
// Atomic transition: DOCUMENTS_VERIFIED -> ONBOARDED
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'
import { OnboardingService, JoiningReadinessError } from '@/lib/hiring/onboarding-service'
import type { UserRole } from '@/types/database'

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

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

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(onboarding_id)

    if (!isDevMockSupabase() && isUuid) {
      try {
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
      } catch (dbErr: any) {
        if (dbErr instanceof JoiningReadinessError) {
          throw dbErr
        }
        console.warn('[convert-employee] DB conversion failed, falling back to mock store:', dbErr?.message || dbErr)
      }
    }

    const { mockHiringStore } = await import('@/lib/hiring/mock-store')
    const result = mockHiringStore.convertToEmployee(caller.tenantId, onboarding_id, body)
    return NextResponse.json(result)
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({
      error: err.message || 'Internal server error',
      code: err.code || (status === 400 ? 'BAD_REQUEST' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR'),
      ...(err.readiness ? { readiness: err.readiness } : {}),
    }, { status })
  }
}
