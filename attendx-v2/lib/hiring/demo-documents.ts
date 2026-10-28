// ============================================================
// AttendX v2 — Synthetic Demo Document Fixtures
// Generates secure, realistic mock onboarding verification documents
// clearly marked with "DEMO DOCUMENT — NOT VALID FOR OFFICIAL USE".
// Zero PII leaks, strictly synthetic fixtures for local test & QA.
// ============================================================

export interface DemoDocumentOptions {
  documentId?: string
  documentType: string
  documentName?: string
  candidateName?: string
  candidateEmail?: string
  organizationName?: string
  status?: string
}

export class DemoDocumentGenerator {
  /**
   * Generates a synthetic Aadhaar National ID mock document
   */
  static renderAadhaar(options: DemoDocumentOptions): string {
    const name = options.candidateName || 'Rohan Verma'
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Aadhaar Card Copy (Demo Specimen)</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f1f5f9;
      margin: 0;
      padding: 32px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .watermark-banner {
      background: #dc2626;
      color: #ffffff;
      padding: 10px 24px;
      font-weight: 800;
      font-size: 13px;
      letter-spacing: 1px;
      border-radius: 8px;
      margin-bottom: 24px;
      text-align: center;
      box-shadow: 0 4px 6px -1px rgba(220, 38, 38, 0.3);
      max-width: 600px;
      width: 100%;
      box-sizing: border-box;
    }
    .card {
      background: #ffffff;
      width: 100%;
      max-width: 600px;
      border: 2px solid #cbd5e1;
      border-radius: 16px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
      position: relative;
      overflow: hidden;
      box-sizing: border-box;
      padding: 28px;
    }
    .card::before {
      content: "DEMO DOCUMENT — NOT VALID FOR OFFICIAL USE";
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 26px;
      font-weight: 900;
      color: rgba(220, 38, 38, 0.12);
      white-space: nowrap;
      pointer-events: none;
      z-index: 10;
    }
    .header-bar {
      border-bottom: 3px solid #f97316;
      padding-bottom: 14px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .emblem-text {
      font-weight: 800;
      font-size: 15px;
      color: #0f172a;
    }
    .sub-emblem {
      font-size: 11px;
      color: #64748b;
    }
    .photo-grid {
      display: flex;
      gap: 20px;
      align-items: flex-start;
    }
    .photo-placeholder {
      width: 110px;
      height: 130px;
      background: #e2e8f0;
      border: 1px solid #94a3b8;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
      flex-shrink: 0;
    }
    .info-list {
      flex: 1;
      font-size: 13px;
      line-height: 1.8;
      color: #334155;
    }
    .info-list strong {
      color: #0f172a;
    }
    .uid-number {
      margin-top: 24px;
      text-align: center;
      font-family: monospace;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 3px;
      color: #b91c1c;
      padding: 10px;
      background: #fef2f2;
      border-radius: 8px;
      border: 1px dashed #fca5a5;
    }
    .footer-bar {
      border-top: 3px solid #16a34a;
      padding-top: 14px;
      margin-top: 24px;
      font-size: 11px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .verified-badge {
      background: #dcfce7;
      color: #15803d;
      padding: 4px 8px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="watermark-banner">
    ⚠️ DEMO DOCUMENT &mdash; NOT VALID FOR OFFICIAL OR LEGAL USE
  </div>

  <div class="card">
    <div class="header-bar">
      <div>
        <div class="emblem-text">भारत सरकार | GOVERNMENT OF INDIA</div>
        <div class="sub-emblem">Unique Identification Authority of India (UIDAI) &mdash; Specimen</div>
      </div>
      <div style="font-size: 28px;">🇮🇳</div>
    </div>

    <div class="photo-grid">
      <div class="photo-placeholder">
        <div style="font-size: 32px; margin-bottom: 4px;">👤</div>
        DEMO PHOTO
      </div>
      <div class="info-list">
        <div>Name: <strong>${name}</strong></div>
        <div>Date of Birth: <strong>15/08/1994</strong></div>
        <div>Gender: <strong>Male</strong></div>
        <div>Address: <strong>#42, 4th Cross, Indiranagar, Bangalore, Karnataka &mdash; 560038</strong></div>
        <div>Enrolment No: <strong>2026/91024/00491</strong></div>
      </div>
    </div>

    <div class="uid-number">
      XXXX XXXX 4921
    </div>

    <div class="footer-bar">
      <div>मेरा आधार, मेरी पहचान (Demonstration Sample)</div>
      <div class="verified-badge">AttendX HR Verified Specimen</div>
    </div>
  </div>
</body>
</html>`
  }

  /**
   * Generates a synthetic Income Tax PAN Card mock document
   */
  static renderPan(options: DemoDocumentOptions): string {
    const name = options.candidateName || 'Rohan Verma'
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PAN Card Copy (Demo Specimen)</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f1f5f9;
      margin: 0;
      padding: 32px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .watermark-banner {
      background: #dc2626;
      color: #ffffff;
      padding: 10px 24px;
      font-weight: 800;
      font-size: 13px;
      letter-spacing: 1px;
      border-radius: 8px;
      margin-bottom: 24px;
      text-align: center;
      max-width: 600px;
      width: 100%;
      box-sizing: border-box;
    }
    .pan-card {
      background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
      width: 100%;
      max-width: 600px;
      border: 2px solid #3b82f6;
      border-radius: 16px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
      position: relative;
      overflow: hidden;
      padding: 28px;
      box-sizing: border-box;
    }
    .pan-card::before {
      content: "DEMO DOCUMENT — NOT VALID FOR OFFICIAL USE";
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 26px;
      font-weight: 900;
      color: rgba(220, 38, 38, 0.12);
      white-space: nowrap;
      pointer-events: none;
      z-index: 10;
    }
    .header-bar {
      border-bottom: 2px solid #2563eb;
      padding-bottom: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .dept-title {
      font-weight: 800;
      font-size: 15px;
      color: #1e3a8a;
    }
    .dept-subtitle {
      font-size: 12px;
      color: #3b82f6;
      font-weight: 600;
    }
    .body-grid {
      display: flex;
      gap: 20px;
    }
    .photo-area {
      width: 100px;
      height: 120px;
      background: #bfdbfe;
      border: 1px solid #60a5fa;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: #1e40af;
      font-weight: 700;
      flex-shrink: 0;
    }
    .details {
      flex: 1;
      font-size: 13px;
      line-height: 1.8;
      color: #1e293b;
    }
    .details strong {
      color: #0f172a;
    }
    .pan-badge {
      margin-top: 18px;
      background: #1e3a8a;
      color: #ffffff;
      padding: 10px;
      border-radius: 8px;
      text-align: center;
      font-family: monospace;
      font-size: 20px;
      letter-spacing: 4px;
      font-weight: 800;
    }
    .signature-area {
      margin-top: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: 11px;
      color: #64748b;
    }
    .sig-line {
      font-family: cursive;
      font-size: 16px;
      color: #1e3a8a;
    }
  </style>
</head>
<body>
  <div class="watermark-banner">
    ⚠️ DEMO DOCUMENT &mdash; NOT VALID FOR OFFICIAL OR LEGAL USE
  </div>

  <div class="pan-card">
    <div class="header-bar">
      <div>
        <div class="dept-title">आयकर विभाग | INCOME TAX DEPARTMENT</div>
        <div class="dept-subtitle">GOVERNMENT OF INDIA &mdash; DEMO SPECIMEN</div>
      </div>
      <div style="font-size: 24px;">🏛️</div>
    </div>

    <div class="body-grid">
      <div class="photo-area">
        DEMO PHOTO
      </div>
      <div class="details">
        <div>Name: <strong>${name}</strong></div>
        <div>Father's Name: <strong>Suresh Verma (Demo)</strong></div>
        <div>Date of Birth: <strong>15/08/1994</strong></div>
        <div>Category: <strong>Individual</strong></div>
      </div>
    </div>

    <div class="pan-badge">
      ABCDE1234F
    </div>

    <div class="signature-area">
      <div>Permanent Account Number Card</div>
      <div class="sig-line">${name}</div>
    </div>
  </div>
</body>
</html>`
  }

  /**
   * Generates a synthetic B.Tech Degree Certificate mock document
   */
  static renderDegree(options: DemoDocumentOptions): string {
    const name = options.candidateName || 'Rohan Verma'
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>B.Tech Degree Certificate (Demo Specimen)</title>
  <style>
    body {
      font-family: "Georgia", serif;
      background: #f1f5f9;
      margin: 0;
      padding: 32px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .watermark-banner {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #dc2626;
      color: #ffffff;
      padding: 10px 24px;
      font-weight: 800;
      font-size: 13px;
      letter-spacing: 1px;
      border-radius: 8px;
      margin-bottom: 24px;
      text-align: center;
      max-width: 680px;
      width: 100%;
      box-sizing: border-box;
    }
    .certificate {
      background: #fffdfa;
      width: 100%;
      max-width: 680px;
      border: 8px double #b45309;
      border-radius: 4px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
      position: relative;
      overflow: hidden;
      padding: 44px 36px;
      text-align: center;
      box-sizing: border-box;
    }
    .certificate::before {
      content: "DEMO DOCUMENT — NOT VALID FOR OFFICIAL USE";
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-family: -apple-system, sans-serif;
      font-size: 28px;
      font-weight: 900;
      color: rgba(220, 38, 38, 0.12);
      white-space: nowrap;
      pointer-events: none;
      z-index: 10;
    }
    .institution-name {
      font-size: 24px;
      font-weight: bold;
      color: #1e293b;
      letter-spacing: 1px;
      margin-bottom: 6px;
      text-transform: uppercase;
    }
    .sub-inst {
      font-size: 13px;
      color: #64748b;
      margin-bottom: 24px;
      font-style: italic;
    }
    .certifies {
      font-size: 14px;
      color: #475569;
      margin-bottom: 12px;
    }
    .recipient-name {
      font-size: 26px;
      font-weight: bold;
      color: #b45309;
      border-bottom: 1px solid #cbd5e1;
      display: inline-block;
      padding-bottom: 4px;
      margin-bottom: 16px;
    }
    .degree-title {
      font-size: 19px;
      font-weight: bold;
      color: #0f172a;
      margin: 14px 0 6px 0;
    }
    .discipline {
      font-size: 15px;
      color: #334155;
      font-style: italic;
      margin-bottom: 18px;
    }
    .division {
      font-size: 13px;
      color: #1e293b;
      font-weight: bold;
      margin-bottom: 28px;
    }
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 36px;
      padding: 0 20px;
      font-size: 12px;
      color: #475569;
    }
    .sig-col {
      border-top: 1px solid #94a3b8;
      padding-top: 6px;
      width: 140px;
    }
    .seal {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: 2px dashed #b45309;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: bold;
      color: #b45309;
      margin: 0 auto 10px;
    }
  </style>
</head>
<body>
  <div class="watermark-banner">
    ⚠️ DEMO DOCUMENT &mdash; NOT VALID FOR OFFICIAL OR LEGAL USE
  </div>

  <div class="certificate">
    <div class="seal">SEAL</div>
    <div class="institution-name">National Institute of Technology</div>
    <div class="sub-inst">An Autonomous Institute of National Importance (Demonstration Specimen)</div>

    <div class="certifies">This is to certify that</div>
    <div class="recipient-name">${name}</div>

    <div class="certifies">has fulfilled all requirements and is admitted to the Degree of</div>
    <div class="degree-title">Bachelor of Technology</div>
    <div class="discipline">in Computer Science and Engineering</div>
    <div class="division">Class Awarded: First Class with Distinction</div>

    <div style="font-size: 11px; color: #64748b; margin-top: 10px;">
      Registration No: <strong>NITK-CSE-2014-0492</strong> &bull; Conferred in June 2018
    </div>

    <div class="signatures">
      <div class="sig-col">
        <div>Dr. K. S. Rao</div>
        <strong>Dean (Academics)</strong>
      </div>
      <div class="sig-col">
        <div>Dr. M. Narayanan</div>
        <strong>Director & Registrar</strong>
      </div>
    </div>
  </div>
</body>
</html>`
  }

  /**
   * Router to render appropriate synthetic document by type or name
   */
  static renderDocument(options: DemoDocumentOptions): string {
    const type = (options.documentType || '').toUpperCase()
    const name = (options.documentName || '').toLowerCase()

    if (type === 'ID_PROOF' || name.includes('aadhaar')) {
      return this.renderAadhaar(options)
    }
    if (type === 'BANK_DETAILS' || type === 'TAX_PROOF' || name.includes('pan')) {
      return this.renderPan(options)
    }
    if (type === 'EDUCATION_CERTIFICATE' || name.includes('degree') || name.includes('certificate')) {
      return this.renderDegree(options)
    }

    // Generic demo document fallback
    return this.renderAadhaar(options)
  }
}
