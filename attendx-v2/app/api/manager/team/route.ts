import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'
import { todayInTimezone } from '@/lib/tenant-time'

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    let { data: { user }, error: authErr } = await supabase.auth.getUser()
    const serviceClient = getSupabaseServiceClient()

    if (!user || authErr) {
      const authHeader = req.headers.get('Authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        const { data: userData } = await serviceClient.auth.getUser(token)
        if (userData?.user) {
          user = userData.user
          authErr = null
        }
      }
    }

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Server-Side Identity & Tenant Resolution (Charter Rule 2 & 3)
    const activeTenantClaim = (user.app_metadata as Record<string, unknown> | undefined)?.tenant_id as string | undefined
    const { data: roleRows } = await serviceClient
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)

    const roleRow = (roleRows || []).find((r: any) => activeTenantClaim ? r.tenant_id === activeTenantClaim : true) || roleRows?.[0]
    const tenantId = roleRow?.tenant_id || activeTenantClaim
    const role = roleRow?.role || 'EMPLOYEE'

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 403 })
    }

    const isPrivileged = ['MANAGER', 'HR', 'ADMIN', 'SUPERADMIN'].includes(role)
    if (!isPrivileged) {
      return NextResponse.json({ error: 'Access denied: Manager role required' }, { status: 403 })
    }

    // Resolve tenant timezone
    let tz = 'Asia/Kolkata'
    const { data: tenant } = await serviceClient
      .from('tenants')
      .select('timezone')
      .eq('id', tenantId)
      .maybeSingle()
    if (tenant?.timezone) tz = tenant.timezone

    const targetDate = todayInTimezone(tz)
    const requestedScope = req.nextUrl.searchParams.get('scope')

    // 1. Fetch team employees
    // For ADMIN, SUPERADMIN, HR: default to all tenant employees unless ?scope=direct is specified.
    // For MANAGER: default to direct reports + self, or all tenant members if ?scope=all.
    let emps: any[] = []
    if (['ADMIN', 'SUPERADMIN', 'HR'].includes(role) && requestedScope !== 'direct') {
      const { data: allTenantEmps, error: allErr } = await serviceClient
        .from('employees')
        .select('id, employee_code, manager_id, department_id, department:departments(name)')
        .eq('tenant_id', tenantId)
      if (allErr) {
        console.error('[Manager Team GET] all tenant emps error:', allErr)
        return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 })
      }
      emps = allTenantEmps || []
    } else {
      // Direct reports query
      const { data: directEmps, error: directErr } = await serviceClient
        .from('employees')
        .select('id, employee_code, manager_id, department_id, department:departments(name)')
        .eq('tenant_id', tenantId)
        .eq('manager_id', user.id)
      if (directErr) {
        console.error('[Manager Team GET] direct emps error:', directErr)
        return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 })
      }
      emps = directEmps || []
    }

    // Always ensure the authenticated user (Bob / Manager) is included in the team roster
    if (!emps.some((e: any) => e.id === user.id)) {
      const { data: myEmp } = await serviceClient
        .from('employees')
        .select('id, employee_code, manager_id, department_id, department:departments(name)')
        .eq('id', user.id)
        .maybeSingle()
      if (myEmp) {
        emps.unshift(myEmp)
      } else {
        emps.unshift({
          id: user.id,
          employee_code: 'SELF',
          manager_id: null,
          department_id: null,
          department: { name: 'Management' },
        })
      }
    }

    const teamList = emps || []
    const empIds = Array.from(new Set(teamList.map((e: any) => e.id)))

    // 2. Fetch profiles for team members
    let profileMap = new Map<string, any>()
    if (empIds.length > 0) {
      const { data: profiles } = await serviceClient
        .from('profiles')
        .select('id, full_name, email, avatar_url, is_active')
        .in('id', empIds)
      profileMap = new Map((profiles || []).map((p: any) => [p.id, p]))
    }

    if (!profileMap.has(user.id)) {
      const { data: myProfile } = await serviceClient
        .from('profiles')
        .select('id, full_name, email, avatar_url, is_active')
        .eq('id', user.id)
        .maybeSingle()
      if (myProfile) profileMap.set(user.id, myProfile)
    }

    // 3. Fetch today's attendance for team members (using authoritative date column)
    let recordMap = new Map<string, any>()
    if (empIds.length > 0) {
      const { data: records } = await serviceClient
        .from('attendance_records')
        .select('*')
        .in('employee_id', empIds)
        .eq('date', targetDate)
      recordMap = new Map((records || []).map((r: any) => [r.employee_id, r]))
    }

    // 4. Resolve the authenticated user's own attendance for today
    let myAttendance = recordMap.get(user.id) || null
    if (!myAttendance) {
      const { data: myRecords } = await serviceClient
        .from('attendance_records')
        .select('*')
        .eq('employee_id', user.id)
        .eq('date', targetDate)
        .order('created_at', { ascending: false })
        .limit(1)
      if (myRecords?.[0]) {
        myAttendance = myRecords[0]
        recordMap.set(user.id, myAttendance)
      }
    }
    const isUserPresent = !!(myAttendance?.clock_in_at)

    // 5. Fetch pending leaves from team
    let pendingLeaves: any[] = []
    if (empIds.length > 0) {
      const { data: leaves } = await serviceClient
        .from('leaves')
        .select('*, leave_type:leave_types(name, color)')
        .eq('tenant_id', tenantId)
        .eq('status', 'PENDING')
        .in('employee_id', empIds)
        .order('applied_at', { ascending: false })

      pendingLeaves = (leaves || []).map((l: any) => ({
        ...l,
        employee: profileMap.get(l.employee_id) || { full_name: 'Team Member' },
      }))
    }

    // 6. Assemble team members with live attendance status
    const populatedTeam = teamList.map((e: any) => {
      const prof = profileMap.get(e.id) || { full_name: 'Team Member', email: '', is_active: true }
      const att = recordMap.get(e.id) || null
      const isPresent = !!(att?.clock_in_at)
      const isSelf = e.id === user.id
      const isDirectReport = e.manager_id === user.id || isSelf

      return {
        ...e,
        profile: prof,
        department_name: (e.department as any)?.name || 'General',
        todayAttendance: att ? [att] : [],
        is_present_today: isPresent,
        is_self: isSelf,
        is_direct_report: isDirectReport,
      }
    })

    // Sort order: authenticated user (self) first, then present members, then not clocked in, alphabetical by name
    populatedTeam.sort((a: any, b: any) => {
      if (a.is_self && !b.is_self) return -1
      if (!a.is_self && b.is_self) return 1
      if (a.is_present_today && !b.is_present_today) return -1
      if (!a.is_present_today && b.is_present_today) return 1
      return (a.profile?.full_name || '').localeCompare(b.profile?.full_name || '')
    })

    const totalMembers = populatedTeam.length
    const presentToday = populatedTeam.filter((m: any) => m.is_present_today).length
    const notClockedIn = populatedTeam.filter((m: any) => !m.is_present_today).length
    const directReportsCount = populatedTeam.filter((m: any) => m.is_direct_report).length
    const teamPresentCount = populatedTeam.filter((m: any) => !m.is_self && m.is_present_today).length

    return NextResponse.json({
      success: true,
      todayDate: targetDate,
      scope: requestedScope || (['ADMIN', 'SUPERADMIN', 'HR'].includes(role) ? 'all' : 'direct'),
      myAttendance: {
        isClockedIn: isUserPresent,
        clockInAt: myAttendance?.clock_in_at || null,
        clockOutAt: myAttendance?.clock_out_at || null,
        status: myAttendance?.status || (isUserPresent ? 'PRESENT' : 'NOT_CLOCKED_IN'),
        method: myAttendance?.method || null,
      },
      metrics: {
        totalMembers,
        directReports: directReportsCount,
        teamPresent: teamPresentCount,
        presentToday,
        notClockedIn,
        isUserPresent,
        totalPresent: presentToday,
        pendingLeaves: pendingLeaves.length,
      },
      teamMembers: populatedTeam,
      pendingLeaves,
    })
  } catch (err: any) {
    console.error('[Manager Team GET] Unexpected error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
