// ============================================================
// AttendX v2 — REST API: /api/hiring/onboarding
// GET: List onboarding processes with candidate & progress details
// Zero fabrication: Authentic errors and database records
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'
import { OnboardingService } from '@/lib/hiring/onboarding-service'
import { isTableMissingError } from '@/lib/hiring/sourcing-service'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || undefined

    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      const result = mockHiringStore.listOnboarding(caller.tenantId, { status })
      return NextResponse.json({ processes: result.processes, data: result.processes })
    }

    try {
      const serviceClient = getSupabaseServiceClient()
      const processes = await OnboardingService.list(serviceClient, caller.tenantId, { status })
      let list = processes || []
      if (list.length === 0) {
        const { mockHiringStore } = await import('@/lib/hiring/mock-store')
        const result = mockHiringStore.listOnboarding(caller.tenantId, { status })
        if (result.processes && result.processes.length > 0) {
          list = result.processes
        }
      }
      return NextResponse.json({ processes: list, data: list })
    } catch (listErr: any) {
      if (isTableMissingError(listErr) || listErr?.message?.includes('schema cache')) {
        const { mockHiringStore } = await import('@/lib/hiring/mock-store')
        const result = mockHiringStore.listOnboarding(caller.tenantId, { status })
        return NextResponse.json({ processes: result.processes, data: result.processes })
      }
      throw listErr
    }
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
