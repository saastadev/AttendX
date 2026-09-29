// ============================================================
// AttendX v2 — RFC-4180 CSV Exporter
// Specs: REP-TC-001, REP-TC-008, REP-TC-010
// ============================================================

import type { WorkforceReportRow, ReportSummaryMetrics } from './report-service.ts'

function escapeCsvCell(value: any): string {
  if (value === null || value === undefined) return '""'
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function generateCsvReport(
  records: WorkforceReportRow[],
  summary: ReportSummaryMetrics,
  includeSalary = false
): string {
  const headers = [
    'Employee ID',
    'Employee Name',
    'Department',
    'Designation',
    'Date',
    'Status',
    'Check In',
    'Check Out',
    'Work Minutes',
    'Attendance Rate (%)',
  ]

  if (includeSalary) {
    headers.push('Compensation')
  }

  const lines: string[] = []

  // Metadata & Summary comments
  lines.push(`# AttendX Workforce Performance Report`)
  lines.push(
    `# Total: ${summary.totalRecords} | Present: ${summary.presentCount} | Late: ${summary.lateCount} | Absent: ${summary.absentCount} | Attendance Rate: ${summary.attendanceRate}% | Avg Work Min: ${summary.averageWorkMinutes}`
  )
  lines.push(headers.join(','))

  for (const r of records) {
    const row = [
      escapeCsvCell(r.employeeId),
      escapeCsvCell(r.employeeName),
      escapeCsvCell(r.department),
      escapeCsvCell(r.designation),
      escapeCsvCell(r.date),
      escapeCsvCell(r.status),
      escapeCsvCell(r.checkIn),
      escapeCsvCell(r.checkOut),
      r.workMinutes,
      r.attendanceRate,
    ]
    if (includeSalary) {
      row.push(escapeCsvCell(r.salary || 'N/A'))
    }
    lines.push(row.join(','))
  }

  return lines.join('\n')
}
