// ============================================================
// AttendX v2 — Authoritative Auth & Admin API Contracts (Scope E.28)
// Spec: docs/specs/28_api_contracts_handoff_spec.md
// ============================================================

export type UserRole = 'SUPERADMIN' | 'ADMIN' | 'HR' | 'MANAGER' | 'EMPLOYEE'

// ------------------------------------------------------------
// 1. Standard Error Envelope
// ------------------------------------------------------------
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'SESSION_REVOKED'
  | 'ONBOARDING_REQUIRED'
  | 'ACCOUNT_DEACTIVATED'
  | 'FORBIDDEN_ROLE'
  | 'TENANT_MEMBERSHIP_REVOKED'
  | 'EMAIL_EXISTS'
  | 'SEAT_LIMIT_REACHED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_ALREADY_USED'
  | 'CSRF_DETECTED'
  | 'INTERNAL_ERROR'

export interface ApiErrorResponse {
  error: string
  code: ApiErrorCode | string
  correlation_id?: string
  retry_after?: number
  details?: Record<string, any>
}

// ------------------------------------------------------------
// 2. Authentication API Contracts
// ------------------------------------------------------------

export interface UnifiedLoginRequest {
  email: string
  password: string
}

export interface AuthUserProfile {
  id: string
  email: string
  full_name: string
  role: UserRole
  tenant_id: string
  tenant_name: string
  onboarding_completed: boolean
}

export interface UnifiedLoginResponse {
  success: true
  user: AuthUserProfile
  redirect_url: string
}

export interface LogoutResponse {
  success: true
  message: string
}

export interface FirstLoginPasswordRequest {
  new_password: string
  confirm_password: string
}

export interface FirstLoginPasswordResponse {
  success: true
  message: string
  redirect_url: string
}

export interface ForgotPasswordRequest {
  email: string
}

export interface ForgotPasswordResponse {
  success: true
  message: string
}

export interface ResetPasswordRequest {
  token: string
  new_password: string
}

export interface ResetPasswordResponse {
  success: true
  message: string
}

// ------------------------------------------------------------
// 3. Multi-Tenant Switcher API Contracts
// ------------------------------------------------------------

export interface UserTenantMembership {
  tenant_id: string
  tenant_name: string
  tenant_slug: string
  role: UserRole
  is_current: boolean
}

export interface GetAvailableTenantsResponse {
  tenants: UserTenantMembership[]
  requires_selection: boolean
}

export interface TenantSwitchRequest {
  target_tenant_id: string
}

export interface TenantSwitchResponse {
  success: true
  active_tenant_id: string
  role: UserRole
  redirect_url: string
}

// ------------------------------------------------------------
// 4. Session Management API Contracts
// ------------------------------------------------------------

export interface UserSessionDevice {
  id: string
  device_name: string
  browser: string
  os: string
  ip_address: string
  city?: string | null
  country?: string | null
  last_active: string
  created_at: string
  is_current: boolean
}

export interface GetSessionsResponse {
  sessions: UserSessionDevice[]
}

export interface RevokeSessionRequest {
  sessionId: string
}

export interface RevokeSessionResponse {
  success: true
  message: string
}

// ------------------------------------------------------------
// 5. Admin Provisioning & Workforce API Contracts
// ------------------------------------------------------------

export interface AdminProvisionEmployeeRequest {
  email: string
  full_name: string
  role: UserRole
  department_id?: string
  designation_id?: string
  join_date?: string
}

export interface AdminProvisionEmployeeResponse {
  success: true
  user_id: string
  employee_code: string
  email: string
  full_name: string
  role: UserRole
  message: string
}

export interface AdminUpdateEmployeeRequest {
  is_active?: boolean
  role?: UserRole
  reason?: string
}

export interface AdminUpdateEmployeeResponse {
  success: true
  message: string
}

// ------------------------------------------------------------
// 6. Invitation Signup API Contracts
// ------------------------------------------------------------

export interface CreateInviteRequest {
  email: string
  role: UserRole
  metadata?: {
    full_name?: string
    department?: string
    [key: string]: any
  }
}

export interface CreateInviteResponse {
  success: true
  invite_url: string
  expires_at: string
}

export interface AcceptInviteRequest {
  token: string
  password: string
  full_name: string
}

export interface AcceptInviteResponse {
  success: true
  message: string
  tenant_name?: string
}
