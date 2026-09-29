// ============================================================
// AttendX v2 — Unified AI Workforce Reporting Service (Scope E.30)
// Specs: REP-TC-001, REP-TC-002, REP-TC-003, REP-TC-004, REP-TC-008, REP-TC-010
// ============================================================

export interface ReportFilterParams {
  startDate?: string
  endDate?: string
  department?: string
  designation?: string
  status?: string
  sortField?: 'name' | 'date' | 'status' | 'workMinutes' | 'attendanceRate'
  sortDirection?: 'asc' | 'desc'
  format?: 'json' | 'csv' | 'pdf' | 'xlsx' | 'pptx'
}

export interface ReportSummaryMetrics {
  totalRecords: number
  presentCount: number
  absentCount: number
  lateCount: number
  averageWorkMinutes: number
  attendanceRate: number
}

export interface WorkforceReportRow {
  employeeId: string
  employeeName: string
  department: string
  designation: string
  date: string
  status: string
  checkIn: string
  checkOut: string
  workMinutes: number
  attendanceRate: number
  salary?: string | number
}

export interface WorkforceReportResult {
  summary: ReportSummaryMetrics
  records: WorkforceReportRow[]
  isCompensationRedacted: boolean
  scoping: 'TENANT_WIDE' | 'DIRECT_REPORTS_ONLY'
}

/**
 * Filter, sort, and scope workforce report data with server-side RBAC and compensation masking.
 */
export function processWorkforceReport(
  rawRecords: any[],
  filters: ReportFilterParams,
  callerRole: string,
  callerUserId: string
): WorkforceReportResult {
  // 1. Role-Based Scoping & Authorization (REP-TC-004)
  const normalizedRole = callerRole?.toLowerCase()
  if (normalizedRole === 'employee') {
    throw new Error('Forbidden: Employees are not authorized to generate workforce reports.')
  }

  const isManager = normalizedRole === 'manager'
  const isHrOrAdmin = normalizedRole === 'hr' || normalizedRole === 'admin' || normalizedRole === 'superadmin'

  let scopedRecords = rawRecords

  // Managers are restricted strictly to direct reports (REP-TC-004)
  if (isManager) {
    scopedRecords = scopedRecords.filter(
      (r) => r.employee?.manager_id === callerUserId || r.manager_id === callerUserId
    )
  }

  // 2. Multi-Dimension Filtering (REP-TC-001)
  let filtered = scopedRecords.filter((r) => {
    // Date Range
    if (filters.startDate && r.date < filters.startDate) return false
    if (filters.endDate && r.date > filters.endDate) return false

    // Department
    if (filters.department && filters.department !== 'ALL') {
      const dept = r.employee?.department || r.department || ''
      if (dept.toLowerCase() !== filters.department.toLowerCase()) return false
    }

    // Designation
    if (filters.designation && filters.designation !== 'ALL') {
      const desig = r.employee?.designation || r.designation || ''
      if (desig.toLowerCase() !== filters.designation.toLowerCase()) return false
    }

    // Status
    if (filters.status && filters.status !== 'ALL') {
      if (r.status?.toUpperCase() !== filters.status.toUpperCase()) return false
    }

    return true
  })

  // 3. Transform & Redact Sensitive Compensation Data (REP-TC-010)
  const rows: WorkforceReportRow[] = filtered.map((r) => {
    const status = (r.status || 'PRESENT').toUpperCase()
    const workMins = typeof r.work_minutes === 'number' ? r.work_minutes : 480
    const attRate = status === 'PRESENT' ? 100 : status === 'LATE' ? 85 : 0

    const row: WorkforceReportRow = {
      employeeId: r.employee?.employee_id || r.employee_id || 'N/A',
      employeeName: r.employee?.full_name || r.full_name || 'Staff Member',
      department: r.employee?.department || r.department || 'General',
      designation: r.employee?.designation || r.designation || 'Specialist',
      date: r.date || new Date().toISOString().split('T')[0],
      status,
      checkIn: r.check_in || '09:00:00',
      checkOut: r.check_out || '17:00:00',
      workMinutes: workMins,
      attendanceRate: attRate,
    }

    // Confidential Compensation: Strictly excluded/masked for non-HR (REP-TC-010)
    if (isHrOrAdmin && r.salary) {
      row.salary = r.salary
    }

    return row
  })

  // 4. Data-Type Aware Sorting (REP-TC-003)
  const sortField = filters.sortField || 'date'
  const sortDir = filters.sortDirection === 'desc' ? -1 : 1

  rows.sort((a, b) => {
    if (sortField === 'workMinutes') {
      return (a.workMinutes - b.workMinutes) * sortDir
    }
    if (sortField === 'attendanceRate') {
      return (a.attendanceRate - b.attendanceRate) * sortDir
    }
    if (sortField === 'date') {
      return a.date.localeCompare(b.date) * sortDir
    }
    if (sortField === 'status') {
      return a.status.localeCompare(b.status) * sortDir
    }
    return a.employeeName.localeCompare(b.employeeName) * sortDir
  })

  // 5. Canonical Metrics Rollup (REP-TC-008 Consistency)
  const total = rows.length
  const present = rows.filter((r) => r.status === 'PRESENT').length
  const late = rows.filter((r) => r.status === 'LATE').length
  const absent = rows.filter((r) => r.status === 'ABSENT').length
  const totalMins = rows.reduce((acc, r) => acc + r.workMinutes, 0)
  const avgMins = total > 0 ? Math.round(totalMins / total) : 0
  const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0

  const summary: ReportSummaryMetrics = {
    totalRecords: total,
    presentCount: present,
    lateCount: late,
    absentCount: absent,
    averageWorkMinutes: avgMins,
    attendanceRate: rate,
  }

  return {
    summary,
    records: rows,
    isCompensationRedacted: !isHrOrAdmin,
    scoping: isManager ? 'DIRECT_REPORTS_ONLY' : 'TENANT_WIDE',
  }
}
