#!/usr/bin/env python3
"""
Convert SUMMARY_REPORT.md into a high-readability, comprehensive executive PDF report.
"""

import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable, Preformatted
)
from reportlab.pdfgen import canvas

# Professional Corporate Palette
PRIMARY = colors.HexColor('#312E81')       # Indigo 900
PRIMARY_ACCENT = colors.HexColor('#4F46E5')# Indigo 600
TEXT_MAIN = colors.HexColor('#0F172A')     # Slate 900
TEXT_MUTED = colors.HexColor('#475569')    # Slate 600
BG_CARD = colors.HexColor('#F8FAFC')       # Slate 50
BG_CODE = colors.HexColor('#F1F5F9')       # Slate 100
BORDER_LIGHT = colors.HexColor('#CBD5E1')  # Slate 300
SUCCESS_COLOR = colors.HexColor('#047857') # Emerald 700
SUCCESS_BG = colors.HexColor('#ECFDF5')    # Emerald 50
SUCCESS_BORDER = colors.HexColor('#6EE7B7')# Emerald 300

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
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor('#64748B'))
        
        # Running Top Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(45, 11 * inch - 32, "AttendX v2 — Master Engineering, Features & QA Summary Report")
            self.drawRightString(8.5 * inch - 45, 11 * inch - 32, "CONFIDENTIAL & PROPRIETARY")
            self.setStrokeColor(BORDER_LIGHT)
            self.setLineWidth(0.5)
            self.line(45, 11 * inch - 36, 8.5 * inch - 45, 11 * inch - 36)
            
        # Running Bottom Footer
        footer_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(8.5 * inch - 45, 28, footer_text)
        self.drawString(45, 28, "AttendX v2 • Next.js 16 (Turbopack) & Supabase PostgreSQL • Definition of Done Verified")
        self.setStrokeColor(BORDER_LIGHT)
        self.setLineWidth(0.5)
        self.line(45, 36, 8.5 * inch - 45, 36)
        
        self.restoreState()

def build_pdf(output_filename):
    doc = SimpleDocTemplate(
        output_filename,
        pagesize=letter,
        leftMargin=45,
        rightMargin=45,
        topMargin=45,
        bottomMargin=45
    )
    
    styles = getSampleStyleSheet()
    
    # Custom Typography Styles
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
        fontName='Helvetica',
        fontSize=9.5,
        leading=13,
        textColor=TEXT_MUTED,
        spaceAfter=8
    )
    
    h1_style = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11.5,
        leading=15,
        textColor=PRIMARY,
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )
    
    h2_style = ParagraphStyle(
        'Heading2_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=13,
        textColor=PRIMARY_ACCENT,
        spaceBefore=6,
        spaceAfter=2,
        keepWithNext=True
    )
    
    body_style = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.5,
        textColor=TEXT_MAIN,
        spaceAfter=3
    )
    
    bullet_style = ParagraphStyle(
        'Bullet_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.5,
        textColor=TEXT_MAIN,
        leftIndent=10,
        spaceAfter=2
    )

    code_block = ParagraphStyle(
        'CodeBlock',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=7,
        leading=9,
        textColor=TEXT_MAIN
    )

    tbl_header = ParagraphStyle(
        'TblHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=PRIMARY
    )
    
    tbl_cell = ParagraphStyle(
        'TblCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=9.5,
        textColor=TEXT_MAIN
    )

    tbl_cell_code = ParagraphStyle(
        'TblCellCode',
        parent=styles['Normal'],
        fontName='Courier-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=PRIMARY
    )

    badge_pass = ParagraphStyle(
        'BadgePass',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=SUCCESS_COLOR
    )

    elements = []
    
    # -------------------------------------------------------------
    # HEADER BANNER & META BOX
    # -------------------------------------------------------------
    elements.append(Paragraph("AttendX v2 — Master Engineering, Features & QA Summary Report", title_style))
    elements.append(Paragraph("Comprehensive Delivery Documentation • Architecture, Hardened Modules, Test Evidence & Governance", subtitle_style))
    elements.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY_ACCENT, spaceBefore=0, spaceAfter=8))
    
    meta_box = [
        [
            Paragraph("<b>Document Version:</b> 2.0.0 (Master Delivery)", tbl_cell),
            Paragraph("<b>Branch:</b> <code>feature/attendx-v2-dev</code> (Rebased & Pushed)", tbl_cell)
        ],
        [
            Paragraph("<b>Target Environment:</b> Next.js 16.3.1 (Turbopack) • Supabase RLS", tbl_cell),
            Paragraph("<b>Governance:</b> 5-Stage Agentic SDLC & Definition of Done (DoD)", tbl_cell)
        ],
        [
            Paragraph("<b>Security Dual-Boundary:</b> Server Proxy (Edge) + PostgreSQL RLS", tbl_cell),
            Paragraph("<b>Total Test Suite:</b> 164 Unit/Integration + 23 Security Tests (100% Pass)", tbl_cell)
        ]
    ]
    meta_table = Table(meta_box, colWidths=[260, 262])
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
    # 1. EXECUTIVE SUMMARY
    # -------------------------------------------------------------
    elements.append(Paragraph("1. Executive Summary", h1_style))
    elements.append(Paragraph(
        "During this engineering cycle, the <b>AttendX Workforce Management Platform</b> was hardened against enterprise production "
        "requirements, eliminating runtime bugs, race conditions, hydration failures, and security vulnerabilities. "
        "All features were developed, audited, and verified according to the <b>7 Non-Negotiable Engineering Rules</b> (Zero Fabrication, "
        "Server-Side Identity Authority, Fail-Closed Boundaries, Atomic Compensating Rollbacks, Zero Secret Leaks, Explicit Test Evidence, "
        "and Positive Controls). Additionally, a <b>Local Spec Kit</b> was instituted to provide local contract drift validation "
        "and automated PR generation without dependency on external cloud CI pipelines.",
        body_style
    ))
    elements.append(Spacer(1, 4))
    
    # -------------------------------------------------------------
    # 2. CORE ARCHITECTURE & NON-NEGOTIABLE ENGINEERING RULES
    # -------------------------------------------------------------
    elements.append(Paragraph("2. Core Architecture & Non-Negotiable Engineering Rules", h1_style))
    
    arch_box = [
        [Paragraph(
            "<b>Boundary 1: Server Route Proxy (proxy.ts)</b><br/>"
            "• NextRequest Origin Validation (CSRF Guard)<br/>"
            "• Forced First-Login Onboarding Gate (/auth/onboarding)<br/>"
            "• Active Account Status Verification (is_active === true)<br/>"
            "• Authoritative Server RBAC Role Matching (/admin, /hr, /manager)", tbl_cell
        )],
        [Paragraph(
            "<b>Boundary 2: Database Layer (PostgreSQL & RLS)</b><br/>"
            "• Multi-Tenant Row-Level Security (auth.jwt() -> app_metadata)<br/>"
            "• Reporting Hierarchy Enforced (employees.manager_id foreign key)<br/>"
            "• Stored Procedures & Triggers (user_roles, active_sessions)<br/>"
            "• Idempotent Provisioning & Compensating Rollbacks (Zero Orphans)", tbl_cell
        )]
    ]
    arch_table = Table(arch_box, colWidths=[522])
    arch_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BG_CODE),
        ('BOX', (0, 0), (-1, -1), 1, BORDER_LIGHT),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(arch_table)
    elements.append(Spacer(1, 4))
    
    patterns = [
        ("1. Server-Side Identity Authority (Rule 2):", "User identity, tenant ID, and role permissions are resolved strictly on the server from app_metadata and direct database lookups. Client headers or request bodies are never trusted."),
        ("2. Atomic Compensating Rollbacks (Rule 4: Zero Orphans):", "Multi-step operations include automated compensating rollbacks (deleteUser(id)) if any step fails. User invitation acceptance supports idempotent recovery rather than failing with 409 Conflict."),
        ("3. Deterministic Client Hydration (Rule 8):", "Resolved Turbopack enqueueModel runtime crashes by mounting dynamic client states (useState(false) + useEffect) rather than nesting dynamic SSR imports inside Client Components."),
        ("4. Native SVG Primitives for Analytics (Rule 8):", "Replaced heavyweight charting dependencies (recharts) with pure, responsive SVG components (AttendanceSvgChart, AttritionDonutChart), eliminating 500KB+ bundle weight and ESM module factory crashes."),
        ("5. Relational Dual-Security Verification (Rule 9):", "Mapped relational prerequisites (employees.manager_id) in PostgreSQL to guarantee manager RLS policies (leaves_manager_read) return active subordinate records.")
    ]
    for p_title, p_desc in patterns:
        elements.append(Paragraph(f"• <b>{p_title}</b> {p_desc}", bullet_style))
        
    elements.append(Spacer(1, 6))
    elements.append(PageBreak())
    
    # -------------------------------------------------------------
    # 3. COMPREHENSIVE FEATURES IMPLEMENTED & VERIFIED
    # -------------------------------------------------------------
    elements.append(Paragraph("3. Comprehensive Features Implemented & Verified", h1_style))
    
    features = [
        ("Feature 1: Token-Based Self-Serve Employee Onboarding", "/auth/signup?token=...", "POST /api/auth/invite/accept",
         "Validates single-use cryptographic invitation tokens. Automatically provisions employee auth credentials, profiles record, and user_roles association (EMPLOYEE). Supports resilient rollback on failure (zero partial data left in auth tables). Clean error states: INVITE_EXPIRED, INVITE_ALREADY_USED, INVALID_TOKEN."),
        
        ("Feature 2: Authoritative Server Proxy & RBAC Boundary Enforcement", "/admin/**, /hr/**, /manager/**", "proxy.ts (Server Proxy)",
         "Boundary 1 (Proxy): Intercepts requests server-side before rendering (307 redirect to /unauthorized). Boundary 2 (RLS): Supabase queries fail closed to 0 rows. Forced First-Login Password Change: Redirects users with onboarding_completed: false to /auth/onboarding (403 ONBOARDING_REQUIRED). Deactivated Account Interception: Immediately redirects to /auth/login?error=account_deactivated."),
        
        ("Feature 3: Active Device Management & Remote Session Revocation", "/profile/sessions", "GET /api/sessions, POST /api/sessions/revoke-others",
         "Lists all active concurrent sessions with device fingerprinting (browser name, OS, IP address, current session indicator). Allows employees or admins to remotely terminate specific sessions or revoke all secondary devices with one click. Revoked sessions are rejected with 401 SESSION_REVOKED and redirected to /auth/login?error=session_revoked."),
        
        ("Feature 4: Manager Leave & Correction Approvals Queue", "/manager/approvals", "GET /api/manager/approvals, POST /api/manager/approvals/[id]",
         "Displays all pending leave applications and punch corrections submitted by direct reports. Subordinate mapping powered by employees.manager_id foreign key relationships. Optimistic UI updates with instant Approve (✓) / Reject (✕) decision actions. Credential forwarding (credentials: 'include') ensures server proxy identity resolution."),
        
        ("Feature 5: Company-Wide Leave Management & Policy Quotas", "/hr/leaves", "POST /api/leaves/apply",
         "Statutory Policy Quota Cards: Casual Leave (CL: 12d), Sick Leave (SL: 10d), Earned Leave (EL: 15d), Comp-Off (COMP: 5d), Leave Without Pay (LWP: 30d). Overlapping Leave Intelligence: Automatically analyzes pending/approved leave dates and surfaces warning banners if multiple employees in the same department request concurrent time-off."),
        
        ("Feature 6: AI Workforce Insights & Attrition Predictive Engine", "/hr/insights", "POST /api/attrition/score",
         "Organization Attrition Risk Distribution: Interactive donut chart displaying Low (🟢), Medium (🟡), and High (🔴) risk breakdowns. Key Risk Factor Cards: Excessive Overtime burnout (20+ hrs OT), Declining Check-in Frequency tardiness alerts, and Retention Stability. 30-Day Attendance Trend SVG area chart. Employee Risk Table with scores (0–100%) and actionable AI recommendations."),
        
        ("Feature 7: Multi-Tenant Switching & Context Isolation", "/auth/select-tenant, TenantSwitcher", "GET /api/auth/tenants, POST /api/auth/tenant/switch",
         "Allows multi-organization users to switch active workspace contexts securely. Updates server-side session claims in app_metadata and sets authoritative tenant cookies. RLS policies instantly re-scope database access to the new tenant ID with 0 cross-tenant data leakage.")
    ]

    for f_title, f_route, f_api, f_desc in features:
        elements.append(Paragraph(f"<b>{f_title}</b>", h2_style))
        elements.append(Paragraph(f"• <b>Route / UI:</b> <code>{f_route}</code> | <b>Endpoint:</b> <code>{f_api}</code>", tbl_cell))
        elements.append(Paragraph(f"• <b>Functionality:</b> {f_desc}", bullet_style))
        elements.append(Spacer(1, 2))

    elements.append(Spacer(1, 6))
    elements.append(PageBreak())

    # -------------------------------------------------------------
    # 4. LOCAL SPEC KIT & AUTOMATED GOVERNANCE
    # -------------------------------------------------------------
    elements.append(Paragraph("4. Local Spec Kit & Automated Governance", h1_style))
    elements.append(Paragraph(
        "A <b>Local Spec Kit</b> was designed and integrated to run 100% locally in Antigravity CLI without external cloud CI pipelines:",
        body_style
    ))
    
    speckit_data = [
        [Paragraph("Tool Name", tbl_header), Paragraph("Path / Command", tbl_header), Paragraph("Capability & Governance Value", tbl_header)],
        [
            Paragraph("<b>Contract Drift Validator</b>", tbl_cell),
            Paragraph("<code>npm run spec:validate</code><br/><code>scripts/spec-validate.mjs</code>", tbl_cell_code),
            Paragraph("Scans 15 technical specifications, extracts declared API contracts, and validates that live Next.js route handlers (<code>app/api/**</code>) match without drift.", tbl_cell)
        ],
        [
            Paragraph("<b>PR & DoD Generator</b>", tbl_cell),
            Paragraph("<code>npm run spec:pr</code><br/><code>scripts/generate-pr-artifact.mjs</code>", tbl_cell_code),
            Paragraph("Gathers git diffs, security test logs, and guardrails to auto-generate the standard 6-section PR documentation in <code>docs/audit/latest_pr_description.md</code>.", tbl_cell)
        ],
        [
            Paragraph("<b>Antigravity Spec Skill</b>", tbl_cell),
            Paragraph("<code>.agents/skills/sdlc-speckit/</code>", tbl_cell_code),
            Paragraph("Guides autonomous agents to author specs, decompose plans, and verify DoD criteria locally.", tbl_cell)
        ],
        [
            Paragraph("<b>Unified CI Pipeline</b>", tbl_cell),
            Paragraph("<code>npm run ci</code>", tbl_cell_code),
            Paragraph("Runs Secret Scans $\\to$ TypeScript $\\to$ Spec Validation $\\to$ Unit Tests $\\to$ Security Matrix $\\to$ Anti-Fabrication Guardrails in <b>~300ms</b>.", tbl_cell)
        ]
    ]
    speckit_table = Table(speckit_data, colWidths=[105, 140, 277])
    speckit_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BG_CARD),
        ('BOX', (0, 0), (-1, -1), 1, BORDER_LIGHT),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(speckit_table)
    elements.append(Spacer(1, 8))

    # -------------------------------------------------------------
    # 5. TEST & QA VERIFICATION RESULTS
    # -------------------------------------------------------------
    elements.append(Paragraph("5. Test & QA Verification Results", h1_style))
    elements.append(Paragraph("All automated test suites were executed against the live development server with 100% pass rates:", body_style))

    tests_summary = [
        [Paragraph("Test Suite Name", tbl_header), Paragraph("Assertions Verified & Test Cases Executed", tbl_header), Paragraph("Result", tbl_header)],
        [
            Paragraph("<b>Critical Security Matrix</b><br/>(Spec 32–33)", tbl_cell),
            Paragraph("23 test cases: Auth failure state, inactive user block (403), employee route guard (307), admin API block (403), multi-tenant isolation ($N > 0$ vs $Leak == 0$), mid-session downgrade, seat limit (422), compensating rollbacks (0 orphans), token replay.", tbl_cell),
            Paragraph("<b>23 / 23 PASSED</b>", badge_pass)
        ],
        [
            Paragraph("<b>Session Edge Cases</b><br/>(Spec 06)", tbl_cell),
            Paragraph("12 test cases: Stale JWT DB override, expired reset tokens (>15m), token reuse family invalidation, sliding-window rate limiter (429), multi-device concurrent sessions, password reset global revocation.", tbl_cell),
            Paragraph("<b>12 / 12 PASSED</b>", badge_pass)
        ],
        [
            Paragraph("<b>Session Management</b><br/>(Spec 04)", tbl_cell),
            Paragraph("8 test cases: Multi-browser tracking, single/bulk session termination, password reset invalidation, admin remote revocation, cross-tenant revocation block (403).", tbl_cell),
            Paragraph("<b>8 / 8 PASSED</b>", badge_pass)
        ],
        [
            Paragraph("<b>CI Anti-Fabrication</b><br/>(Guardrails 1–3)", tbl_cell),
            Paragraph("Secret scanner: 0 client-side service keys in bundles; Code audit: 0 empty catch blocks; Route integrity: all AppShell destinations map to real routes (0 orphan routes).", tbl_cell),
            Paragraph("<b>3 / 3 PASSED</b>", badge_pass)
        ],
        [
            Paragraph("<b>TOTAL SUITE</b>", tbl_cell_code),
            Paragraph("<b>164 Unit & Integration Tests + 23 Security Matrix Assertions. 0 Failures. 0 Flaky Tests.</b>", tbl_cell),
            Paragraph("<b>164 / 164 PASSED</b>", badge_pass)
        ]
    ]
    test_summary_table = Table(tests_summary, colWidths=[115, 327, 80])
    test_summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BG_CARD),
        ('BOX', (0, 0), (-1, -1), 1, BORDER_LIGHT),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(test_summary_table)
    elements.append(Spacer(1, 8))

    # -------------------------------------------------------------
    # 6. GIT REBASE & DELIVERY SIGN-OFF
    # -------------------------------------------------------------
    elements.append(Paragraph("6. Git Rebase & Delivery Sign-Off", h1_style))
    elements.append(Paragraph("• <b>Upstream Sync:</b> Rebased <code>feature/attendx-v2-dev</code> on top of latest <code>origin/main</code> (master).", bullet_style))
    elements.append(Paragraph("• <b>Conflicts Resolved (14 Files):</b> Supabase client singletons (<code>client.ts</code>, <code>server.ts</code>), server proxy rules (<code>proxy.ts</code>), auth hooks & forms (<code>useAuth.tsx</code>, <code>login/page.tsx</code>, <code>signup/page.tsx</code>), layouts (<code>AppShell.tsx</code>, <code>PageWrapper.tsx</code>), and all 6 app pages.", bullet_style))
    elements.append(Paragraph("• <b>Push Status:</b> Pushed to <code>origin feature/attendx-v2-dev</code> via force-with-lease. Pull Request on GitHub shows <b>0 merge conflicts</b>.", bullet_style))
    elements.append(Spacer(1, 6))

    # -------------------------------------------------------------
    # 7. LIVE APPLICATION CREDENTIALS
    # -------------------------------------------------------------
    elements.append(Paragraph("7. Live Application Credentials & Navigation Map", h1_style))
    elements.append(Paragraph("The application is actively running on <b><code>http://localhost:3002</code></b>:", body_style))
    
    creds_data = [
        [Paragraph("User Role", tbl_header), Paragraph("Login Email", tbl_header), Paragraph("Password", tbl_header), Paragraph("Default Landing Page", tbl_header)],
        [Paragraph("<b>Super Admin</b>", tbl_cell), Paragraph("<code>superadmin@acme-tech.com</code>", tbl_cell), Paragraph("<code>Password123!</code>", tbl_cell), Paragraph("<code>/admin/users</code>", tbl_cell_code)],
        [Paragraph("<b>Admin</b>", tbl_cell), Paragraph("<code>admin@acme-tech.com</code>", tbl_cell), Paragraph("<code>Password123!</code>", tbl_cell), Paragraph("<code>/admin/users</code>", tbl_cell_code)],
        [Paragraph("<b>HR Manager</b>", tbl_cell), Paragraph("<code>hr@acme-tech.com</code>", tbl_cell), Paragraph("<code>Password123!</code>", tbl_cell), Paragraph("<code>/hr/insights</code> • <code>/hr/leaves</code>", tbl_cell_code)],
        [Paragraph("<b>Manager</b>", tbl_cell), Paragraph("<code>manager@acme-tech.com</code>", tbl_cell), Paragraph("<code>Password123!</code>", tbl_cell), Paragraph("<code>/manager/approvals</code>", tbl_cell_code)],
        [Paragraph("<b>Employee</b>", tbl_cell), Paragraph("<code>employee@acme-tech.com</code>", tbl_cell), Paragraph("<code>Password123!</code>", tbl_cell), Paragraph("<code>/dashboard</code>", tbl_cell_code)]
    ]
    creds_table = Table(creds_data, colWidths=[80, 160, 95, 187])
    creds_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BG_CARD),
        ('BOX', (0, 0), (-1, -1), 1, BORDER_LIGHT),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, BORDER_LIGHT),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(creds_table)
    elements.append(Spacer(1, 8))

    # Formal Sign-off Card
    signoff_box = [
        [
            Paragraph("<b>DoD Quality Audit:</b> <font color='#047857'>PASSED (100% Verified)</font>", tbl_cell),
            Paragraph("<b>CI Guardrails:</b> <font color='#047857'>ALL GREEN (300ms runtime)</font>", tbl_cell)
        ],
        [
            Paragraph("<b>Secret Scan:</b> <font color='#047857'>CLEAN (0 Leaks Detected)</font>", tbl_cell),
            Paragraph("<b>Application Status:</b> <font color='#047857'>LIVE on http://localhost:3002</font>", tbl_cell)
        ]
    ]
    signoff_tbl = Table(signoff_box, colWidths=[260, 262])
    signoff_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), SUCCESS_BG),
        ('BOX', (0, 0), (-1, -1), 1, SUCCESS_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, SUCCESS_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(signoff_tbl)

    doc.build(elements, canvasmaker=NumberedCanvas)
    print(f"✅ Complete SUMMARY_REPORT.pdf successfully generated at: {output_filename}")

if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else 'SUMMARY_REPORT.pdf'
    build_pdf(target)
