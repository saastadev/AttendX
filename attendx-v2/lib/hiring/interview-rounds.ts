// ============================================================
// AttendX v2 — Hiring Module: Structured Interview Rounds & Templates
// Models the three canonical interview rounds:
//   Round 1: Introductory / Quick Hello (15-20 min)
//   Round 2: Technical / Coding Assessment (45-60 min)
//   Round 3: Technical Deep Dive & HR (45-60 min)
// Includes safe variable interpolation, HTML escaping, and Meet URL validation.
// ============================================================

export interface StructuredRoundConfig {
  round_number: number
  round_type: 'INTRODUCTORY' | 'CODING' | 'DEEP_DIVE'
  db_round_type: 'HR' | 'TECHNICAL' | 'MANAGERIAL' | 'FINAL'
  title: string
  subtitle: string
  default_duration_minutes: number
  competencies: string[]
  default_agenda: string[]
  template_subject: string
  template_body: string
}

export const STRUCTURED_INTERVIEW_ROUNDS: StructuredRoundConfig[] = [
  {
    round_number: 1,
    round_type: 'INTRODUCTORY',
    db_round_type: 'HR',
    title: 'Round 1 — Introductory / Quick Hello',
    subtitle: 'Brief introductory conversation & mutual alignment',
    default_duration_minutes: 20,
    competencies: [
      'Communication & Articulation',
      'Career Background & Interests',
      'Role Expectations & Motivation',
      'Availability & Logistics'
    ],
    default_agenda: [
      'Welcome and introductions (3-5 min)',
      'Candidate background and current interests (5-7 min)',
      'Role expectations, working mode, and availability (3-5 min)',
      'Overview of AttendX hiring process and team culture (2-3 min)',
      'Candidate Q&A (3-5 min)'
    ],
    template_subject: 'AttendX Interview Invitation — Round 1: Introductory Call — {{job_title}}',
    template_body: `Hello {{candidate_name}},

Thank you for your interest in the {{job_title}} position at {{company_name}}.

We would like to invite you to Round 1: Introductory / Quick Hello. This will be a brief 20-minute conversation to learn more about your background, discuss the role, and answer any questions you may have.

**Interview Details:**
- **Round:** Round 1 — Introductory / Quick Hello
- **Date:** {{interview_date}}
- **Time:** {{interview_time}} ({{timezone}})
- **Duration:** {{duration}} minutes
- **Interviewer(s):** {{interviewer_names}}
- **Meeting Link:** {{meeting_url}}

**Agenda:**
{{interview_agenda}}

Please confirm your availability by replying to this email. If the proposed time does not work for you, please let us know your preferred availability window.

We look forward to speaking with you!

Best regards,  
{{recruiter_name}}  
{{company_name}} — Talent Acquisition Team`
  },
  {
    round_number: 2,
    round_type: 'CODING',
    db_round_type: 'TECHNICAL',
    title: 'Round 2 — Technical / Coding Assessment',
    subtitle: 'Practical coding, problem-solving & data structures',
    default_duration_minutes: 60,
    competencies: [
      'Problem Solving & Algorithms',
      'Practical Coding & Clean Code',
      'Testing & Edge Case Coverage',
      'Technical Communication & Reasoning'
    ],
    default_agenda: [
      'Introductions & problem context (5 min)',
      'Problem-solving and data structures exercise (20 min)',
      'Practical coding or component design implementation (25 min)',
      'Code quality review, edge cases, and complexity analysis (5 min)',
      'Questions related to technology stack and engineering practices (5 min)'
    ],
    template_subject: 'AttendX Interview Invitation — Round 2: Technical Assessment — {{job_title}}',
    template_body: `Hello {{candidate_name}},

Congratulations on progressing to the next stage of our hiring process for the {{job_title}} role at {{company_name}}.

We are pleased to invite you to Round 2: Technical / Coding Assessment. This 60-minute practical session will focus on coding, problem-solving, and practical technical tasks relevant to our technology stack.

**Interview Details:**
- **Round:** Round 2 — Technical / Coding Assessment
- **Date:** {{interview_date}}
- **Time:** {{interview_time}} ({{timezone}})
- **Duration:** {{duration}} minutes
- **Interviewer(s):** {{interviewer_names}}
- **Meeting Link:** {{meeting_url}}

**Agenda:**
{{interview_agenda}}

**Instructions for the session:**
- Please ensure you have a stable internet connection and quiet environment.
- You may use your preferred code editor, IDE, or terminal.
- Be prepared to share your screen and explain your thought process while coding.

If you have any questions or need to reschedule, please notify us as soon as possible.

Best regards,  
{{recruiter_name}}  
{{company_name}} — Engineering & Talent Acquisition`
  },
  {
    round_number: 3,
    round_type: 'DEEP_DIVE',
    db_round_type: 'FINAL',
    title: 'Round 3 — Technical Deep Dive & HR',
    subtitle: 'System architecture, production depth, leadership & offer alignment',
    default_duration_minutes: 60,
    competencies: [
      'System Architecture & Scalability',
      'Production Fundamentals & Debugging',
      'Collaboration, Ownership & Values',
      'Role Expectations & Compensation Alignment'
    ],
    default_agenda: [
      'Distributed systems and architecture discussion (25 min)',
      'Technical fundamentals, reliability, and observability (15 min)',
      'Collaboration, team leadership, and situational questions (10 min)',
      'Role expectations, notice period, compensation, and next steps (10 min)'
    ],
    template_subject: 'AttendX Interview Invitation — Round 3: Technical Deep Dive & HR — {{job_title}}',
    template_body: `Hello {{candidate_name}},

Thank you for your excellent engagement throughout our technical evaluations. We are thrilled to invite you to Round 3: Technical Deep Dive & HR Alignment for the {{job_title}} position at {{company_name}}.

This final interview round will evaluate system architecture, end-to-end production experience, cross-functional collaboration, and mutual organizational fit.

**Interview Details:**
- **Round:** Round 3 — Technical Deep Dive & HR Alignment
- **Date:** {{interview_date}}
- **Time:** {{interview_time}} ({{timezone}})
- **Duration:** {{duration}} minutes
- **Interviewer(s):** {{interviewer_names}}
- **Meeting Link:** {{meeting_url}}

**Agenda:**
{{interview_agenda}}

Please confirm your availability by replying to this invitation. Following this discussion, the hiring committee will convene for our final selection decision.

We look forward to meeting with you!

Best regards,  
{{recruiter_name}}  
{{company_name}} — Talent Acquisition & Leadership`
  }
]

export function getStructuredRoundConfig(roundNumber: number): StructuredRoundConfig {
  const found = STRUCTURED_INTERVIEW_ROUNDS.find(r => r.round_number === Number(roundNumber))
  return found || STRUCTURED_INTERVIEW_ROUNDS[0]
}

/**
 * Escapes HTML characters safely to prevent XSS or template injection
 */
export function escapeHtml(str: string): string {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Validates a Google Meet URL format strictly.
 * Accepts formats like:
 *   https://meet.google.com/abc-defg-hij
 *   https://meet.google.com/lookup/xyz
 */
export function validateGoogleMeetUrl(url: string | null | undefined): { isValid: boolean; normalized?: string; error?: string } {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return { isValid: false, error: 'Google Meet URL is required.' }
  }

  const trimmed = url.trim()

  // Must be an HTTPS link starting with meet.google.com
  const meetPattern = /^https:\/\/meet\.google\.com\/[a-z0-9_-]+(\?[a-zA-Z0-9_=&-]+)?$/i
  if (!meetPattern.test(trimmed)) {
    return {
      isValid: false,
      error: 'Invalid Google Meet URL. Must be in the format https://meet.google.com/xxx-yyyy-zzz'
    }
  }

  return { isValid: true, normalized: trimmed }
}

/**
 * Interpolates variables into an email subject or body safely
 */
export function renderInterviewEmail(
  template: string,
  variables: {
    candidate_name?: string
    job_title?: string
    company_name?: string
    round_name?: string
    interview_date?: string
    interview_time?: string
    timezone?: string
    duration?: number | string
    interviewer_names?: string
    meeting_url?: string
    interview_agenda?: string
    recruiter_name?: string
  }
): string {
  let rendered = template
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi')
    rendered = rendered.replace(regex, String(value ?? ''))
  }
  return rendered
}
