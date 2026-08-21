// ============================================================
// AttendX v2 — Decision API for Approvals
// POST: Approve or reject leave or attendance correction
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { type = 'LEAVE', action } = body

    if (!action || !['APPROVED', 'REJECTED'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN',
      'ADMIN',
      'HR',
      'MANAGER',
    ], request)

    const serviceClient = getSupabaseServiceClient()

    if (type === 'LEAVE') {
      // 1. Fetch leave record
      const { data: leave, error: fetchErr } = await serviceClient
        .from('leaves')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', caller.tenantId)
        .single()

      if (fetchErr || !leave) {
        return NextResponse.json({ error: 'Leave request not found' }, { status: 404 })
      }

      // 2. Update leave status
      const { error: updateErr } = await serviceClient
        .from('leaves')
        .update({
          status: action,
          reviewed_by: caller.userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 })
      }

      // 3. If APPROVED, deduct leave balances & trigger notification
      if (action === 'APPROVED') {
        const year = new Date(leave.start_date || Date.now()).getFullYear()
        const { data: balance } = await serviceClient
          .from('leave_balances')
          .select('*')
          .eq('employee_id', leave.employee_id)
          .eq('leave_type_id', leave.leave_type_id)
          .eq('year', year)
          .maybeSingle()

        if (balance) {
          await serviceClient
            .from('leave_balances')
            .update({ used_days: (balance.used_days || 0) + (leave.total_days || 1) })
            .eq('id', balance.id)
        }

        // Send instant notification
        await serviceClient.from('notifications').insert({
          tenant_id: caller.tenantId,
          user_id: leave.employee_id,
          title: 'Leave Request Approved ✅',
          body: `Your request for ${leave.total_days} day(s) (${leave.start_date} to ${leave.end_date}) has been approved.`,
          type: 'LEAVE',
          is_read: false,
        })
      } else {
        // Send rejection notification
        await serviceClient.from('notifications').insert({
          tenant_id: caller.tenantId,
          user_id: leave.employee_id,
          title: 'Leave Request Update',
          body: `Your leave request for ${leave.start_date} was rejected by your manager.`,
          type: 'LEAVE',
          is_read: false,
        })
      }

      return NextResponse.json({ success: true, status: action })
    } else if (type === 'CORRECTION') {
      const { data: correction, error: fetchErr } = await serviceClient
        .from('attendance_corrections')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', caller.tenantId)
        .single()

      if (fetchErr || !correction) {
        return NextResponse.json({ error: 'Correction request not found' }, { status: 404 })
      }

      const { error: updateErr } = await serviceClient
        .from('attendance_corrections')
        .update({
          status: action,
          reviewed_by: caller.userId,
        })
        .eq('id', id)

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, status: action })
    }

    return NextResponse.json({ error: 'Unsupported type' }, { status: 400 })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
