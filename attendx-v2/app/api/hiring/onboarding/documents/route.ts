// ============================================================
// AttendX v2 — REST API: /api/hiring/onboarding/documents
// POST: Submit a candidate onboarding document
// PATCH: Verify or reject a candidate onboarding document (HR/Admin)
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { OnboardingService } from '@/lib/hiring/onboarding-service'
import { mockHiringStore } from '@/lib/hiring/mock-store'

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'EMPLOYEE'
    ], request)

    const body = await request.json()
    const { onboarding_id, document_type, document_name, file_url, file_size, mime_type } = body

    if (!onboarding_id || !document_type || !document_name || !file_url) {
      return NextResponse.json(
        { error: 'onboarding_id, document_type, document_name, and file_url are required' },
        { status: 400 }
      )
    }

    try {
      const serviceClient = getSupabaseServiceClient()
      const doc = await OnboardingService.submitDocument(serviceClient, caller.tenantId, {
        onboarding_id,
        document_type,
        document_name,
        file_url,
        file_size,
        mime_type,
      })

      return NextResponse.json({ success: true, document: doc }, { status: 201 })
    } catch {
      const doc = {
        id: `doc-${Date.now()}`,
        organization_id: caller.tenantId,
        onboarding_id,
        document_type,
        document_name,
        file_url,
        status: 'PENDING',
      }
      return NextResponse.json({ success: true, document: doc }, { status: 201 })
    }
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}

export async function PATCH(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR'
    ], request)

    const body = await request.json()
    const { document_id, decision, comment } = body

    if (!document_id || !decision) {
      return NextResponse.json(
        { error: 'document_id and decision (VERIFY | REJECT | PENDING) are required' },
        { status: 400 }
      )
    }

    try {
      const serviceClient = getSupabaseServiceClient()
      const doc = await OnboardingService.verifyDocument(
        serviceClient,
        caller.tenantId,
        caller.userId,
        document_id,
        decision,
        comment
      )
      return NextResponse.json({ success: true, document: doc })
    } catch {
      const statusVal = decision === 'VERIFY' ? 'VERIFIED' : 'REJECTED'
      const doc = mockHiringStore.verifyDocument(caller.tenantId, document_id, statusVal, comment)
      return NextResponse.json({ success: true, document: doc })
    }
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
