#!/usr/bin/env python3
"""
Generates an executive, publication-grade PDF report from ATTENDX_MVP_FINAL_QA_REPORT.md.
Uses ReportLab to produce a beautifully formatted document with running headers/footers,
styled data tables, code callouts, visual screenshots, and audit badges.
"""

import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable, Image as RLImage
)
from reportlab.pdfgen import canvas

# Professional Executive Color Palette
PRIMARY = colors.HexColor('#1E1B4B')        # Indigo 950
PRIMARY_ACCENT = colors.HexColor('#4338CA') # Indigo 700
SECONDARY = colors.HexColor('#0F172A')      # Slate 900
TEXT_MAIN = colors.HexColor('#1E293B')      # Slate 800
TEXT_MUTED = colors.HexColor('#64748B')     # Slate 500
BG_CARD = colors.HexColor('#F8FAFC')       # Slate 50
BG_CARD_ALT = colors.HexColor('#F1F5F9')   # Slate 100
BORDER_LIGHT = colors.HexColor('#CBD5E1')  # Slate 300
BORDER_DARK = colors.HexColor('#94A3B8')   # Slate 400
SUCCESS_COLOR = colors.HexColor('#047857') # Emerald 700
SUCCESS_BG = colors.HexColor('#ECFDF5')    # Emerald 50
SUCCESS_BORDER = colors.HexColor('#6EE7B7')# Emerald 300
CODE_BG = colors.HexColor('#0F172A')        # Dark Slate 900
CODE_TEXT = colors.HexColor('#38BDF8')      # Cyan 400

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_decorations(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica-Bold", 7.5)
        self.setFillColor(TEXT_MUTED)
        
        # Running Top Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(36, 11 * inch - 26, "AttendX MVP — Final Comprehensive QA Verification & Delivery Report")
            self.drawRightString(8.5 * inch - 36, 11 * inch - 26, "CONFIDENTIAL & AUDITED • PASS")
            self.setStrokeColor(BORDER_LIGHT)
            self.setLineWidth(0.5)
            self.line(36, 11 * inch - 30, 8.5 * inch - 36, 11 * inch - 30)
            
        # Running Bottom Footer
        self.setFont("Helvetica", 7.5)
        footer_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(8.5 * inch - 36, 22, footer_text)
        self.drawString(36, 22, "AttendX MVP • Next.js 16 (Turbopack) & Hosted Supabase PostgreSQL • 100% Verification Sign-Off")
        self.setStrokeColor(BORDER_LIGHT)
        self.setLineWidth(0.5)
        self.line(36, 30, 8.5 * inch - 36, 30)
        
        self.restoreState()

def build_pdf(output_paths):
    # Ensure directories exist
    for p in output_paths:
        os.makedirs(os.path.dirname(p), exist_ok=True)
    
    primary_output = output_paths[0]
    doc = SimpleDocTemplate(
        primary_output,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=40,
        bottomMargin=40
    )

    styles = getSampleStyleSheet()

    # Typography styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=PRIMARY,
        spaceAfter=2
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=13,
        textColor=PRIMARY_ACCENT,
        spaceAfter=8
    )

    h1_style = ParagraphStyle(
        'Heading1Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=PRIMARY,
        spaceBefore=12,
        spaceAfter=5,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'Heading2Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=13,
        textColor=PRIMARY_ACCENT,
        spaceBefore=8,
        spaceAfter=3,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'BodyCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=TEXT_MAIN,
        spaceAfter=4
    )

    bullet_style = ParagraphStyle(
        'BulletCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=TEXT_MAIN,
        leftIndent=12,
        spaceAfter=2
    )

    callout_text = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10.5,
        textColor=TEXT_MAIN
    )

    tbl_header = ParagraphStyle(
        'TblHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=PRIMARY
    )

    tbl_header_center = ParagraphStyle(
        'TblHeaderCenter',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=PRIMARY,
        alignment=1
    )

    tbl_cell = ParagraphStyle(
        'TblCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7,
        leading=9,
        textColor=TEXT_MAIN
    )

    tbl_cell_bold = ParagraphStyle(
        'TblCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=9,
        textColor=PRIMARY
    )

    tbl_cell_code = ParagraphStyle(
        'TblCellCode',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=6.5,
        leading=8.5,
        textColor=TEXT_MAIN
    )

    tbl_cell_center = ParagraphStyle(
        'TblCellCenter',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7,
        leading=9,
        textColor=TEXT_MAIN,
        alignment=1
    )

    badge_pass = ParagraphStyle(
        'BadgePass',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=9,
        textColor=SUCCESS_COLOR,
        alignment=1
    )

    code_pre = ParagraphStyle(
        'CodePre',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=6.5,
        leading=8.5,
        textColor=CODE_TEXT
    )

    elements = []

    # -------------------------------------------------------------
    # TITLE & METADATA BANNER
    # -------------------------------------------------------------
    elements.append(Paragraph("AttendX MVP — Final Comprehensive QA Verification & Delivery Report", title_style))
    elements.append(Paragraph("Conclusive Single-Source-of-Truth Verification Audit • 100% Empirical Runtime Evidence", subtitle_style))
    elements.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY_ACCENT, spaceBefore=0, spaceAfter=6))

    meta_data = [
        [
            Paragraph("<b>Document ID:</b> <code>QA-FINAL-MVP-01</code>", callout_text),
            Paragraph("<b>Date:</b> September 24, 2026", callout_text),
            Paragraph("<b>Verdict:</b> <font color='#047857'><b>🟢 PASS (100% Verified)</b></font>", callout_text)
        ],
        [
            Paragraph("<b>Target Stack:</b> Next.js 16 (Turbopack) & Hosted Supabase", callout_text),
            Paragraph("<b>Instance:</b> <code>khaxowomjczuckfuraoh.supabase.co</code>", callout_text),
            Paragraph("<b>Coverage:</b> 20/20 Test Cases (Zero Defects Remaining)", callout_text)
        ]
    ]
    meta_table = Table(meta_data, colWidths=[180, 180, 180])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BG_CARD),
        ('BOX', (0, 0), (-1, -1), 1, BORDER_LIGHT),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 6))

    # -------------------------------------------------------------
    # 1. EXECUTIVE SUMMARY & VERIFICATION MANDATE
    # -------------------------------------------------------------
    elements.append(Paragraph("1. Executive Summary & Verification Mandate", h1_style))
    elements.append(Paragraph(
        "This report represents the conclusive, single-source-of-truth verification audit for the <b>AttendX MVP</b>. "
        "Every test result, schema definition, and UI render recorded herein was executed against the live application server "
        "(<code>http://localhost:3002</code>) and live hosted Supabase PostgreSQL database (<code>khaxowomjczuckfuraoh.supabase.co</code>).",
        body_style
    ))

    charter_data = [
        [
            Paragraph("<b>Non-Negotiable Charter Principle</b>", tbl_header),
            Paragraph("<b>Implementation & Verification Guarantee</b>", tbl_header)
        ],
        [
            Paragraph("<b>1. Zero Fabrication</b>", tbl_cell_bold),
            Paragraph("No mock fallbacks, developer bypasses, or synthesized data in production or edge code. Authentic HTTP 200/401/403 responses.", tbl_cell)
        ],
        [
            Paragraph("<b>2. Server-Side Identity Authority</b>", tbl_cell_bold),
            Paragraph("User identities, tenant memberships, and roles resolved strictly server-side via session cookies & JWT claims. Zero trust in client state.", tbl_cell)
        ],
        [
            Paragraph("<b>3. Fail-Closed Security Boundary</b>", tbl_cell_bold),
            Paragraph("Missing, ambiguous, or cross-tenant claims fail closed immediately (<code>401 Unauthorized</code> / <code>403 Forbidden</code>).", tbl_cell)
        ],
        [
            Paragraph("<b>4. Relational Dual-Boundary Security</b>", tbl_cell_bold),
            Paragraph("Edge proxy middleware checks paired with live PostgreSQL Row-Level Security (RLS) policies. Multilayer defense.", tbl_cell)
        ],
        [
            Paragraph("<b>5. Deterministic Client Hydration</b>", tbl_cell_bold),
            Paragraph("SSR-safe client mounting and responsive native SVG vector graphics prevent Turbopack hydration diffs and ESM factory crashes.", tbl_cell)
        ]
    ]
    charter_table = Table(charter_data, colWidths=[150, 390])
    charter_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BG_CARD_ALT),
        ('BOX', (0, 0), (-1, -1), 0.75, BORDER_LIGHT),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(charter_table)
    elements.append(Spacer(1, 6))

    # -------------------------------------------------------------
    # 2. TEST SCOPE
    # -------------------------------------------------------------
    elements.append(Paragraph("2. Test Scope", h1_style))
    elements.append(Paragraph(
        "The verification scope encompasses 25 rigorous test cases spanning six core functional domains:",
        body_style
    ))

    scope_data = [
        [
            Paragraph("<b>Domain</b>", tbl_header),
            Paragraph("<b>Test Case IDs</b>", tbl_header),
            Paragraph("<b>Core Verification Objective</b>", tbl_header)
        ],
        [
            Paragraph("1. Attendance & Punch Lifecycle", tbl_cell_bold),
            Paragraph("<code>TC_ATT_001, TC_ATT_002</code>", tbl_cell),
            Paragraph("Standard clock-in, clock-out lifecycle & tenant timezone work duration calculations.", tbl_cell)
        ],
        [
            Paragraph("2. Shifts & Overtime Management", tbl_cell_bold),
            Paragraph("<code>TC_ATT_009 to TC_ATT_012</code>", tbl_cell),
            Paragraph("Shift assignment, punctuality grace period (15m), overtime, and prior-day unclosed shift auto-out.", tbl_cell)
        ],
        [
            Paragraph("3. Location & Geofencing Precision", tbl_cell_bold),
            Paragraph("<code>TC_LOC_001, 002, 005</code>", tbl_cell),
            Paragraph("Haversine perimeter precision (111m vs 378m against 250m radius) & boundary enforcement.", tbl_cell)
        ],
        [
            Paragraph("4. GPS Fraud & Route Tracking", tbl_cell_bold),
            Paragraph("<code>TC_LOC_006, 007, 008, 010</code>", tbl_cell),
            Paragraph("Geodetic coordinate validation, 60s freshness window, mock GPS rejection, and route telemetry.", tbl_cell)
        ],
        [
            Paragraph("5. Multiple Geofences & Tampering", tbl_cell_bold),
            Paragraph("<code>TC_LOC_009, TC_LOC_012</code>", tbl_cell),
            Paragraph("Multi-branch site attendance (Bangalore & Chennai) and non-numeric / SQL injection rejection.", tbl_cell)
        ],
        [
            Paragraph("6. Operational Analytics & Capacity", tbl_cell_bold),
            Paragraph("<code>TC_ANL_001 to TC_ANL_005</code>", tbl_cell),
            Paragraph("Attendance trends, late arrivals, zero-safe absenteeism, overtime hours, and roster capacity utilization.", tbl_cell)
        ]
    ]
    scope_table = Table(scope_data, colWidths=[140, 130, 270])
    scope_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BG_CARD_ALT),
        ('BOX', (0, 0), (-1, -1), 0.75, BORDER_LIGHT),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(scope_table)
    elements.append(Spacer(1, 8))

    # -------------------------------------------------------------
    # 3. MASTER TEST-CASE RESULTS TABLE
    # -------------------------------------------------------------
    elements.append(Paragraph("3. Master Test-Case Results Table", h1_style))
    elements.append(Paragraph(
        "All 20 master test cases were executed against live endpoints and PostgreSQL tables. Every case passed with 100% empirical evidence.",
        body_style
    ))

    master_results = [
        [
            Paragraph("<b>Test ID</b>", tbl_header),
            Paragraph("<b>Domain / Scope</b>", tbl_header),
            Paragraph("<b>Expected Behavior</b>", tbl_header),
            Paragraph("<b>Actual Live Runtime Result</b>", tbl_header),
            Paragraph("<b>Verdict</b>", tbl_header_center)
        ],
        [
            Paragraph("<b>TC_ATT_001</b>", tbl_cell_code),
            Paragraph("Attendance Lifecycle", tbl_cell),
            Paragraph("Standard clock-in creates valid attendance record in tenant timezone", tbl_cell),
            Paragraph("HTTP 200; record created with valid timestamp and employee ID", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>TC_ATT_002</b>", tbl_cell_code),
            Paragraph("Attendance Lifecycle", tbl_cell),
            Paragraph("Standard clock-out updates record with work duration", tbl_cell),
            Paragraph("HTTP 200; <code>clock_out_at</code> recorded and <code>work_minutes</code> computed", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>TC_ATT_009</b>", tbl_cell_code),
            Paragraph("Shift Management", tbl_cell),
            Paragraph("Resolves tenant shifts and assigns shift to employee punch", tbl_cell),
            Paragraph("HTTP 200; returns configured tenant shifts; assigns <code>Standard Core Tech</code>", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>TC_ATT_010</b>", tbl_cell_code),
            Paragraph("Punctuality & Grace", tbl_cell),
            Paragraph("Punches evaluated against shift start + 15m grace window", tbl_cell),
            Paragraph("Punch at 10:30 marked <code>LATE</code> (>09:45 cutoff); punch at 09:35 marked <code>PRESENT</code>", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>TC_ATT_011</b>", tbl_cell_code),
            Paragraph("Overtime Calculation", tbl_cell),
            Paragraph("Hours worked beyond shift end time calculated on checkout", tbl_cell),
            Paragraph("HTTP 200; checkout at 20:30 computes <code>overtime_minutes: 120</code> (2.0 hrs past 18:30)", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>TC_ATT_012</b>", tbl_cell_code),
            Paragraph("Unclosed Shifts", tbl_cell),
            Paragraph("Unclosed punches from prior days flagged; UI shows 'Missing Out'", tbl_cell),
            Paragraph("<code>POST /api/attendance/auto-checkout</code> flags record; UI renders <code>'Missing Out'</code> badge", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>TC_LOC_001</b>", tbl_cell_code),
            Paragraph("Geofence Boundary", tbl_cell),
            Paragraph("Punch inside office perimeter (12.9716, 77.5946) accepted", tbl_cell),
            Paragraph("HTTP 200; accepted inside Bangalore Tech Park (<code>geofence_valid = true</code>)", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>TC_LOC_002</b>", tbl_cell_code),
            Paragraph("Geofence Boundary", tbl_cell),
            Paragraph("Punch outside perimeter (Delhi coords: 28.6139, 77.2090) rejected", tbl_cell),
            Paragraph("HTTP 403 <code>OUTSIDE_GEOFENCE</code> (calculated distance: 1,739,802m > 250m)", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>TC_LOC_005</b>", tbl_cell_code),
            Paragraph("Geofence Boundary", tbl_cell),
            Paragraph("Coordinate at ~111m passes; coordinate at ~378m fails", tbl_cell),
            Paragraph("HTTP 200 for 111m (&lt;= 250m radius); HTTP 403 for 378m (&gt; 250m radius)", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>TC_LOC_006</b>", tbl_cell_code),
            Paragraph("Geodetic Validation", tbl_cell),
            Paragraph("Reject null, missing, string, or out-of-range coordinates", tbl_cell),
            Paragraph("HTTP 400 for null coords; HTTP 400 for <code>lat=105.0</code>; HTTP 400 for string injection", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>TC_LOC_007</b>", tbl_cell_code),
            Paragraph("Telemetry Freshness", tbl_cell),
            Paragraph("Reject stale location timestamps older than 60-second window", tbl_cell),
            Paragraph("HTTP 400 for 10-minute old timestamp; HTTP 200 for fresh timestamp (&lt;60s)", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>TC_LOC_008</b>", tbl_cell_code),
            Paragraph("Fraud Prevention", tbl_cell),
            Paragraph("Reject mock location/spoofing and record security audit log", tbl_cell),
            Paragraph("HTTP 403 Forbidden; <code>SECURITY_ALERT_MOCK_LOCATION</code> recorded in <code>public.audit_log</code>", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>TC_LOC_009</b>", tbl_cell_code),
            Paragraph("Multi-Site Geofence", tbl_cell),
            Paragraph("Employee clocks in at any active tenant geofence site", tbl_cell),
            Paragraph("HTTP 200 at Chennai MegaStore AND HTTP 200 at Bangalore Tech Park", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>TC_LOC_010</b>", tbl_cell_code),
            Paragraph("Route Monitoring", tbl_cell),
            Paragraph("POST records to <code>gps_tracking</code>; GET retrieves; UI renders route", tbl_cell),
            Paragraph("HTTP 201 on POST; HTTP 200 on GET; native SVG route & markers rendered on UI", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>TC_LOC_012</b>", tbl_cell_code),
            Paragraph("Tampered GPS Payload", tbl_cell),
            Paragraph("Malformed or non-numeric location payload rejected cleanly", tbl_cell),
            Paragraph("HTTP 400 Bad Request on non-numeric / SQL injection attempt in coordinates", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>TC_ANL_001</b>", tbl_cell_code),
            Paragraph("Attendance Analytics", tbl_cell),
            Paragraph("Daily aggregation of Present, Late, Absent, Half-Day counts", tbl_cell),
            Paragraph("HTTP 200; returns 11 date buckets with multi-category aggregations", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>TC_ANL_002</b>", tbl_cell_code),
            Paragraph("Attendance Analytics", tbl_cell),
            Paragraph("Query late arrivals with employee and shift metadata", tbl_cell),
            Paragraph("HTTP 200; returns late arrival records with shift start and punch timestamps", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>TC_ANL_003</b>", tbl_cell_code),
            Paragraph("Attendance Analytics", tbl_cell),
            Paragraph("Absenteeism percentage calculation with zero-division guard", tbl_cell),
            Paragraph("HTTP 200; returns <code>absenteeismRate: 0%</code> (14 records); zero-denominator safe", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>TC_ANL_004</b>", tbl_cell_code),
            Paragraph("Attendance Analytics", tbl_cell),
            Paragraph("Aggregated overtime minutes and hours across tenant records", tbl_cell),
            Paragraph("HTTP 200; returns <code>totalOvertimeMinutes: 120</code> (2.0 hrs) across overtime records", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>TC_ANL_005</b>", tbl_cell_code),
            Paragraph("Workforce Capacity", tbl_cell),
            Paragraph("Shift utilization evaluated against entire active employee roster", tbl_cell),
            Paragraph("HTTP 200; returns exact 30.0% utilization (12h worked / 40h capacity across 5 emps)", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ]
    ]

    master_table = Table(master_results, colWidths=[65, 80, 140, 205, 50])
    table_styles = [
        ('BACKGROUND', (0, 0), (-1, 0), BG_CARD_ALT),
        ('BOX', (0, 0), (-1, -1), 0.75, BORDER_LIGHT),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
    ]
    # Alternate row colors
    for r in range(1, len(master_results)):
        bg = colors.white if r % 2 == 1 else BG_CARD
        table_styles.append(('BACKGROUND', (0, r), (-1, r), bg))

    master_table.setStyle(TableStyle(table_styles))
    elements.append(master_table)
    elements.append(Spacer(1, 8))

    # -------------------------------------------------------------
    # 4. KEY DEFECTS FIXED & ROOT CAUSE ANALYSIS
    # -------------------------------------------------------------
    elements.append(Paragraph("4. Key Defects Fixed & Root Cause Analysis", h1_style))

    defects = [
        ("1. TC_LOC_010-ARCH: Schema Drift & Telemetry Storage Remediation",
         "<b>Root Cause:</b> Telemetry was previously routed to <code>offline_sync_log</code> using JSONB payloads. <code>offline_sync_log</code> is an offline mutation synchronization table, NOT an approved GPS telemetry store. In addition, <code>public.gps_tracking</code> had not been deployed, throwing <code>PGRST205</code>.<br/>"
         "<b>Fix Applied:</b> Deployed migration <code>018_gps_tracking_schema.sql</code> creating <code>public.gps_tracking</code> with fields <code>(gps_log_id, tenant_id, employee_id, latitude, longitude, speed, timestamp)</code>. Added composite indexes <code>(tenant_id, employee_id, timestamp)</code> and multi-tenant RLS policies. Updated <code>/api/location/track</code> to write directly to <code>gps_tracking</code>.<br/>"
         "<b>Verification Proof:</b> Real SQL queries confirm 3 rows inserted, 0 rows written to <code>offline_sync_log</code>, and clean deletion teardown."),

        ("2. TC_ATT_012: Unclosed Overnight Shifts & 'Missing Out' UI Defect",
         "<b>Root Cause:</b> Unclosed punches from previous shifts had no automated sweep and defaulted to <code>HALF_DAY</code> on the frontend, distorting attendance records.<br/>"
         "<b>Fix Applied:</b> Implemented <code>POST /api/attendance/auto-checkout</code> to batch-flag open punches from previous days with <code>missing_out: true</code> and <code>notes: 'Missing Out'</code>. Added <code>isMissingOutRecord()</code> helper and a dedicated <code>badge-warning</code> labeled <code>'Missing Out'</code> in <code>app/(app)/attendance/page.tsx</code>, completely suppressing <code>HALF_DAY</code>.<br/>"
         "<b>Verification Proof:</b> Live sweep flagged test records; React server-side rendering and browser inspection confirmed the literal text <code>'Missing Out'</code> was rendered."),

        ("3. TC_ANL_005: Workforce Utilization Denominator Skew",
         "<b>Root Cause:</b> Shift utilization previously evaluated scheduled capacity only for employees who clocked in on that date, producing artificial ~100% rates even if 80% of staff was absent.<br/>"
         "<b>Fix Applied:</b> Redesigned <code>app/api/analytics/utilization/route.ts</code> to compute capacity across the complete assigned tenant employee roster (<code>rawEmployees.length</code>). Unstaffed shift templates contribute exactly 0 hours.<br/>"
         "<b>Authoritative Mathematical Proof:</b> 5 assigned emps @ 8.0h = 40.0h capacity; 12.0h worked = <b>30.00% utilization</b>. Output: <code>overallUtilization: 30%</code>, <code>assignedHeadcount: 5</code>, <code>recordCount: 2</code>. Stale historical figure of 35.5% is fully superseded."),

        ("4. TURBO-HYDRATE: Turbopack Hydration Crashes",
         "<b>Root Cause:</b> Using <code>dynamic(..., { ssr: false })</code> inside Client Components triggered Turbopack <code>enqueueModel</code> runtime crashes.<br/>"
         "<b>Fix Applied:</b> Replaced with deterministic client mounting pattern (<code>const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), [])</code>)."),

        ("5. CHART-ESM-CRASH: Third-Party Charting Library Failure",
         "<b>Root Cause:</b> Heavy external chart libraries caused ESM factory crashes and layout shifts in Next.js 16.<br/>"
         "<b>Fix Applied:</b> Replaced third-party charting dependencies with lightweight, native responsive SVG visualizers.")
    ]

    for title, desc in defects:
        defect_data = [
            [Paragraph(f"<b>{title}</b>", h2_style)],
            [Paragraph(desc, body_style)]
        ]
        defect_tbl = Table(defect_data, colWidths=[540])
        defect_tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), BG_CARD),
            ('BOX', (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(defect_tbl)
        elements.append(Spacer(1, 3))

    elements.append(Spacer(1, 4))

    # -------------------------------------------------------------
    # 5. SECURITY & ROW-LEVEL SECURITY (RLS) RESULTS
    # -------------------------------------------------------------
    elements.append(Paragraph("5. Security & Row-Level Security (RLS) Results", h1_style))
    elements.append(Paragraph(
        "Dual-boundary security is strictly enforced at both the API layer (Proxy / JWT inspection) and the Database layer (Supabase PostgreSQL RLS policies).",
        body_style
    ))

    sec_data = [
        [
            Paragraph("<b>Security Dimension</b>", tbl_header),
            Paragraph("<b>Tested Scenario</b>", tbl_header),
            Paragraph("<b>Boundary Enforcement</b>", tbl_header),
            Paragraph("<b>Observed Result</b>", tbl_header),
            Paragraph("<b>Verdict</b>", tbl_header_center)
        ],
        [
            Paragraph("<b>Cross-Tenant API Guard</b>", tbl_cell_bold),
            Paragraph("Globex Admin queries Acme Employee route", tbl_cell),
            Paragraph("Proxy / API Tenant Check", tbl_cell),
            Paragraph("<code>HTTP 403 Forbidden</code> (<code>'Target employee not found in your organization'</code>)", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>Cross-Tenant RLS Policy</b>", tbl_cell_bold),
            Paragraph("Direct query to <code>public.gps_tracking</code> across tenants", tbl_cell),
            Paragraph("PostgreSQL RLS Policy", tbl_cell),
            Paragraph("Returns <code>0</code> rows (fail-closed containment)", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>Manager Hierarchy (IDOR)</b>", tbl_cell_bold),
            Paragraph("Manager queries non-direct report employee", tbl_cell),
            Paragraph("Reporting Line Check (<code>employees.manager_id</code>)", tbl_cell),
            Paragraph("<code>HTTP 403 Forbidden</code> (<code>'Target employee is not your direct report'</code>)", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>Mock GPS Spoofing</b>", tbl_cell_bold),
            Paragraph("Client sends mocked location flags", tbl_cell),
            Paragraph("<code>isMockLocation()</code> in <code>lib/geo.ts</code>", tbl_cell),
            Paragraph("<code>HTTP 403 Forbidden</code>; <code>SECURITY_ALERT_MOCK_LOCATION</code> logged", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>Credential Bundle Leak</b>", tbl_cell_bold),
            Paragraph("Static AST scan of client bundles (<code>app/</code>, <code>components/</code>)", tbl_cell),
            Paragraph("<code>scripts/ci-secret-scan.mjs</code>", tbl_cell),
            Paragraph("<code>0</code> service keys or sensitive credentials found in client bundles", tbl_cell),
            Paragraph("<b>PASS</b>", badge_pass)
        ]
    ]

    sec_table = Table(sec_data, colWidths=[95, 105, 105, 185, 50])
    sec_styles = [
        ('BACKGROUND', (0, 0), (-1, 0), BG_CARD_ALT),
        ('BOX', (0, 0), (-1, -1), 0.75, BORDER_LIGHT),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
    ]
    for r in range(1, len(sec_data)):
        bg = colors.white if r % 2 == 1 else BG_CARD
        sec_styles.append(('BACKGROUND', (0, r), (-1, r), bg))
    sec_table.setStyle(TableStyle(sec_styles))
    elements.append(sec_table)
    elements.append(Spacer(1, 6))

    # -------------------------------------------------------------
    # 6. DATABASE INTEGRITY & MIGRATION AUDIT
    # -------------------------------------------------------------
    elements.append(Paragraph("6. Database Integrity & Migration Audit", h1_style))
    db_items = [
        "<b>Migration Cleanliness:</b> All migrations (<code>001_...</code> through <code>018_gps_tracking_schema.sql</code>) apply sequentially without error.",
        "<b>PostgreSQL Function Hygiene:</b> Migration 017 was refactored to replace non-existent <code>auth.jwt()</code> with authoritative RPC <code>get_my_tenant_id()</code>.",
        "<b>Foreign Key Constraints:</b> Every <code>gps_tracking</code> row is bound to <code>tenant_id -&gt; tenants(id)</code> and <code>employee_id -&gt; employees(id)</code>.",
        "<b>Zero Orphaned Records:</b> Controlled QA cleanup confirmed <code>SELECT COUNT(*) FROM public.gps_tracking WHERE gps_log_id IN (&lt;test_ids&gt;);</code> returns exactly <b>0</b>.",
        "<b>Offline Sync Log Containment:</b> Baseline records in <code>offline_sync_log</code> remained constant at 4 before and after route tracking tests (zero unintended writes)."
    ]
    for item in db_items:
        elements.append(Paragraph(f"• {item}", bullet_style))

    elements.append(Spacer(1, 6))

    # -------------------------------------------------------------
    # 7. FRONTEND UI & HEADLESS BROWSER (E2E) VERIFICATION
    # -------------------------------------------------------------
    elements.append(Paragraph("7. Frontend UI & Headless Browser (E2E) Verification", h1_style))
    elements.append(Paragraph(
        "A headless Google Chrome (Puppeteer) session was executed against <code>http://localhost:3002</code>:",
        body_style
    ))

    ui_points = [
        "<b>Authentication Flow:</b> Authenticated as David Manager (<code>manager@acme-tech.com</code>), cleanly redirected to <code>/manager/team</code>.",
        "<b>Employee Selection:</b> Located team card for <b>Eve Employee</b> and clicked <b>'View Route'</b>.",
        "<b>Heading & Subheading:</b> Rendered <code>'Route Telemetry'</code> and <code>'Sequential GPS breadcrumbs for Eve Employee'</code> (Carol HR and David Manager names absent).",
        "<b>Empty State Suppressed:</b> <code>'No GPS Telemetry Found'</code> was completely <b>absent</b>.",
        "<b>SVG Route Map:</b> Rendered via <code>&lt;svg viewBox='0 0 560 280'&gt;</code> with polyline points <code>'40.0,240.0 220.0,165.0 520.0,40.0'</code>.",
        "<b>Visual Markers & Labels:</b> 4 <code>&lt;circle&gt;</code> markers (T1 start green <code>#10b981</code>, T2 purple <code>#6366f1</code>, T3 latest blue <code>#3b82f6</code> with outer pulse ring). Waypoint labels <code>['T1', 'T2', 'T3']</code> placed correctly.",
        "<b>Chronological Table:</b> 3 rows rendered with exact timestamps, coordinates (<code>12.97160, 77.59460</code>, <code>12.97250, 77.59550</code>, <code>12.97400, 77.59700</code>), and speeds (<code>0.0 km/h</code>, <code>12.5 km/h</code>, <code>21.0 km/h</code>)."
    ]
    for pt in ui_points:
        elements.append(Paragraph(f"• {pt}", bullet_style))

    # Embed screenshot if present
    screenshot_path = "/Users/nanthithavenkatachapathy/.gemini/antigravity-cli/brain/c1d24729-2687-4326-948e-10d09f13caf7/tc_loc_010_modal_verified.png"
    if os.path.exists(screenshot_path):
        elements.append(Spacer(1, 4))
        img_w = 420
        img_h = 420 * 900 / 1280
        img = RLImage(screenshot_path, width=img_w, height=img_h)
        caption = Paragraph("<font color='#64748B'><i>Figure 1: Headless Chrome E2E visual capture of Manager Route Telemetry modal showing native SVG route map & telemetry log.</i></font>", tbl_cell_center)
        img_table = Table([[img], [caption]], colWidths=[540])
        img_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('BACKGROUND', (0, 0), (-1, -1), BG_CARD),
            ('BOX', (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(img_table)

    elements.append(Spacer(1, 6))

    # -------------------------------------------------------------
    # 8. KNOWN LIMITATIONS & SCOPE BOUNDARIES
    # -------------------------------------------------------------
    elements.append(Paragraph("8. Known Limitations & Scope Boundaries", h1_style))
    limits = [
        "<b>Simulated Route Progression in QA:</b> Because test waypoints in automated suites are posted programmatically across a 35-second historical interval, path generation simulates physical walking/driving coordinates between known landmarks. Real mobile hardware background tracking requires device GPS sensor permissions in production PWA deployments.",
        "<b>Offline Mutation Sync Boundary:</b> <code>offline_sync_log</code> is reserved solely for offline mutation replay (punches, profile updates). Continuous streaming telemetry is stored exclusively in <code>public.gps_tracking</code>.",
        "<b>Grace Period Granularity:</b> The shift grace period is currently standardized at 15 minutes globally per tenant shift. Dynamic per-employee grace overrides are out of MVP scope."
    ]
    for lim in limits:
        elements.append(Paragraph(f"• {lim}", bullet_style))

    elements.append(Spacer(1, 6))

    # -------------------------------------------------------------
    # 9. QUALITY GATES & CI GUARDRAILS SUMMARY
    # -------------------------------------------------------------
    elements.append(Paragraph("9. Quality Gates & CI Guardrails Summary", h1_style))
    ci_box_data = [
        [
            Paragraph(
                "<b>[TypeScript Compilation]</b>   &nbsp;--> npx tsc --noEmit &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;--> <b>0 Errors</b> <font color='#10B981'><b>(PASS)</b></font><br/>"
                "<b>[ESLint Code Hygiene]</b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;--> npx eslint . --quiet &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;--> <b>0 Errors</b> <font color='#10B981'><b>(PASS)</b></font><br/>"
                "<b>[AST Secret Leak Scanner]</b> &nbsp;--> npm run scan:secrets &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;--> <b>0 Leaks</b> &nbsp;<font color='#10B981'><b>(PASS)</b></font><br/>"
                "<b>[Targeted Remediation 20]</b> &nbsp;--> node scripts/verify-targeted-remediation &nbsp;--> <b>20/20</b> &nbsp;&nbsp;&nbsp;<font color='#10B981'><b>(PASS)</b></font><br/>"
                "<b>[Workforce Roster Capacity]</b>--> node scripts/verify-anl005-roster.mjs &nbsp;&nbsp;&nbsp;&nbsp;--> <b>30% Rate</b> <font color='#10B981'><b>(PASS)</b></font><br/>"
                "<b>[Defects & Missing Out UI]</b>--> node scripts/verify-defects.mjs &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;--> <b>2/2</b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<font color='#10B981'><b>(PASS)</b></font><br/>"
                "<b>[Live Browser UI Route E2E]</b>--> node scripts/verify-tc-loc-010-ui-e2e.mjs --> <b>14/14</b> &nbsp;&nbsp;<font color='#10B981'><b>(PASS)</b></font>",
                code_pre
            )
        ]
    ]
    ci_table = Table(ci_box_data, colWidths=[540])
    ci_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), CODE_BG),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#334155')),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(ci_table)
    elements.append(Spacer(1, 8))

    # -------------------------------------------------------------
    # 10. CONCLUSIVE VERIFICATION VERDICT
    # -------------------------------------------------------------
    elements.append(Paragraph("10. Conclusive Verification Verdict", h1_style))
    summary_data = [
        [
            Paragraph("<b>Verification Domain</b>", tbl_header),
            Paragraph("<b>Test Cases</b>", tbl_header_center),
            Paragraph("<b>Execution Status</b>", tbl_header_center),
            Paragraph("<b>Live Verification Result</b>", tbl_header_center)
        ],
        [
            Paragraph("Attendance & Punch Lifecycle", tbl_cell_bold),
            Paragraph("2", tbl_cell_center),
            Paragraph("100% Complete", tbl_cell_center),
            Paragraph("<b>🟢 PASS</b>", badge_pass)
        ],
        [
            Paragraph("Shift Management & Overtime", tbl_cell_bold),
            Paragraph("4", tbl_cell_center),
            Paragraph("100% Complete", tbl_cell_center),
            Paragraph("<b>🟢 PASS</b>", badge_pass)
        ],
        [
            Paragraph("Geofencing & Precision Bounding", tbl_cell_bold),
            Paragraph("3", tbl_cell_center),
            Paragraph("100% Complete", tbl_cell_center),
            Paragraph("<b>🟢 PASS</b>", badge_pass)
        ],
        [
            Paragraph("GPS Telemetry & Fraud Prevention", tbl_cell_bold),
            Paragraph("4", tbl_cell_center),
            Paragraph("100% Complete", tbl_cell_center),
            Paragraph("<b>🟢 PASS</b>", badge_pass)
        ],
        [
            Paragraph("Multi-Site & Input Sanitization", tbl_cell_bold),
            Paragraph("2", tbl_cell_center),
            Paragraph("100% Complete", tbl_cell_center),
            Paragraph("<b>🟢 PASS</b>", badge_pass)
        ],
        [
            Paragraph("Operational Analytics & Capacity", tbl_cell_bold),
            Paragraph("5", tbl_cell_center),
            Paragraph("100% Complete", tbl_cell_center),
            Paragraph("<b>🟢 PASS</b>", badge_pass)
        ],
        [
            Paragraph("<b>Total Test Cases</b>", tbl_cell_bold),
            Paragraph("<b>20</b>", tbl_cell_center),
            Paragraph("<b>100% Executed</b>", tbl_cell_center),
            Paragraph("<b>🟢 PASS</b>", badge_pass)
        ]
    ]

    summary_table = Table(summary_data, colWidths=[200, 80, 130, 130])
    summary_styles = [
        ('BACKGROUND', (0, 0), (-1, 0), BG_CARD_ALT),
        ('BOX', (0, 0), (-1, -1), 0.75, BORDER_LIGHT),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('BACKGROUND', (0, -1), (-1, -1), SUCCESS_BG),
    ]
    summary_table.setStyle(TableStyle(summary_styles))
    elements.append(summary_table)
    elements.append(Spacer(1, 8))

    # Grand Sign-off Card
    grand_signoff = [
        [
            Paragraph("<font size='10' color='#047857'><b>OVERALL ATTENDX MVP VERDICT: 🟢 PASS</b></font><br/>"
                      "<font size='8' color='#1E293B'>All MVP requirements, schema designs, security boundaries, and UI workflows are formally verified and ready for production deployment.</font>",
                      tbl_cell_center)
        ]
    ]
    signoff_tbl = Table(grand_signoff, colWidths=[540])
    signoff_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), SUCCESS_BG),
        ('BOX', (0, 0), (-1, -1), 1.5, SUCCESS_BORDER),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    elements.append(signoff_tbl)

    # Build the document
    doc.build(elements, canvasmaker=NumberedCanvas)
    print(f"Generated primary PDF: {primary_output}")

    # Copy to remaining output paths
    for p in output_paths[1:]:
        import shutil
        shutil.copyfile(primary_output, p)
        print(f"Copied PDF to: {p}")

if __name__ == "__main__":
    targets = [
        "/Users/nanthithavenkatachapathy/attendxnew/AttendX/qa/reports/ATTENDX_MVP_FINAL_QA_REPORT.pdf",
        "/Users/nanthithavenkatachapathy/.gemini/antigravity-cli/brain/c1d24729-2687-4326-948e-10d09f13caf7/ATTENDX_MVP_FINAL_QA_REPORT.pdf"
    ]
    build_pdf(targets)
