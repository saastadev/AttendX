// ============================================================
// AttendX v2 — REST API: /api/hiring/offers/[id]/release
// POST: Release an offer to candidate with 7-day secure portal token
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { OfferService } from '@/lib/hiring/offer-service'
import type { UserRole } from '@/types/database'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR'
    ], request)

    const { id } = await params
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'
    const portalBaseUrl = new URL(request.url).origin

    const serviceClient = getSupabaseServiceClient()
    const result = await OfferService.releaseOffer(
      serviceClient,
      caller.tenantId,
      caller.userId,
      caller.role as UserRole,
      id,
      portalBaseUrl,
      ip,
      userAgent
    )

    return NextResponse.json(result)
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
