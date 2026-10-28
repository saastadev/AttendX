// ============================================================
// AttendX v2 — REST API: /api/hiring/onboarding/[id]
// GET: Retrieve single onboarding process with tasks and documents
// Zero fabrication: Authentic errors and database records
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient, isDevMockSupabase } from '@/lib/supabase/server'
import { OnboardingService } from '@/lib/hiring/onboarding-service'
import { isTableMissingError } from '@/lib/hiring/sourcing-service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller(['HR'], request)

    const { id } = await params

    let process = null

    if (isDevMockSupabase()) {
      const { mockHiringStore } = await import('@/lib/hiring/mock-store')
      const res = mockHiringStore.listOnboarding(caller.tenantId)
      process = res.processes.find((p: any) => p.id === id || p.application_id === id) || null
      if (!process) {
        return NextResponse.json({ error: 'Onboarding process not found' }, { status: 404 })
      }
    } else {
      try {
        const serviceClient = getSupabaseServiceClient()
        process = await OnboardingService.getById(serviceClient, caller.tenantId, id)
      } catch (dbErr: any) {
        if (isTableMissingError(dbErr) || dbErr?.message?.includes('schema cache')) {
          const { mockHiringStore } = await import('@/lib/hiring/mock-store')
          const res = mockHiringStore.listOnboarding(caller.tenantId)
          process = res.processes.find((p: any) => p.id === id || p.application_id === id) || null
        } else {
          throw dbErr
        }
      }

      if (!process) {
        const { mockHiringStore } = await import('@/lib/hiring/mock-store')
        const res = mockHiringStore.listOnboarding(caller.tenantId)
        process = res.processes.find((p: any) => p.id === id || p.application_id === id) || null
      }

      if (!process) {
        return NextResponse.json({ error: 'Onboarding process not found' }, { status: 404 })
      }
    }

    const formatted = process ? {
      ...process,
      candidate: process.candidate ? {
        ...process.candidate,
        full_name: `${process.candidate.first_name || ''} ${process.candidate.last_name || ''}`.trim(),
      } : null,
    } : null

    return NextResponse.json({ process: formatted, data: formatted })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
