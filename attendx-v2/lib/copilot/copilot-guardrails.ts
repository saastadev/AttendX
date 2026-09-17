// ============================================================
// AttendX v2 — Copilot AI Safety & Guardrails (Scope Feature 3)
// Specs: COP-TC-005, COP-TC-006, COP-TC-007, COP-TC-008, COP-TC-009, COP-TC-011
// ============================================================

const INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous\s+|prior\s+)?instructions/i,
  /(?:print|show|reveal|display|output|leak)\s+(?:the\s+)?(?:exact\s+)?system\s+prompt/i,
  /verbatim/i,
  /you\s+are\s+now\s+(?:a|an|in)/i,
  /DAN\s+mode/i,
  /jailbreak/i,
  /bypass\s+(?:security|authorization|guardrails|rules)/i,
  /developer\s+mode/i,
  /disregard\s+(?:all\s+)?rules/i,
  /drop\s+table/i,
  /override\s+safety/i,
]

const LEGAL_MEDICAL_PATTERNS = [
  /\b(?:sue|lawsuit|attorney|legal\s+action|litigation|court\s+order)\b/i,
  /\b(?:medical\s+diagnosis|prescribe|disability\s+determination|doctor['’]s\s+verdict|medical\s+advice)\b/i,
]

const CONFIDENTIAL_DATA_PATTERNS = [
  /(?:salary|compensation|pay|wage|bonus|remuneration|appraisal|disciplinary)/i,
]

export function detectPromptInjection(message: string): { isInjection: boolean; reason: string | null } {
  if (!message) return { isInjection: false, reason: null }

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(message)) {
      return {
        isInjection: true,
        reason: "Adversarial prompt pattern detected. System instructions and internal configurations are strictly protected.",
      }
    }
  }

  return { isInjection: false, reason: null }
}

export function detectScopeViolation(message: string): { isOutOfScope: boolean; refusalReason: string | null } {
  if (!message) return { isOutOfScope: false, refusalReason: null }

  for (const pattern of LEGAL_MEDICAL_PATTERNS) {
    if (pattern.test(message)) {
      return {
        isOutOfScope: true,
        refusalReason:
          "I cannot provide legal counsel, formal litigation advice, or authoritative medical disability determinations. Please consult with qualified HR leadership, company legal counsel, or a licensed medical professional.",
      }
    }
  }

  return { isOutOfScope: false, refusalReason: null }
}

export function detectConfidentialAccessAttempt(
  message: string,
  userRole: string,
  targetEmployeeId?: string | null,
  currentUserId?: string
): { isBlocked: boolean; reason: string | null } {
  if (!message) return { isBlocked: false, reason: null }

  // Check if prompt asks for another employee's salary, appraisal, or disciplinary record
  const mentionsConfidential = CONFIDENTIAL_DATA_PATTERNS.some((p) => p.test(message))
  const mentionsOtherEmployee =
    /\b(?:EMP\d+|other\s+employee|colleague|peer|everyone|manager|team['’]s|coworker)\b/i.test(message) ||
    Boolean(targetEmployeeId && targetEmployeeId !== currentUserId)

  // Employees can NEVER access other employees' salary/appraisal/disciplinary
  if (userRole === 'employee' && (mentionsConfidential || /roleplay|pretend|as\s+an?\s+admin/i.test(message))) {
    if (mentionsOtherEmployee || /salary|compensation|appraisal|disciplinary/i.test(message)) {
      return {
        isBlocked: true,
        reason:
          "Access denied: You are not authorized to view confidential compensation, appraisal, or disciplinary records for other employees.",
      }
    }
  }

  // Managers cannot access salary/compensation of peers or non-reports
  if (userRole === 'manager' && mentionsConfidential && /salary|compensation/i.test(message)) {
    return {
      isBlocked: true,
      reason:
        "Access denied: Managers cannot query individual compensation or appraisal data via Copilot. Please consult official HR payroll portals.",
    }
  }

  return { isBlocked: false, reason: null }
}
