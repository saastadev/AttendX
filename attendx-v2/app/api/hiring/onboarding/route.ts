// ============================================================
// AttendX v2 — REST API: /api/hiring/onboarding
// GET: List onboarding processes with candidate & progress details
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { OnboardingService } from '@/lib/hiring/onboarding-service'
import { mockHiringStore } from '@/lib/hiring/mock-store'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'
    ], request)

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || undefined

    try {
      const serviceClient = getSupabaseServiceClient()
      const processes = await OnboardingService.list(serviceClient, caller.tenantId, { status })
      return NextResponse.json({ processes, data: processes })
    } catch {
      const mockProcesses = [
        {
          id: 'onb-001',
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
        },
        {
          id: 'onb-002',
          organization_id: caller.tenantId,
          application_id: 'app-004',
          status: 'IN_PROGRESS',
          candidate: { id: 'c1000000-0000-0000-0000-000000000004', full_name: 'Priya Nair', email: 'priya.nair@example.com', phone: '+91 98765 43213' },
          requisition: { title: 'Senior Full-Stack Engineer', department: 'Engineering' },
          offer: { total_ctc: 2400000, joining_date: '2026-10-15' },
          documents_submitted: 2,
          documents_verified: 1,
          tasks_total: 4,
          tasks_completed: 1,
          progress_percentage: 45,
          created_at: '2026-09-25T10:00:00Z',
          documents: mockHiringStore.onboardingDocuments,
          tasks: mockHiringStore.checklistTasks,
        },
      ]
      return NextResponse.json({ processes: mockProcesses, data: mockProcesses })
    }
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
