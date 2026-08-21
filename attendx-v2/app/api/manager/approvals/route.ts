// ============================================================
// AttendX v2 — Manager Approvals API
// GET: Returns all pending leave and attendance correction requests
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN',
      'ADMIN',
      'HR',
      'MANAGER',
    ], request)

    const serviceClient = getSupabaseServiceClient()

    // 1. Fetch pending leaves for this tenant
    const { data: rawLeaves, error: lErr } = await serviceClient
      .from('leaves')
      .select('*, leave_types(name, code, color)')
      .eq('tenant_id', caller.tenantId)
      .eq('status', 'PENDING')
      .order('applied_at', { ascending: false })

    if (lErr) {
      console.error('[API Approvals] Error fetching leaves:', lErr)
      return NextResponse.json({ error: lErr.message }, { status: 500 })
    }

    // 2. Fetch pending attendance corrections
    const { data: rawCorrections, error: cErr } = await serviceClient
      .from('attendance_corrections')
      .select('*')
      .eq('tenant_id', caller.tenantId)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })

    if (cErr) {
      console.error('[API Approvals] Error fetching corrections:', cErr)
      return NextResponse.json({ error: cErr.message }, { status: 500 })
    }

    // 3. Batch resolve employee profiles
    const allEmpIds = [
      ...new Set([
        ...(rawLeaves || []).map((l: any) => l.employee_id),
        ...(rawCorrections || []).map((c: any) => c.employee_id),
      ]),
    ]

    let profileMap = new Map<string, any>()
    if (allEmpIds.length > 0) {
      const { data: profiles } = await serviceClient
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', allEmpIds)

      profileMap = new Map((profiles || []).map((p: any) => [p.id, p]))
    }

    const leaves = (rawLeaves || []).map((l: any) => ({
      ...l,
      leave_type: l.leave_types || { name: 'Leave', color: '#6366f1' },
      employee: profileMap.get(l.employee_id) || { full_name: 'Employee', email: '' },
    }))

    const corrections = (rawCorrections || []).map((c: any) => ({
      ...c,
      employee: profileMap.get(c.employee_id) || { full_name: 'Employee', email: '' },
    }))

    return NextResponse.json({
      leaves,
      corrections,
      totalPending: leaves.length + corrections.length,
    })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
