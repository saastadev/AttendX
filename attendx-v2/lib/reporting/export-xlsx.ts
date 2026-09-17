// ============================================================
// AttendX v2 — OpenXML Excel (.xlsx) Exporter
// Specs: REP-TC-006, REP-TC-008, REP-TC-010
// ============================================================

import type { WorkforceReportRow, ReportSummaryMetrics } from './report-service.ts'
import { createZipArchive } from './zip-util.ts'

function colLetter(colIdx: number): string {
  let letter = ''
  let temp = colIdx
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter
    temp = Math.floor(temp / 26) - 1
  }
  return letter
}

function escapeXml(str: any): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function generateXlsxReport(
  records: WorkforceReportRow[],
  summary: ReportSummaryMetrics,
  includeSalary = false
): Buffer {
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

  let sheetRowsXml = ''

  // Row 1: KPI Summary
  sheetRowsXml += `<row r="1"><c r="A1" t="inlineStr"><is><t>Total Records: ${summary.totalRecords} | Present: ${summary.presentCount} | Late: ${summary.lateCount} | Absent: ${summary.absentCount} | Attendance Rate: ${summary.attendanceRate}% | Avg Minutes: ${summary.averageWorkMinutes}</t></is></c></row>`

  // Row 2: Headers
  sheetRowsXml += `<row r="2">`
  for (let c = 0; c < headers.length; c++) {
    sheetRowsXml += `<c r="${colLetter(c)}2" t="inlineStr"><is><t>${escapeXml(headers[c])}</t></is></c>`
  }
  sheetRowsXml += `</row>`

  // Data Rows
  for (let r = 0; r < records.length; r++) {
    const rowNum = r + 3
    const rec = records[r]
    const cells: any[] = [
      rec.employeeId,
      rec.employeeName,
      rec.department,
      rec.designation,
      rec.date,
      rec.status,
      rec.checkIn,
      rec.checkOut,
      rec.workMinutes, // numeric!
      rec.attendanceRate, // numeric!
    ]
    if (includeSalary) {
      cells.push(rec.salary || '')
    }

    sheetRowsXml += `<row r="${rowNum}">`
    for (let c = 0; c < cells.length; c++) {
      const val = cells[c]
      const cellRef = `${colLetter(c)}${rowNum}`
      // Type fidelity (REP-TC-006): numeric cells output as <v>number</v>
      if (typeof val === 'number' && !isNaN(val)) {
        sheetRowsXml += `<c r="${cellRef}"><v>${val}</v></c>`
      } else {
        sheetRowsXml += `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(val)}</t></is></c>`
      }
    }
    sheetRowsXml += `</row>`
  }

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Workforce Report" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`

  const sheet1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRowsXml}</sheetData>
</worksheet>`

  return createZipArchive([
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: rootRels },
    { name: 'xl/workbook.xml', content: workbook },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRels },
    { name: 'xl/worksheets/sheet1.xml', content: sheet1 },
  ])
}
