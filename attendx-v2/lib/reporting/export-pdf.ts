// ============================================================
// AttendX v2 — Spec-Compliant PDF-1.4 Binary Generator
// Specs: REP-TC-005, REP-TC-008
// ============================================================

import type { WorkforceReportRow, ReportSummaryMetrics } from './report-service.ts'

function escapePdf(text: any): string {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

export function generatePdfReport(
  title: string,
  records: WorkforceReportRow[],
  summary: ReportSummaryMetrics
): Buffer {
  const pageWidth = 612
  const pageHeight = 792
  const margin = 36

  const headers = ['ID', 'Name', 'Department', 'Date', 'Status', 'Work Min', 'Rate']
  const colWidths = [45, 110, 110, 65, 55, 55, 45]

  let stream = ''

  // Title
  stream += `BT\n/F2 15 Tf\n${margin} 740 Td\n(${escapePdf(title)}) Tj\nET\n`

  // KPI Summary Bar
  stream += `0.96 0.97 0.98 rg\n${margin} 700 ${pageWidth - 2 * margin} 26 re\nf\n`
  stream += `0.8 0.85 0.9 RG\n${margin} 700 ${pageWidth - 2 * margin} 26 re\nS\n`
  stream += `BT\n/F1 8.5 Tf\n0 0 0 rg\n${margin + 8} 710 Td\n`
  stream += `(Total: ${summary.totalRecords} | Present: ${summary.presentCount} | Late: ${summary.lateCount} | Absent: ${summary.absentCount} | Attendance Rate: ${summary.attendanceRate}% | Avg Work Minutes: ${summary.averageWorkMinutes}) Tj\nET\n`

  // Table Header Background
  const tableTop = 680
  stream += `0.15 0.23 0.35 rg\n${margin} ${tableTop - 18} ${pageWidth - 2 * margin} 18 re\nf\n`

  // Header Texts
  stream += `1 1 1 rg\nBT\n/F2 8 Tf\n`
  let curX = margin + 4
  for (let i = 0; i < headers.length; i++) {
    stream += `${curX} ${tableTop - 13} Td\n(${headers[i]}) Tj\n`
    curX += colWidths[i]
    stream += `${-curX + (margin + 4 + colWidths.slice(0, i + 1).reduce((a, b) => a + b, 0))} 0 Td\n`
  }
  stream += `ET\n`

  // Table Data Rows
  let curY = tableTop - 32
  const maxRowsPerPage = 32
  const displayedRecords = records.slice(0, maxRowsPerPage)

  for (let r = 0; r < displayedRecords.length; r++) {
    const row = displayedRecords[r]
    const cells = [
      row.employeeId,
      row.employeeName,
      row.department,
      row.date,
      row.status,
      `${row.workMinutes}m`,
      `${row.attendanceRate}%`,
    ]

    // Row alternating background
    if (r % 2 === 1) {
      stream += `0.98 0.98 0.99 rg\n${margin} ${curY - 3} ${pageWidth - 2 * margin} 14 re\nf\n`
    }

    stream += `0.1 0.1 0.1 rg\nBT\n/F1 7.5 Tf\n`
    let rx = margin + 4
    for (let c = 0; c < cells.length; c++) {
      const cellTxt = escapePdf(cells[c]).slice(0, 22)
      stream += `${rx} ${curY} Td\n(${cellTxt}) Tj\n`
      rx += colWidths[c]
      stream += `${-rx + (margin + 4 + colWidths.slice(0, c + 1).reduce((a, b) => a + b, 0))} 0 Td\n`
    }
    stream += `ET\n`

    // Row border
    stream += `0.9 0.9 0.92 RG\n${margin} ${curY - 4} m\n${pageWidth - margin} ${curY - 4} l\nS\n`
    curY -= 14
  }

  // Footer / Page numbers / Timestamp
  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19)
  stream += `BT\n/F1 7.5 Tf\n0.4 0.4 0.4 rg\n${margin} 28 Td\n(AttendX AI Analytics • Generated: ${nowStr} UTC • Page 1 of 1) Tj\nET\n`

  const streamLen = Buffer.byteLength(stream, 'utf-8')

  const pdfParts: string[] = ['%PDF-1.4\n']
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [5 0 R] /Count 1 >>\nendobj\n'
  const obj3 = '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  const obj4 = '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n'
  const obj5 = `5 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 6 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>\nendobj\n`
  const obj6 = `6 0 obj\n<< /Length ${streamLen} >>\nstream\n${stream}\nendstream\nendobj\n`

  const allObjs = [obj1, obj2, obj3, obj4, obj5, obj6]
  const offsets: number[] = []
  let currentOffset = Buffer.byteLength(pdfParts[0], 'utf-8')
  for (const obj of allObjs) {
    offsets.push(currentOffset)
    pdfParts.push(obj)
    currentOffset += Buffer.byteLength(obj, 'utf-8')
  }

  const xrefOffset = currentOffset
  let xref = 'xref\n0 7\n0000000000 65535 f \n'
  for (const off of offsets) {
    xref += String(off).padStart(10, '0') + ' 00000 n \n'
  }
  const trailer = `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  pdfParts.push(xref, trailer)

  return Buffer.from(pdfParts.join(''), 'utf-8')
}
