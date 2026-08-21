// ============================================================
// AttendX v2 — Canonical Reporting Types (Scope E.30)
// Spec: docs/specs/29_31_ai_data_engine_handoff_spec.md
// ============================================================

export interface AttendanceGlanceMetrics {
  PRESENT: number
  COMPLETED: number
  ON_LEAVE: number
  ABSENT: number
  TOTAL: number
}

export interface AttendanceGlanceResponse {
  success: true
  tenant_id: string
  glance: AttendanceGlanceMetrics
}
