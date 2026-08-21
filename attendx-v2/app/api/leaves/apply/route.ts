// ============================================================
// AttendX v2 — Employee Leave Application API
// POST: Apply for a leave request authoritatively
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN',
      'ADMIN',
      'HR',
      'MANAGER',
      'EMPLOYEE',
    ], request)

    const body = await request.json()
    const { leave_type_id, start_date, end_date, total_days, reason } = body

    if (!leave_type_id || !start_date || !end_date || !reason?.trim()) {
      return NextResponse.json(
        { error: 'Leave type, start date, end date, and reason are required' },
        { status: 400 }
      )
    }

    const calculatedDays = Number(total_days) || 1
    if (calculatedDays <= 0) {
      return NextResponse.json(
        { error: 'End date must be on or after start date' },
        { status: 400 }
      )
    }

    const serviceClient = getSupabaseServiceClient()

    // 1. Insert leave record
    const { data: newLeave, error: insertErr } = await serviceClient
      .from('leaves')
      .insert({
        tenant_id: caller.tenantId,
        employee_id: caller.userId,
        leave_type_id,
        start_date,
        end_date,
        total_days: calculatedDays,
        reason: reason.trim(),
        status: 'PENDING',
        applied_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertErr || !newLeave) {
      console.error('[API Leave Apply] Insert error:', insertErr)
      return NextResponse.json({ error: insertErr?.message || 'Failed to submit leave' }, { status: 500 })
    }

    // 2. Update employee's pending leave balance
    const year = new Date(start_date).getFullYear()
    const { data: balance } = await serviceClient
      .from('leave_balances')
      .select('*')
      .eq('employee_id', caller.userId)
      .eq('leave_type_id', leave_type_id)
      .eq('year', year)
      .maybeSingle()

    if (balance) {
      await serviceClient
        .from('leave_balances')
        .update({ pending_days: (balance.pending_days || 0) + calculatedDays })
        .eq('id', balance.id)
    }

    // 3. Notify manager / tenant administrators
    const { data: employeeRow } = await serviceClient
      .from('employees')
      .select('manager_id')
      .eq('id', caller.userId)
      .maybeSingle()

    const { data: profile } = await serviceClient
      .from('profiles')
      .select('full_name')
      .eq('id', caller.userId)
      .maybeSingle()

    const employeeName = profile?.full_name || 'Team Member'

    if (employeeRow?.manager_id) {
      await serviceClient.from('notifications').insert({
        tenant_id: caller.tenantId,
        user_id: employeeRow.manager_id,
        title: 'New Leave Request 📋',
        body: `${employeeName} requested ${calculatedDays} day(s) of leave (${start_date} to ${end_date}).`,
        type: 'LEAVE',
        is_read: false,
      })
    }

    return NextResponse.json({ success: true, leave: newLeave }, { status: 201 })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
