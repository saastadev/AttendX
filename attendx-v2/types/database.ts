// ============================================================
// AttendX v2 — Database TypeScript Types
// Mirrors the Supabase Postgres schema exactly
// ============================================================

export type UserRole = 'SUPERADMIN' | 'ADMIN' | 'HR' | 'MANAGER' | 'EMPLOYEE'
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'ON_LEAVE' | 'HOLIDAY' | 'WEEKEND'
export type AttendanceMethod = 'SELFIE_GPS' | 'MANUAL' | 'CORRECTION'
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'WITHDRAWN'
export type CaseStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'REOPENED'
export type CasePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type ReviewCycleStatus = 'DRAFT' | 'ACTIVE' | 'SELF_REVIEW' | 'MANAGER_REVIEW' | 'COMPLETED' | 'CANCELLED'
export type NotificationType =
  | 'LEAVE_REQUEST' | 'LEAVE_APPROVED' | 'LEAVE_REJECTED'
  | 'CORRECTION_REQUEST' | 'CORRECTION_APPROVED' | 'CORRECTION_REJECTED'
  | 'CASE_UPDATE' | 'CASE_ASSIGNED' | 'CASE_RESOLVED'
  | 'PERFORMANCE_REVIEW' | 'GOAL_ASSIGNED' | 'REVIEW_DUE'
  | 'RECOGNITION_RECEIVED' | 'BADGE_EARNED'
  | 'ANNOUNCEMENT' | 'SYSTEM'
export type OfflineSyncStatus = 'PENDING' | 'SYNCED' | 'FAILED'

// ============================================================
// TENANT
// ============================================================
export interface Tenant {
  id: string
  name: string
  slug: string
  logo_url: string | null
  accent_color: string
  app_name: string
  features: {
    copilot: boolean
    face_checkin: boolean
    skill_gap: boolean
    attrition_scoring: boolean
    recognition: boolean
    cases: boolean
  }
  plan: string
  max_employees: number
  timezone: string
  created_at: string
  updated_at: string
}

// ============================================================
// PROFILE
// ============================================================
export interface Profile {
  id: string
  tenant_id: string
  email: string
  full_name: string
  avatar_url: string | null
  phone: string | null
  is_active: boolean
  face_enrolled: boolean
  onboarding_completed: boolean
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// USER ROLE
// ============================================================
export interface UserRoleRecord {
  id: string
  user_id: string
  tenant_id: string
  role: UserRole
  assigned_by: string | null
  assigned_at: string
}

// ============================================================
// DEPARTMENT & DESIGNATION
// ============================================================
export interface Department {
  id: string
  tenant_id: string
  name: string
  description: string | null
  head_id: string | null
  created_at: string
  // Joined
  head?: Profile
}

export interface Designation {
  id: string
  tenant_id: string
  name: string
  level: number
  created_at: string
}

// ============================================================
// EMPLOYEE
// ============================================================
export interface Employee {
  id: string
  tenant_id: string
  employee_code: string
  department_id: string | null
  designation_id: string | null
  manager_id: string | null
  join_date: string
  date_of_birth: string | null
  gender: string | null
  employment_type: string
  work_location: string | null
  shift_id: string | null
  created_at: string
  updated_at: string
  // Joined
  profile?: Profile
  department?: Department
  designation?: Designation
  shift?: Shift
  manager?: Profile
}

// ============================================================
// SHIFT & GEOFENCE
// ============================================================
export interface Shift {
  id: string
  tenant_id: string
  name: string
  start_time: string
  end_time: string
  break_minutes: number
  is_default: boolean
  created_at: string
}

export interface Geofence {
  id: string
  tenant_id: string
  name: string
  lat: number
  lng: number
  radius_m: number
  is_active: boolean
  created_at: string
}

// ============================================================
// ATTENDANCE
// ============================================================
export interface AttendanceRecord {
  id: string
  tenant_id: string
  employee_id: string
  date: string
  clock_in_at: string | null
  clock_out_at: string | null
  status: AttendanceStatus
  method: AttendanceMethod | null
  clock_in_selfie_url: string | null
  clock_out_selfie_url: string | null
  clock_in_lat: number | null
  clock_in_lng: number | null
  clock_out_lat: number | null
  clock_out_lng: number | null
  geofence_id: string | null
  geofence_valid: boolean | null
  work_minutes: number | null
  break_minutes: number
  notes: string | null
  offline_id: string | null
  sync_status: OfflineSyncStatus
  created_at: string
  updated_at: string
  // Joined
  employee?: Employee
}

export interface AttendanceCorrection {
  id: string
  tenant_id: string
  attendance_id: string | null
  employee_id: string
  requested_clock_in: string | null
  requested_clock_out: string | null
  reason: string
  status: LeaveStatus
  reviewed_by: string | null
  reviewed_at: string | null
  reviewer_note: string | null
  created_at: string
  // Joined
  employee?: Profile
  reviewer?: Profile
}

// ============================================================
// LEAVE
// ============================================================
export interface LeaveType {
  id: string
  tenant_id: string
  name: string
  code: string
  days_per_year: number
  is_paid: boolean
  requires_proof: boolean
  carry_forward: boolean
  max_carry_days: number
  color: string
  created_at: string
}

export interface LeaveBalance {
  id: string
  tenant_id: string
  employee_id: string
  leave_type_id: string
  year: number
  entitled_days: number
  used_days: number
  pending_days: number
  carried_days: number
  created_at: string
  updated_at: string
  // Joined
  leave_type?: LeaveType
}

export interface Leave {
  id: string
  tenant_id: string
  employee_id: string
  leave_type_id: string
  start_date: string
  end_date: string
  total_days: number
  reason: string
  attachment_url: string | null
  status: LeaveStatus
  applied_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  reviewer_note: string | null
  is_draft: boolean
  offline_id: string | null
  sync_status: OfflineSyncStatus
  created_at: string
  updated_at: string
  // Joined
  employee?: Profile
  leave_type?: LeaveType
  reviewer?: Profile
}

// ============================================================
// HOLIDAY
// ============================================================
export interface Holiday {
  id: string
  tenant_id: string
  name: string
  date: string
  is_optional: boolean
  created_at: string
}

// ============================================================
// PERFORMANCE
// ============================================================
export interface PerformanceCycle {
  id: string
  tenant_id: string
  name: string
  start_date: string
  end_date: string
  self_review_deadline: string | null
  manager_review_deadline: string | null
  status: ReviewCycleStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Goal {
  id: string
  tenant_id: string
  cycle_id: string
  employee_id: string
  assigned_by: string | null
  title: string
  description: string | null
  target_metric: string | null
  target_value: number | null
  actual_value: number | null
  weight: number
  status: string
  due_date: string | null
  created_at: string
  updated_at: string
}

export interface SelfReview {
  id: string
  tenant_id: string
  cycle_id: string
  employee_id: string
  answers: Array<{ question: string; answer: string; rating?: number }>
  overall_rating: number | null
  comments: string | null
  submitted_at: string | null
  is_submitted: boolean
  created_at: string
  updated_at: string
}

export interface ManagerReview {
  id: string
  tenant_id: string
  cycle_id: string
  employee_id: string
  reviewer_id: string
  ai_draft: string | null
  ai_drafted_at: string | null
  final_summary: string | null
  overall_rating: number | null
  ratings: Record<string, number>
  strengths: string | null
  improvements: string | null
  is_submitted: boolean
  submitted_at: string | null
  shared_with_employee: boolean
  created_at: string
  updated_at: string
  // Joined
  employee?: Profile
  reviewer?: Profile
}

// ============================================================
// RECOGNITION
// ============================================================
export interface RecognitionCategory {
  id: string
  tenant_id: string
  name: string
  icon: string
  points: number
  color: string
  is_active: boolean
  created_at: string
}

export interface RecognitionEvent {
  id: string
  tenant_id: string
  giver_id: string
  receiver_id: string
  category_id: string
  points: number
  note: string | null
  is_public: boolean
  created_at: string
  // Joined
  giver?: Profile
  receiver?: Profile
  category?: RecognitionCategory
}

export interface RecognitionBadge {
  id: string
  tenant_id: string
  employee_id: string
  name: string
  description: string | null
  icon: string
  earned_at: string
  milestone: string | null
}

export interface LeaderboardEntry {
  tenant_id: string
  employee_id: string
  full_name: string
  avatar_url: string | null
  total_points: number
  recognitions_received: number
  rank: number
}

// ============================================================
// NOTIFICATIONS
// ============================================================
export interface Notification {
  id: string
  tenant_id: string
  user_id: string
  type: NotificationType
  title: string
  body: string
  deep_link: string | null
  data: Record<string, unknown>
  is_read: boolean
  read_at: string | null
  created_at: string
}

export interface PushToken {
  id: string
  user_id: string
  tenant_id: string
  endpoint: string
  p256dh: string
  auth_key: string
  user_agent: string | null
  created_at: string
}

// ============================================================
// CASES
// ============================================================
export interface Case {
  id: string
  tenant_id: string
  case_number: number
  subject: string
  category: string
  priority: CasePriority
  status: CaseStatus
  reporter_id: string
  assignee_id: string | null
  sla_due_at: string | null
  resolved_at: string | null
  closed_at: string | null
  offline_id: string | null
  sync_status: OfflineSyncStatus
  created_at: string
  updated_at: string
  // Joined
  reporter?: Profile
  assignee?: Profile
}

export interface CaseMessage {
  id: string
  tenant_id: string
  case_id: string
  sender_id: string
  body: string
  is_internal: boolean
  created_at: string
  // Joined
  sender?: Profile
}

export interface CaseAttachment {
  id: string
  tenant_id: string
  case_id: string
  message_id: string | null
  storage_url: string
  file_name: string
  file_size: number | null
  mime_type: string | null
  uploaded_by: string
  created_at: string
}

// ============================================================
// ANNOUNCEMENTS
// ============================================================
export interface Announcement {
  id: string
  tenant_id: string
  title: string
  body: string
  cta_label: string | null
  cta_url: string | null
  banner_image_url: string | null
  target_roles: UserRole[]
  starts_at: string
  ends_at: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// ATTRITION RISK
// ============================================================
export interface AttritionRiskScore {
  id: string
  tenant_id: string
  employee_id: string
  score: number
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH'
  factors: Record<string, unknown>
  computed_at: string
  // Joined
  employee?: Profile
}

// ============================================================
// AUDIT LOG
// ============================================================
export interface AuditLogEntry {
  id: string
  tenant_id: string | null
  actor_id: string | null
  action: string
  table_name: string | null
  record_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
  // Joined
  actor?: Profile
}

// ============================================================
// OFFLINE WRITE QUEUE (client-side model matching IndexedDB)
// ============================================================
export interface OfflineQueueItem {
  id: string                    // Client UUID
  entityType: 'attendance' | 'leave' | 'case'
  action: 'create' | 'update'
  payload: Record<string, unknown>
  status: OfflineSyncStatus
  errorMessage?: string
  createdAt: string
  syncedAt?: string
  /** Sync attempts so far. Drives exponential backoff. */
  attempts?: number
  /** ISO timestamp before which this item should not be retried. */
  nextAttemptAt?: string
  /** Set when the item is dead-lettered so the UI can surface it. */
  permanentFailure?: boolean
}

// ============================================================
// COMBINED AUTH STATE
// ============================================================
export interface AuthUser {
  id: string
  email: string
  profile: Profile
  role: UserRole
  tenant: Tenant
}

// ============================================================
// API RESPONSE HELPERS
// ============================================================
export interface PaginatedResponse<T> {
  data: T[]
  count: number
  page: number
  pageSize: number
  hasMore: boolean
}
