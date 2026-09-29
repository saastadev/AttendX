// ============================================================
// AttendX v2 — OpenXML PowerPoint (.pptx) Presentation Exporter
// Specs: REP-TC-007, REP-TC-008
// ============================================================

import type { WorkforceReportRow, ReportSummaryMetrics } from './report-service.ts'
import { createZipArchive } from './zip-util.ts'

function escapeXml(str: any): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function generatePptxReport(
  title: string,
  records: WorkforceReportRow[],
  summary: ReportSummaryMetrics
): Buffer {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`

  const presXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="5143500"/>
</p:presentation>`

  const presRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`

  const slide1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
      
      <!-- Slide Title -->
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Title"/>
          <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
          <p:nvPr><p:ph type="title"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="457200" y="457200"/><a:ext cx="8229600" cy="914400"/></a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:p><a:r><a:rPr lang="en-US" sz="3000" b="1"/><a:t>${escapeXml(title)}</a:t></a:r></a:p>
          <a:p><a:r><a:rPr lang="en-US" sz="1300" i="1"/><a:t>AttendX AI Analytics &amp; Workforce Reporting</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>

      <!-- KPI Overview Card -->
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="KPI Card"/>
          <p:cNvSpPr/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="457200" y="1500000"/><a:ext cx="8229600" cy="3100000"/></a:xfrm>
          <a:solidFill><a:srgbClr val="F8FAFC"/></a:solidFill>
          <a:ln w="12700"><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:ln>
        </p:spPr>
        <p:txBody>
          <a:bodyPr lIns="200000" tIns="200000"/>
          <a:p><a:r><a:rPr sz="1800" b="1"/><a:t>Executive Workforce Summary</a:t></a:r></a:p>
          <a:p><a:r><a:rPr sz="1400"/><a:t>• Total Records Evaluated: ${summary.totalRecords}</a:t></a:r></a:p>
          <a:p><a:r><a:rPr sz="1400"/><a:t>• Present Shifts: ${summary.presentCount}</a:t></a:r></a:p>
          <a:p><a:r><a:rPr sz="1400"/><a:t>• Late Shifts: ${summary.lateCount}</a:t></a:r></a:p>
          <a:p><a:r><a:rPr sz="1400"/><a:t>• Absent Shifts: ${summary.absentCount}</a:t></a:r></a:p>
          <a:p><a:r><a:rPr sz="1400" b="1"/><a:t>• Overall Attendance Rate: ${summary.attendanceRate}%</a:t></a:r></a:p>
          <a:p><a:r><a:rPr sz="1400"/><a:t>• Average Work Minutes: ${summary.averageWorkMinutes} minutes</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>

    </p:spTree>
  </p:cSld>
</p:sld>`

  return createZipArchive([
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: rootRels },
    { name: 'ppt/presentation.xml', content: presXml },
    { name: 'ppt/_rels/presentation.xml.rels', content: presRels },
    { name: 'ppt/slides/slide1.xml', content: slide1Xml },
  ])
}
