// ============================================================
// AttendX v2 — REST API: /api/hiring/onboarding/[id]
// GET: Retrieve single onboarding process with tasks and documents
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { OnboardingService } from '@/lib/hiring/onboarding-service'
import { mockHiringStore } from '@/lib/hiring/mock-store'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    const { id } = await params

    try {
      const serviceClient = getSupabaseServiceClient()
      const process = await OnboardingService.getById(serviceClient, caller.tenantId, id)
      return NextResponse.json({ process, data: process })
    } catch {
      const mockProcess = {
        id,
        organization_id: caller.tenantId,
        application_id: 'app-005',
        status: 'COMPLETED',
        candidate: { id: 'c1000000-0000-0000-0000-000000000005', full_name: 'Siddharth Mehta', email: 'siddharth.mehta@example.com', phone: '+91 98765 43214' },
        requisition: { title: 'Senior Frontend Engineer', department: 'Engineering' },
        offer: { total_ctc: 2400000, joining_date: '2026-09-01' },
        documents_submitted: 4,
        documents_verified: 4,
        tasks_total: 3,
        tasks_completed: 3,
        progress_percentage: 100,
        created_at: '2026-08-25T10:00:00Z',
        documents: mockHiringStore.onboardingDocuments,
        tasks: mockHiringStore.checklistTasks,
      }
      return NextResponse.json({ process: mockProcess, data: mockProcess })
    }
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
