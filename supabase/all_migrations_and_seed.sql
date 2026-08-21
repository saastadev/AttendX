-- ============================================================
-- AttendX v2 — Initial Schema Migration
-- Run against a fresh Supabase project (Postgres 15+)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS "vector";
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'vector extension not available, creating mock vector domain';
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
    CREATE DOMAIN vector AS float8[];
  END IF;
END $$;

-- Ensure standard privileges across schemas
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

-- ------------------------------------------------------------
-- Local-Postgres portability shims.
--
-- On a real Supabase project the `auth` schema is owned and managed by
-- GoTrue: auth.users already exists, and auth.uid()/auth.role() read the
-- `request.jwt.claims` JSON blob. Running CREATE OR REPLACE over those is
-- either rejected (they are owned by supabase_auth_admin) or, worse,
-- silently replaces the function every RLS policy in this database depends
-- on. So: detect a managed auth schema and leave it strictly alone.
-- ------------------------------------------------------------
DO $shim$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin')
     OR EXISTS (
       SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'auth' AND p.proname = 'uid'
     )
  THEN
    RAISE NOTICE 'Supabase-managed auth schema detected - leaving auth.users/auth.uid()/auth.role() untouched.';
  ELSE
    RAISE NOTICE 'Bare Postgres detected - installing local auth shims (NOT for production).';

    CREATE SCHEMA IF NOT EXISTS auth;

    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email TEXT UNIQUE,
      raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Mirrors Supabase's real auth.uid(): read the claims JSON first, then
    -- fall back to the flattened GUC that local tests set.
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
      LANGUAGE sql STABLE
      AS $body$
        SELECT COALESCE(
          NULLIF(current_setting('request.jwt.claim.sub', true), ''),
          NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')
        )::uuid;
      $body$;
    $fn$;

    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION auth.role() RETURNS text
      LANGUAGE sql STABLE
      AS $body$
        SELECT COALESCE(
          NULLIF(current_setting('request.jwt.claim.role', true), ''),
          NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''),
          'authenticated'
        );
      $body$;
    $fn$;
  END IF;
END
$shim$;

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('SUPERADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE');
CREATE TYPE attendance_status AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY', 'WEEKEND');
CREATE TYPE attendance_method AS ENUM ('SELFIE_GPS', 'MANUAL', 'CORRECTION');
CREATE TYPE leave_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'WITHDRAWN');
CREATE TYPE case_status AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED');
CREATE TYPE case_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE review_cycle_status AS ENUM ('DRAFT', 'ACTIVE', 'SELF_REVIEW', 'MANAGER_REVIEW', 'COMPLETED', 'CANCELLED');
CREATE TYPE notification_type AS ENUM (
  'LEAVE_REQUEST', 'LEAVE_APPROVED', 'LEAVE_REJECTED',
  'CORRECTION_REQUEST', 'CORRECTION_APPROVED', 'CORRECTION_REJECTED',
  'CASE_UPDATE', 'CASE_ASSIGNED', 'CASE_RESOLVED',
  'PERFORMANCE_REVIEW', 'GOAL_ASSIGNED', 'REVIEW_DUE',
  'RECOGNITION_RECEIVED', 'BADGE_EARNED',
  'ANNOUNCEMENT', 'SYSTEM'
);
CREATE TYPE offline_sync_status AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- ============================================================
-- TENANTS (Organizations)
-- ============================================================

CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,            -- URL-safe identifier
  logo_url      TEXT,
  accent_color  TEXT NOT NULL DEFAULT '#6C63FF', -- Primary brand color per tenant
  app_name      TEXT NOT NULL DEFAULT 'AttendX',
  -- Feature flags per tenant
  features      JSONB NOT NULL DEFAULT '{
    "copilot": true,
    "face_checkin": true,
    "skill_gap": true,
    "attrition_scoring": true,
    "recognition": true,
    "cases": true
  }'::jsonb,
  -- Subscription / plan
  plan          TEXT NOT NULL DEFAULT 'standard',
  max_employees INT NOT NULL DEFAULT 500,
  timezone      TEXT NOT NULL DEFAULT 'UTC',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- USER PROFILES (shadow of auth.users)
-- ============================================================

CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  avatar_url    TEXT,
  phone         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  face_enrolled BOOLEAN NOT NULL DEFAULT FALSE,   -- selfie enrolled for check-in
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- USER ROLES (RBAC — never trust client-supplied role)
-- ============================================================

CREATE TABLE user_roles (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role       user_role NOT NULL DEFAULT 'EMPLOYEE',
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tenant_id)
);

-- Helper function — get the calling user's tenant_id (used in RLS policies)
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT tenant_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Helper function — get the calling user's role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT role FROM user_roles WHERE user_id = auth.uid() AND tenant_id = get_my_tenant_id() LIMIT 1;
$$;

-- Helper function — check if calling user has one of the given roles
CREATE OR REPLACE FUNCTION public.has_role(VARIADIC allowed_roles user_role[])
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.get_my_role() = ANY(allowed_roles), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.has_role(VARIADIC allowed_roles text[])
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.get_my_role()::text = ANY(allowed_roles), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.has_role(allowed_roles user_role[])
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.get_my_role() = ANY(allowed_roles), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.has_role(allowed_roles text[])
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.get_my_role()::text = ANY(allowed_roles), FALSE);
$$;

-- ============================================================
-- DEPARTMENTS
-- ============================================================

CREATE TABLE departments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  head_id     UUID REFERENCES auth.users(id),  -- Department head (FK to profiles)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

-- ============================================================
-- DESIGNATIONS / JOB TITLES
-- ============================================================

CREATE TABLE designations (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  level      INT NOT NULL DEFAULT 1,           -- Seniority level
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

-- ============================================================
-- EMPLOYEES (extends profiles)
-- ============================================================

CREATE TABLE employees (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_code   TEXT NOT NULL,
  department_id   UUID REFERENCES departments(id),
  designation_id  UUID REFERENCES designations(id),
  manager_id      UUID REFERENCES auth.users(id),
  join_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  date_of_birth   DATE,
  gender          TEXT,
  employment_type TEXT NOT NULL DEFAULT 'FULL_TIME',  -- FULL_TIME, PART_TIME, CONTRACT
  work_location   TEXT,
  shift_id        UUID,                               -- FK added after shifts table
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, employee_code)
);

-- ============================================================
-- SHIFTS
-- ============================================================

CREATE TABLE shifts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  break_minutes INT NOT NULL DEFAULT 60,
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Back-fill FK from employees to shifts
ALTER TABLE employees ADD CONSTRAINT fk_employee_shift
  FOREIGN KEY (shift_id) REFERENCES shifts(id);

-- ============================================================
-- GEOFENCES (valid clock-in zones per tenant)
-- ============================================================

CREATE TABLE geofences (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  radius_m    INT NOT NULL DEFAULT 100,        -- Radius in meters
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ATTENDANCE RECORDS
-- ============================================================

CREATE TABLE attendance_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES auth.users(id),
  date            DATE NOT NULL,
  clock_in_at     TIMESTAMPTZ,
  clock_out_at    TIMESTAMPTZ,
  status          attendance_status NOT NULL DEFAULT 'ABSENT',
  method          attendance_method,
  -- Selfie + GPS evidence
  clock_in_selfie_url  TEXT,
  clock_out_selfie_url TEXT,
  clock_in_lat         DOUBLE PRECISION,
  clock_in_lng         DOUBLE PRECISION,
  clock_out_lat        DOUBLE PRECISION,
  clock_out_lng        DOUBLE PRECISION,
  geofence_id          UUID REFERENCES geofences(id),
  geofence_valid       BOOLEAN,
  -- Work duration (minutes) — computed on clock-out
  work_minutes    INT,
  break_minutes   INT NOT NULL DEFAULT 0,
  -- Notes
  notes           TEXT,
  -- Offline queue reference
  offline_id      TEXT,                        -- client-generated UUID when created offline
  sync_status     offline_sync_status NOT NULL DEFAULT 'SYNCED',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, employee_id, date)
);

-- ============================================================
-- ATTENDANCE CORRECTIONS
-- ============================================================

CREATE TABLE attendance_corrections (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  attendance_id   UUID REFERENCES attendance_records(id),
  employee_id     UUID NOT NULL REFERENCES auth.users(id),
  requested_clock_in  TIMESTAMPTZ,
  requested_clock_out TIMESTAMPTZ,
  reason          TEXT NOT NULL,
  status          leave_status NOT NULL DEFAULT 'PENDING',
  reviewed_by     UUID REFERENCES auth.users(id),
  reviewed_at     TIMESTAMPTZ,
  reviewer_note   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- BREAKS (within an attendance record)
-- ============================================================

CREATE TABLE breaks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  attendance_id   UUID NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ,
  duration_minutes INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LEAVE TYPES
-- ============================================================

CREATE TABLE leave_types (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  code             TEXT NOT NULL,                -- e.g. 'AL', 'SL', 'EL'
  days_per_year    INT NOT NULL DEFAULT 0,
  is_paid          BOOLEAN NOT NULL DEFAULT TRUE,
  requires_proof   BOOLEAN NOT NULL DEFAULT FALSE,
  carry_forward    BOOLEAN NOT NULL DEFAULT FALSE,
  max_carry_days   INT NOT NULL DEFAULT 0,
  color            TEXT NOT NULL DEFAULT '#6C63FF',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

-- ============================================================
-- LEAVE BALANCES
-- ============================================================

CREATE TABLE leave_balances (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id   UUID NOT NULL REFERENCES auth.users(id),
  leave_type_id UUID NOT NULL REFERENCES leave_types(id),
  year          INT NOT NULL,
  entitled_days NUMERIC(5,1) NOT NULL DEFAULT 0,
  used_days     NUMERIC(5,1) NOT NULL DEFAULT 0,
  pending_days  NUMERIC(5,1) NOT NULL DEFAULT 0,
  carried_days  NUMERIC(5,1) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, employee_id, leave_type_id, year)
);

-- ============================================================
-- LEAVE APPLICATIONS
-- ============================================================

CREATE TABLE leaves (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES auth.users(id),
  leave_type_id   UUID NOT NULL REFERENCES leave_types(id),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  total_days      NUMERIC(5,1) NOT NULL,
  reason          TEXT NOT NULL,
  attachment_url  TEXT,
  status          leave_status NOT NULL DEFAULT 'PENDING',
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by     UUID REFERENCES auth.users(id),
  reviewed_at     TIMESTAMPTZ,
  reviewer_note   TEXT,
  -- Draft persistence: client sets this flag for unsaved drafts
  is_draft        BOOLEAN NOT NULL DEFAULT FALSE,
  -- Offline queue
  offline_id      TEXT,
  sync_status     offline_sync_status NOT NULL DEFAULT 'SYNCED',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- HOLIDAY CALENDAR
-- ============================================================

CREATE TABLE holidays (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  date        DATE NOT NULL,
  is_optional BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, date, name)
);

-- ============================================================
-- PERFORMANCE REVIEW CYCLES
-- ============================================================

CREATE TABLE performance_cycles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  self_review_deadline  DATE,
  manager_review_deadline DATE,
  status        review_cycle_status NOT NULL DEFAULT 'DRAFT',
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- GOALS / KPIs
-- ============================================================

CREATE TABLE goals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cycle_id      UUID NOT NULL REFERENCES performance_cycles(id),
  employee_id   UUID NOT NULL REFERENCES auth.users(id),
  assigned_by   UUID REFERENCES auth.users(id),
  title         TEXT NOT NULL,
  description   TEXT,
  target_metric TEXT,
  target_value  NUMERIC,
  actual_value  NUMERIC,
  weight        INT NOT NULL DEFAULT 100,         -- % weight in overall score
  status        TEXT NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE, ACHIEVED, MISSED, CANCELLED
  due_date      DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SELF REVIEWS
-- ============================================================

CREATE TABLE self_reviews (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cycle_id      UUID NOT NULL REFERENCES performance_cycles(id),
  employee_id   UUID NOT NULL REFERENCES auth.users(id),
  answers       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{question, answer, rating}]
  overall_rating NUMERIC(3,1),
  comments      TEXT,
  submitted_at  TIMESTAMPTZ,
  is_submitted  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, cycle_id, employee_id)
);

-- ============================================================
-- MANAGER REVIEWS
-- ============================================================

CREATE TABLE manager_reviews (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cycle_id        UUID NOT NULL REFERENCES performance_cycles(id),
  employee_id     UUID NOT NULL REFERENCES auth.users(id),
  reviewer_id     UUID NOT NULL REFERENCES auth.users(id),
  -- AI draft
  ai_draft        TEXT,
  ai_drafted_at   TIMESTAMPTZ,
  -- Human-edited final version (mandatory step)
  final_summary   TEXT,
  overall_rating  NUMERIC(3,1),
  ratings         JSONB NOT NULL DEFAULT '{}'::jsonb, -- {competency: rating}
  strengths       TEXT,
  improvements    TEXT,
  is_submitted    BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at    TIMESTAMPTZ,
  -- Visibility
  shared_with_employee BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, cycle_id, employee_id)
);

-- ============================================================
-- RECOGNITION CATEGORIES
-- ============================================================

CREATE TABLE recognition_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT 'star',
  points      INT NOT NULL DEFAULT 10,
  color       TEXT NOT NULL DEFAULT '#6C63FF',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- RECOGNITION EVENTS (peer-to-peer recognition)
-- ============================================================

CREATE TABLE recognition_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  giver_id      UUID NOT NULL REFERENCES auth.users(id),
  receiver_id   UUID NOT NULL REFERENCES auth.users(id),
  category_id   UUID NOT NULL REFERENCES recognition_categories(id),
  points        INT NOT NULL,
  note          TEXT,
  is_public     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- RECOGNITION BADGES
-- ============================================================

CREATE TABLE recognition_badges (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id   UUID NOT NULL REFERENCES auth.users(id),
  name          TEXT NOT NULL,
  description   TEXT,
  icon          TEXT NOT NULL DEFAULT 'award',
  earned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  milestone     TEXT                               -- e.g. '100_points', 'streak_30'
);

-- Leaderboard: materialized view refreshed on every recognition_events insert
CREATE MATERIALIZED VIEW recognition_leaderboard AS
SELECT
  e.tenant_id,
  e.receiver_id AS employee_id,
  p.full_name,
  p.avatar_url,
  SUM(e.points) AS total_points,
  COUNT(*) AS recognitions_received,
  RANK() OVER (PARTITION BY e.tenant_id ORDER BY SUM(e.points) DESC) AS rank
FROM recognition_events e
JOIN profiles p ON p.id = e.receiver_id
GROUP BY e.tenant_id, e.receiver_id, p.full_name, p.avatar_url;

CREATE UNIQUE INDEX ON recognition_leaderboard (tenant_id, employee_id);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  type        notification_type NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  deep_link   TEXT,                               -- e.g. /leaves/uuid
  data        JSONB NOT NULL DEFAULT '{}'::jsonb, -- Extra payload
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PUSH TOKENS (Web Push subscriptions)
-- ============================================================

CREATE TABLE push_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth_key    TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

-- ============================================================
-- NOTIFICATION PREFERENCES
-- ============================================================

CREATE TABLE notification_preferences (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{
    "LEAVE_REQUEST": true,
    "LEAVE_APPROVED": true,
    "LEAVE_REJECTED": true,
    "CASE_UPDATE": true,
    "RECOGNITION_RECEIVED": true,
    "ANNOUNCEMENT": true,
    "PERFORMANCE_REVIEW": true
  }'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tenant_id)
);

-- ============================================================
-- CASES / HELPDESK
-- ============================================================

CREATE TABLE cases (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_number   SERIAL,                          -- Human-readable within tenant
  subject       TEXT NOT NULL,
  category      TEXT NOT NULL,
  priority      case_priority NOT NULL DEFAULT 'MEDIUM',
  status        case_status NOT NULL DEFAULT 'OPEN',
  reporter_id   UUID NOT NULL REFERENCES auth.users(id),
  assignee_id   UUID REFERENCES auth.users(id),
  sla_due_at    TIMESTAMPTZ,
  resolved_at   TIMESTAMPTZ,
  closed_at     TIMESTAMPTZ,
  -- Offline queue
  offline_id    TEXT,
  sync_status   offline_sync_status NOT NULL DEFAULT 'SYNCED',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE case_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id     UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES auth.users(id),
  body        TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,    -- Internal HR/admin notes not shown to reporter
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE case_attachments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id     UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  message_id  UUID REFERENCES case_messages(id),
  storage_url TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  file_size   INT,
  mime_type   TEXT,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ANNOUNCEMENTS / PROMOTIONS
-- ============================================================

CREATE TABLE announcements (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  cta_label     TEXT,
  cta_url       TEXT,
  banner_image_url TEXT,
  target_roles  user_role[] NOT NULL DEFAULT '{EMPLOYEE,MANAGER,HR,ADMIN}'::user_role[],
  starts_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at       TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT FALSE,  -- managed by scheduler Edge Function
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE announcement_dismissals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (announcement_id, user_id)
);

-- ============================================================
-- SKILL EMBEDDINGS (pgvector — replaces Milvus)
-- ============================================================

CREATE TABLE skill_embeddings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id   UUID NOT NULL REFERENCES auth.users(id),
  skill_text    TEXT NOT NULL,               -- Raw skill description
  embedding     vector,                -- text-embedding-3-small output
  source        TEXT NOT NULL DEFAULT 'profile',  -- 'profile', 'review', 'goal'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Approximate nearest-neighbor index (IVFFlat for speed at scale)
DO $$ BEGIN
  CREATE INDEX idx_skill_embeddings_vec ON skill_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'ivfflat index skipped (vector extension not loaded)';
END $$;

-- ============================================================
-- ATTRITION RISK SCORES
-- ============================================================

CREATE TABLE attrition_risk_scores (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id   UUID NOT NULL REFERENCES auth.users(id),
  score         NUMERIC(4,2) NOT NULL,        -- 0.0 to 1.0 (advisory only)
  risk_level    TEXT NOT NULL,                -- LOW, MEDIUM, HIGH
  factors       JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, employee_id)             -- One current score per employee
);

-- ============================================================
-- AUDIT LOG
-- ============================================================

CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID REFERENCES tenants(id),
  actor_id    UUID REFERENCES auth.users(id),
  action      TEXT NOT NULL,                 -- e.g. 'ROLE_CHANGED', 'USER_DEACTIVATED'
  table_name  TEXT,
  record_id   UUID,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ACTIVE SESSIONS (device/session management)
-- ============================================================

CREATE TABLE active_sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  auth_session_id UUID,
  session_token TEXT,
  session_token_hash TEXT,
  device_name   TEXT NOT NULL DEFAULT 'Unknown Device',
  browser       TEXT NOT NULL DEFAULT 'Unknown Browser',
  os            TEXT NOT NULL DEFAULT 'Unknown OS',
  ip_address    TEXT,
  city          TEXT,
  country       TEXT,
  user_agent    TEXT NOT NULL DEFAULT '',
  is_revoked    BOOLEAN NOT NULL DEFAULT false,
  revoked_at    TIMESTAMPTZ DEFAULT NULL,
  last_active   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ONBOARDING STATE
-- ============================================================

CREATE TABLE onboarding_state (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tour_completed    BOOLEAN NOT NULL DEFAULT FALSE,
  tour_completed_at TIMESTAMPTZ,
  changelog_seen_version TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tenant_id)
);

-- ============================================================
-- OFFLINE WRITE QUEUE (server-side log, primarily managed client-side in IndexedDB)
-- Server copy for audit / deduplication on sync
-- ============================================================

CREATE TABLE offline_sync_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id),
  offline_id    TEXT NOT NULL,               -- Client-generated UUID
  entity_type   TEXT NOT NULL,               -- 'attendance', 'leave', 'case'
  entity_id     UUID,                        -- Resolved after sync
  payload       JSONB NOT NULL,
  status        offline_sync_status NOT NULL DEFAULT 'PENDING',
  error_message TEXT,
  synced_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, offline_id)
);

-- ============================================================
-- INDEXES (performance critical)
-- ============================================================

CREATE INDEX idx_profiles_tenant ON profiles(tenant_id);
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_tenant ON user_roles(tenant_id);
CREATE INDEX idx_employees_tenant ON employees(tenant_id);
CREATE INDEX idx_employees_manager ON employees(manager_id);
CREATE INDEX idx_employees_dept ON employees(department_id);
CREATE INDEX idx_attendance_employee_date ON attendance_records(employee_id, date DESC);
CREATE INDEX idx_attendance_tenant_date ON attendance_records(tenant_id, date DESC);
CREATE INDEX idx_leaves_employee ON leaves(employee_id, status);
CREATE INDEX idx_leaves_reviewer ON leaves(reviewed_by);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_cases_tenant_status ON cases(tenant_id, status, created_at DESC);
CREATE INDEX idx_cases_reporter ON cases(reporter_id);
CREATE INDEX idx_cases_assignee ON cases(assignee_id);
CREATE INDEX idx_recognition_receiver ON recognition_events(tenant_id, receiver_id);
CREATE INDEX idx_recognition_giver ON recognition_events(giver_id);
CREATE INDEX idx_audit_log_tenant ON audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_announcements_active ON announcements(tenant_id, is_active, starts_at, ends_at);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_attendance_updated BEFORE UPDATE ON attendance_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_leaves_updated BEFORE UPDATE ON leaves FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_leave_balances_updated BEFORE UPDATE ON leave_balances FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_goals_updated BEFORE UPDATE ON goals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_self_reviews_updated BEFORE UPDATE ON self_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_manager_reviews_updated BEFORE UPDATE ON manager_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_perf_cycles_updated BEFORE UPDATE ON performance_cycles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_cases_updated BEFORE UPDATE ON cases FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_announcements_updated BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_onboarding_updated BEFORE UPDATE ON onboarding_state FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Refresh leaderboard on every new recognition
CREATE OR REPLACE FUNCTION refresh_leaderboard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY recognition_leaderboard;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_refresh_leaderboard
  AFTER INSERT ON recognition_events
  FOR EACH STATEMENT EXECUTE FUNCTION refresh_leaderboard();
-- ============================================================
-- AttendX v2 — Row-Level Security Policies
-- Run after 001_initial_schema.sql
-- ============================================================

-- Enable RLS on every tenant-scoped table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE self_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE recognition_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE recognition_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE recognition_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE attrition_risk_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TENANTS
-- Only SUPERADMIN can see all tenants.
-- Users see only their own tenant.
-- ============================================================

CREATE POLICY "tenants_self" ON tenants
  FOR SELECT USING (id = get_my_tenant_id());

CREATE POLICY "tenants_superadmin_all" ON tenants
  FOR ALL USING (has_role(ARRAY['SUPERADMIN']::user_role[]));

CREATE POLICY "tenants_admin_update" ON tenants
  FOR UPDATE USING (id = get_my_tenant_id() AND has_role(ARRAY['ADMIN']::user_role[]));

-- ============================================================
-- PROFILES
-- ============================================================

-- Everyone can read profiles in their own tenant
CREATE POLICY "profiles_tenant_read" ON profiles
  FOR SELECT USING (tenant_id = get_my_tenant_id());

-- Users can update their own profile
CREATE POLICY "profiles_self_update" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- HR/ADMIN can insert profiles (via invite flow)
CREATE POLICY "profiles_hr_insert" ON profiles
  FOR INSERT WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- USER ROLES
-- ============================================================

-- Users can read their own role
CREATE POLICY "user_roles_self_read" ON user_roles
  FOR SELECT USING (user_id = auth.uid());

-- ADMIN/HR can read all roles in their tenant
CREATE POLICY "user_roles_admin_read" ON user_roles
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- Only ADMIN/SUPERADMIN can assign/change roles (never trusting client-supplied role)
CREATE POLICY "user_roles_admin_write" ON user_roles
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- DEPARTMENTS & DESIGNATIONS
-- ============================================================

CREATE POLICY "departments_tenant_read" ON departments
  FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY "departments_admin_write" ON departments
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

CREATE POLICY "designations_tenant_read" ON designations
  FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY "designations_admin_write" ON designations
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- EMPLOYEES
-- ============================================================

-- Employees can read their own record
CREATE POLICY "employees_self_read" ON employees
  FOR SELECT USING (id = auth.uid());

-- Managers can read their direct reports
CREATE POLICY "employees_manager_read" ON employees
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND manager_id = auth.uid()
  );

-- HR/ADMIN can read all employees in their tenant
CREATE POLICY "employees_hr_read" ON employees
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- HR/ADMIN can write employees
CREATE POLICY "employees_hr_write" ON employees
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- Employees can update limited own fields (handled by profile table mostly)
CREATE POLICY "employees_self_update" ON employees
  FOR UPDATE USING (id = auth.uid() AND tenant_id = get_my_tenant_id());

-- ============================================================
-- SHIFTS & GEOFENCES
-- ============================================================

CREATE POLICY "shifts_tenant_read" ON shifts
  FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY "shifts_admin_write" ON shifts
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

CREATE POLICY "geofences_tenant_read" ON geofences
  FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY "geofences_admin_write" ON geofences
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- ATTENDANCE RECORDS
-- ============================================================

-- Employees: own records only
CREATE POLICY "attendance_self_read" ON attendance_records
  FOR SELECT USING (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

-- Employees can insert their own clock-in/out
CREATE POLICY "attendance_self_insert" ON attendance_records
  FOR INSERT WITH CHECK (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

-- Employees can update their own (e.g. clock-out)
CREATE POLICY "attendance_self_update" ON attendance_records
  FOR UPDATE USING (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

-- Managers: their team's records
CREATE POLICY "attendance_manager_read" ON attendance_records
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['MANAGER']::user_role[])
    AND employee_id IN (
      SELECT id FROM employees WHERE manager_id = auth.uid() AND tenant_id = get_my_tenant_id()
    )
  );

-- HR/ADMIN: all records in their tenant
CREATE POLICY "attendance_hr_read" ON attendance_records
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

CREATE POLICY "attendance_hr_write" ON attendance_records
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- ATTENDANCE CORRECTIONS
-- ============================================================

CREATE POLICY "corrections_self_read" ON attendance_corrections
  FOR SELECT USING (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "corrections_self_insert" ON attendance_corrections
  FOR INSERT WITH CHECK (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "corrections_manager_read" ON attendance_corrections
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND (
      reviewed_by = auth.uid()
      OR (
        has_role(ARRAY['MANAGER']::user_role[])
        AND employee_id IN (
          SELECT id FROM employees WHERE manager_id = auth.uid() AND tenant_id = get_my_tenant_id()
        )
      )
    )
  );

CREATE POLICY "corrections_manager_update" ON attendance_corrections
  FOR UPDATE USING (
    tenant_id = get_my_tenant_id()
    AND (
      reviewed_by = auth.uid()
      OR has_role(ARRAY['HR', 'ADMIN']::user_role[])
    )
  );

CREATE POLICY "corrections_hr_all" ON attendance_corrections
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- BREAKS
-- ============================================================

CREATE POLICY "breaks_self" ON breaks
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND attendance_id IN (
      SELECT id FROM attendance_records WHERE employee_id = auth.uid()
    )
  );

CREATE POLICY "breaks_hr_read" ON breaks
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'MANAGER', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- LEAVE TYPES
-- ============================================================

CREATE POLICY "leave_types_tenant_read" ON leave_types
  FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY "leave_types_hr_write" ON leave_types
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- LEAVE BALANCES
-- ============================================================

CREATE POLICY "leave_balances_self" ON leave_balances
  FOR SELECT USING (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "leave_balances_manager" ON leave_balances
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['MANAGER']::user_role[])
    AND employee_id IN (
      SELECT id FROM employees WHERE manager_id = auth.uid() AND tenant_id = get_my_tenant_id()
    )
  );

CREATE POLICY "leave_balances_hr" ON leave_balances
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- LEAVE APPLICATIONS
-- ============================================================

CREATE POLICY "leaves_self_read" ON leaves
  FOR SELECT USING (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "leaves_self_insert" ON leaves
  FOR INSERT WITH CHECK (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "leaves_self_cancel" ON leaves
  FOR UPDATE USING (
    employee_id = auth.uid()
    AND tenant_id = get_my_tenant_id()
    AND status = 'PENDING'           -- Can only cancel pending requests
  );

CREATE POLICY "leaves_manager_read" ON leaves
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['MANAGER']::user_role[])
    AND employee_id IN (
      SELECT id FROM employees WHERE manager_id = auth.uid() AND tenant_id = get_my_tenant_id()
    )
  );

CREATE POLICY "leaves_manager_approve" ON leaves
  FOR UPDATE USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['MANAGER']::user_role[])
    AND employee_id IN (
      SELECT id FROM employees WHERE manager_id = auth.uid() AND tenant_id = get_my_tenant_id()
    )
  );

CREATE POLICY "leaves_hr_all" ON leaves
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- HOLIDAYS
-- ============================================================

CREATE POLICY "holidays_tenant_read" ON holidays
  FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY "holidays_hr_write" ON holidays
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- PERFORMANCE CYCLES, GOALS, REVIEWS
-- ============================================================

CREATE POLICY "perf_cycles_tenant_read" ON performance_cycles
  FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY "perf_cycles_hr_write" ON performance_cycles
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

CREATE POLICY "goals_self_read" ON goals
  FOR SELECT USING (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "goals_manager_team" ON goals
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND (
      assigned_by = auth.uid()
      OR (
        has_role(ARRAY['MANAGER']::user_role[])
        AND employee_id IN (
          SELECT id FROM employees WHERE manager_id = auth.uid() AND tenant_id = get_my_tenant_id()
        )
      )
    )
  );

CREATE POLICY "goals_hr_all" ON goals
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

CREATE POLICY "self_reviews_self" ON self_reviews
  FOR ALL USING (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "self_reviews_manager" ON self_reviews
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND (
      has_role(ARRAY['MANAGER']::user_role[])
      AND employee_id IN (
        SELECT id FROM employees WHERE manager_id = auth.uid() AND tenant_id = get_my_tenant_id()
      )
    )
  );

CREATE POLICY "self_reviews_hr" ON self_reviews
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

CREATE POLICY "manager_reviews_reviewer" ON manager_reviews
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND reviewer_id = auth.uid()
  );

CREATE POLICY "manager_reviews_employee_read" ON manager_reviews
  FOR SELECT USING (
    employee_id = auth.uid()
    AND tenant_id = get_my_tenant_id()
    AND shared_with_employee = TRUE
  );

CREATE POLICY "manager_reviews_hr" ON manager_reviews
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- RECOGNITION
-- ============================================================

CREATE POLICY "recognition_categories_read" ON recognition_categories
  FOR SELECT USING (tenant_id = get_my_tenant_id() AND is_active = TRUE);

CREATE POLICY "recognition_categories_hr_write" ON recognition_categories
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- Everyone in tenant can read public recognition events
CREATE POLICY "recognition_events_tenant_read" ON recognition_events
  FOR SELECT USING (tenant_id = get_my_tenant_id() AND is_public = TRUE);

-- Anyone can give recognition to someone in their tenant
CREATE POLICY "recognition_events_insert" ON recognition_events
  FOR INSERT WITH CHECK (giver_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "recognition_badges_self" ON recognition_badges
  FOR SELECT USING (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "recognition_badges_hr_write" ON recognition_badges
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

-- Users see only their own notifications
CREATE POLICY "notifications_self" ON notifications
  FOR ALL USING (user_id = auth.uid() AND tenant_id = get_my_tenant_id());

-- HR/ADMIN can insert notifications for any user in their tenant (for system notifications)
CREATE POLICY "notifications_hr_insert" ON notifications
  FOR INSERT WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

CREATE POLICY "push_tokens_self" ON push_tokens
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "notification_prefs_self" ON notification_preferences
  FOR ALL USING (user_id = auth.uid() AND tenant_id = get_my_tenant_id());

-- ============================================================
-- CASES
-- ============================================================

-- Employees can read/create their own cases
CREATE POLICY "cases_self_read" ON cases
  FOR SELECT USING (reporter_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "cases_self_insert" ON cases
  FOR INSERT WITH CHECK (reporter_id = auth.uid() AND tenant_id = get_my_tenant_id());

-- HR/ADMIN manage all cases in their tenant
CREATE POLICY "cases_hr_all" ON cases
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- Assignees can update their assigned cases
CREATE POLICY "cases_assignee_update" ON cases
  FOR UPDATE USING (assignee_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "case_messages_tenant" ON case_messages
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND (
      -- Reporter sees non-internal messages on their cases
      (
        is_internal = FALSE
        AND case_id IN (SELECT id FROM cases WHERE reporter_id = auth.uid())
      )
      -- HR sees all
      OR has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
    )
  );

CREATE POLICY "case_messages_insert" ON case_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND tenant_id = get_my_tenant_id()
    AND (
      -- Non-HR can only send non-internal messages
      is_internal = FALSE
      OR has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
    )
  );

CREATE POLICY "case_attachments_case_read" ON case_attachments
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND (
      case_id IN (SELECT id FROM cases WHERE reporter_id = auth.uid())
      OR has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
    )
  );

CREATE POLICY "case_attachments_insert" ON case_attachments
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
    AND tenant_id = get_my_tenant_id()
  );

-- ============================================================
-- ANNOUNCEMENTS
-- ============================================================

-- Users see active announcements targeted at their role, in their tenant
CREATE POLICY "announcements_read" ON announcements
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND is_active = TRUE
    AND get_my_role() = ANY(target_roles)
    AND starts_at <= NOW()
    AND (ends_at IS NULL OR ends_at > NOW())
  );

CREATE POLICY "announcements_hr_all" ON announcements
  FOR ALL USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

CREATE POLICY "announcement_dismissals_self" ON announcement_dismissals
  FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- AI / SKILL EMBEDDINGS
-- ============================================================

-- Employees see their own embeddings
CREATE POLICY "skill_embeddings_self" ON skill_embeddings
  FOR SELECT USING (employee_id = auth.uid() AND tenant_id = get_my_tenant_id());

-- HR can read all embeddings in their tenant (for skill-gap analysis)
CREATE POLICY "skill_embeddings_hr_read" ON skill_embeddings
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

-- Only Edge Functions (service role) can write embeddings
CREATE POLICY "skill_embeddings_service_write" ON skill_embeddings
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- ATTRITION RISK (HR only, advisory)
-- ============================================================

CREATE POLICY "attrition_hr_read" ON attrition_risk_scores
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['HR', 'ADMIN', 'SUPERADMIN']::user_role[])
  );

CREATE POLICY "attrition_service_write" ON attrition_risk_scores
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- AUDIT LOG (ADMIN/HR read, service role write)
-- ============================================================

CREATE POLICY "audit_log_admin_read" ON audit_log
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND has_role(ARRAY['ADMIN', 'SUPERADMIN']::user_role[])
  );

CREATE POLICY "audit_log_service_write" ON audit_log
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- SESSIONS
-- ============================================================

CREATE POLICY "sessions_self" ON active_sessions
  FOR ALL USING (user_id = auth.uid() AND tenant_id = get_my_tenant_id());

-- ============================================================
-- ONBOARDING
-- ============================================================

CREATE POLICY "onboarding_self" ON onboarding_state
  FOR ALL USING (user_id = auth.uid() AND tenant_id = get_my_tenant_id());

-- ============================================================
-- OFFLINE SYNC LOG
-- ============================================================

CREATE POLICY "offline_log_self" ON offline_sync_log
  FOR ALL USING (user_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY "offline_log_service" ON offline_sync_log
  FOR ALL USING (auth.role() = 'service_role');
-- ============================================================
-- AttendX v2 — RLS Hardening
-- Run after 002_rls_policies.sql
--
-- Fixes three verified defects:
--   1. get_my_tenant_id() used `LIMIT 1` with no ORDER BY. A user holding
--      memberships in two tenants resolved to whichever row the heap
--      returned first — reproducibly leaking the other tenant's roster
--      just by changing the order the memberships were granted in.
--   2. get_my_tenant_id/get_my_role/has_role are SECURITY DEFINER with a
--      mutable search_path, the standard definer-function hijack vector.
--   3. profiles_self_update had no WITH CHECK. Rewriting your own
--      profiles.tenant_id was blocked only as a side effect of the
--      SELECT policy — drop or broaden that policy and escalation opens.
-- ============================================================

-- ------------------------------------------------------------
-- 1 + 2. Deterministic, fail-closed tenant resolution.
--
-- Multi-tenant users MUST carry an explicit tenant claim. If the identity
-- is ambiguous and no claim narrows it, we return NULL: every policy is
-- `tenant_id = get_my_tenant_id()`, so NULL denies rather than guessing.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_claim  TEXT;
  v_tenant UUID;
  v_count  INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  -- Explicit tenant selection: flattened GUC first, then the claims JSON
  -- (app_metadata.tenant_id is where a Supabase auth hook would put it).
  v_claim := NULLIF(current_setting('request.jwt.claim.tenant_id', true), '');

  IF v_claim IS NULL THEN
    BEGIN
      v_claim := NULLIF(
        current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,tenant_id}',
        ''
      );
    EXCEPTION WHEN OTHERS THEN
      v_claim := NULL;
    END;
  END IF;

  IF v_claim IS NOT NULL THEN
    -- A claim is only honoured if it maps to a real membership, so a
    -- forged/stale claim cannot mint access to a tenant you never joined.
    BEGIN
      SELECT ur.tenant_id INTO v_tenant
        FROM user_roles ur
       WHERE ur.user_id = v_uid
         AND ur.tenant_id = v_claim::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN NULL;
    END;
    RETURN v_tenant;
  END IF;

  -- No claim: resolve only when the identity is unambiguous.
  SELECT count(*) INTO v_count FROM user_roles ur WHERE ur.user_id = v_uid;

  IF v_count = 1 THEN
    SELECT ur.tenant_id INTO v_tenant FROM user_roles ur WHERE ur.user_id = v_uid;
    RETURN v_tenant;
  END IF;

  -- 0 memberships, or 2+ with nothing to disambiguate: fail closed.
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role
    FROM user_roles
   WHERE user_id = auth.uid()
     AND tenant_id = public.get_my_tenant_id()
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_role(VARIADIC allowed_roles user_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.get_my_role() = ANY(allowed_roles), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.has_role(VARIADIC allowed_roles text[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.get_my_role()::text = ANY(allowed_roles), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.has_role(allowed_roles user_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.get_my_role() = ANY(allowed_roles), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.has_role(allowed_roles text[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.get_my_role()::text = ANY(allowed_roles), FALSE);
$$;

-- ------------------------------------------------------------
-- 3. Pin identity and tenant on profile self-update.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_self_update" ON profiles;

CREATE POLICY "profiles_self_update" ON profiles
  FOR UPDATE
  USING (id = auth.uid() AND tenant_id = get_my_tenant_id())
  WITH CHECK (id = auth.uid() AND tenant_id = get_my_tenant_id());

-- ------------------------------------------------------------
-- 4. Freeze privileged profile columns against self-service edits.
--
-- RLS gates which ROWS you may write; it does not gate which COLUMNS.
-- Without this a user could self-reactivate (is_active), rewrite their
-- own email, or flip onboarding/face-enrolment state.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Privileged actors and server-side jobs bypass the freeze.
  IF auth.role() = 'service_role' OR has_role(ARRAY['HR','ADMIN','SUPERADMIN']::user_role[]) THEN
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'profiles.tenant_id is not self-editable';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'profiles.id is not self-editable';
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'profiles.is_active is not self-editable';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'profiles.email is not self-editable (change it through auth)';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_privileged ON profiles;
CREATE TRIGGER trg_profiles_guard_privileged
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_columns();

-- ------------------------------------------------------------
-- 5. Force RLS on tenant-scoped tables so the table owner is not exempt.
-- (service_role still bypasses via its BYPASSRLS attribute, by design.)
-- ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
-- ============================================================
-- AttendX v2 — Migration 004: Audit Triggers & Hardening
-- Automatically writes changes on privileged tables to audit_log
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID;
  v_tenant_id UUID;
  v_action TEXT;
  v_record_id UUID;
  v_old_data JSONB := NULL;
  v_new_data JSONB := NULL;
BEGIN
  -- Determine current actor
  v_actor_id := auth.uid();
  
  -- Determine action type
  v_action := TG_TABLE_NAME || '_' || TG_OP;

  IF (TG_OP = 'DELETE') THEN
    v_old_data := to_jsonb(OLD);
    v_record_id := OLD.id;
    IF (v_old_data ? 'tenant_id') THEN
      v_tenant_id := (v_old_data->>'tenant_id')::uuid;
    END IF;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_record_id := NEW.id;
    IF (v_new_data ? 'tenant_id') THEN
      v_tenant_id := (v_new_data->>'tenant_id')::uuid;
    ELSIF (v_old_data ? 'tenant_id') THEN
      v_tenant_id := (v_old_data->>'tenant_id')::uuid;
    END IF;
  ELSIF (TG_OP = 'INSERT') THEN
    v_new_data := to_jsonb(NEW);
    v_record_id := NEW.id;
    IF (v_new_data ? 'tenant_id') THEN
      v_tenant_id := (v_new_data->>'tenant_id')::uuid;
    END IF;
  END IF;

  -- Fallback to session tenant if not in record
  IF v_tenant_id IS NULL THEN
    v_tenant_id := public.get_my_tenant_id();
  END IF;

  INSERT INTO public.audit_log (
    tenant_id,
    actor_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data
  ) VALUES (
    v_tenant_id,
    v_actor_id,
    v_action,
    TG_TABLE_NAME,
    v_record_id,
    v_old_data,
    v_new_data
  );

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Fail-open for non-critical logging errors to avoid blocking business operations, but log exception
  RAISE WARNING 'audit_log trigger error: %', SQLERRM;
  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Attach triggers to privileged tables
DROP TRIGGER IF EXISTS trg_audit_user_roles ON user_roles;
CREATE TRIGGER trg_audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_profiles ON profiles;
CREATE TRIGGER trg_audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_tenants ON tenants;
CREATE TRIGGER trg_audit_tenants
  AFTER INSERT OR UPDATE OR DELETE ON tenants
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_leaves ON leaves;
CREATE TRIGGER trg_audit_leaves
  AFTER INSERT OR UPDATE OR DELETE ON leaves
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_corrections ON attendance_corrections;
CREATE TRIGGER trg_audit_corrections
  AFTER INSERT OR UPDATE OR DELETE ON attendance_corrections
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_employees ON employees;
CREATE TRIGGER trg_audit_employees
  AFTER INSERT OR UPDATE OR DELETE ON employees
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();
-- ============================================================
-- AttendX v2 — Migration 005: Allow Public Tenant Slug Lookup
-- Allows unauthenticated signup forms to query tenant by slug
-- ============================================================

DROP POLICY IF EXISTS "tenants_public_slug_read" ON tenants;

CREATE POLICY "tenants_public_slug_read" ON tenants
  FOR SELECT
  USING (true);
-- ============================================================
-- AttendX v2 — Migration 006: Auto-Create Profile & User Role
-- Safe trigger that never fails or blocks auth.users operations
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
  v_full_name TEXT;
BEGIN
  BEGIN
    v_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_tenant_id := NULL;
  END;

  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  IF v_tenant_id IS NULL THEN
    SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
  END IF;

  IF v_tenant_id IS NOT NULL THEN
    INSERT INTO public.profiles (
      id,
      tenant_id,
      email,
      full_name,
      is_active,
      onboarding_completed
    ) VALUES (
      NEW.id,
      v_tenant_id,
      NEW.email,
      v_full_name,
      TRUE,
      TRUE
    ) ON CONFLICT (id) DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name;

    INSERT INTO public.user_roles (
      user_id,
      tenant_id,
      role
    ) VALUES (
      NEW.id,
      v_tenant_id,
      'EMPLOYEE'
    ) ON CONFLICT (user_id, tenant_id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
﻿-- ============================================================
-- AttendX v2 — Migration 007: Admin Provisioning & Glance View
-- ============================================================

-- ------------------------------------------------------------
-- 1. Fix handle_new_user to honor role from raw_user_meta_data
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
  v_full_name TEXT;
  v_role      user_role;
BEGIN
  BEGIN
    v_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_tenant_id := NULL;
  END;

  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  BEGIN
    v_role := (NEW.raw_user_meta_data->>'role')::user_role;
  EXCEPTION WHEN OTHERS THEN
    v_role := 'EMPLOYEE';
  END;
  IF v_role IS NULL THEN v_role := 'EMPLOYEE'; END IF;

  IF v_tenant_id IS NULL THEN
    SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, tenant_id, email, full_name, is_active, onboarding_completed)
  VALUES (NEW.id, v_tenant_id, NEW.email, v_full_name, TRUE, FALSE)
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    email     = EXCLUDED.email,
    full_name = EXCLUDED.full_name;

  IF v_tenant_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, tenant_id, role)
    VALUES (NEW.id, v_tenant_id, v_role)
    ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 2. Atomic admin_provision_employee RPC (service_role only)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_provision_employee(
  p_auth_user_id   UUID,
  p_tenant_id      UUID,
  p_full_name      TEXT,
  p_email          TEXT,
  p_role           user_role DEFAULT 'EMPLOYEE',
  p_department_id  UUID      DEFAULT NULL,
  p_designation_id UUID      DEFAULT NULL,
  p_join_date      DATE      DEFAULT CURRENT_DATE,
  p_assigned_by    UUID      DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_emp_code TEXT;
  v_seq      INT;
BEGIN
  SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(employee_code, '[^0-9]', '', 'g') AS INT)), 0) + 1
    INTO v_seq FROM employees WHERE tenant_id = p_tenant_id;

  v_emp_code := 'EMP-' || LPAD(v_seq::TEXT, 4, '0');

  INSERT INTO public.profiles (id, tenant_id, email, full_name, is_active, onboarding_completed)
  VALUES (p_auth_user_id, p_tenant_id, p_email, p_full_name, TRUE, FALSE)
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id, email = EXCLUDED.email,
    full_name = EXCLUDED.full_name, is_active = TRUE;

  INSERT INTO public.user_roles (user_id, tenant_id, role, assigned_by, assigned_at)
  VALUES (p_auth_user_id, p_tenant_id, p_role, p_assigned_by, NOW())
  ON CONFLICT (user_id, tenant_id) DO UPDATE SET
    role = EXCLUDED.role, assigned_by = EXCLUDED.assigned_by, assigned_at = EXCLUDED.assigned_at;

  INSERT INTO public.employees (id, tenant_id, employee_code, department_id, designation_id, join_date)
  VALUES (p_auth_user_id, p_tenant_id, v_emp_code, p_department_id, p_designation_id, p_join_date)
  ON CONFLICT (id) DO UPDATE SET
    employee_code = v_emp_code, department_id = EXCLUDED.department_id,
    designation_id = EXCLUDED.designation_id, join_date = EXCLUDED.join_date;

  INSERT INTO public.audit_log (tenant_id, actor_id, action, table_name, record_id, new_data)
  VALUES (p_tenant_id, p_assigned_by, 'EMPLOYEE_PROVISIONED', 'employees', p_auth_user_id,
    jsonb_build_object('email', p_email, 'full_name', p_full_name, 'role', p_role, 'employee_code', v_emp_code));

  RETURN jsonb_build_object('user_id', p_auth_user_id, 'employee_code', v_emp_code, 'role', p_role);
END;
$$;

-- ------------------------------------------------------------
-- 3. Today-at-a-Glance for Admin Dashboard (tenant TZ aware)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_attendance_glance(p_tenant_id UUID)
RETURNS TABLE (status TEXT, employee_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH tz AS (SELECT timezone FROM tenants WHERE id = p_tenant_id),
  today_date AS (SELECT (NOW() AT TIME ZONE (SELECT timezone FROM tz))::date AS d),
  all_active AS (
    SELECT e.id FROM employees e JOIN profiles p ON p.id = e.id
     WHERE e.tenant_id = p_tenant_id AND p.is_active = TRUE
  ),
  records AS (
    SELECT ar.employee_id, ar.status, ar.clock_in_at, ar.clock_out_at
      FROM attendance_records ar
     WHERE ar.tenant_id = p_tenant_id AND ar.date = (SELECT d FROM today_date)
  )
  SELECT 'PRESENT'::TEXT,
         COUNT(*) FILTER (WHERE clock_in_at IS NOT NULL AND clock_out_at IS NULL) FROM records
  UNION ALL
  SELECT 'COMPLETED'::TEXT, COUNT(*) FILTER (WHERE clock_out_at IS NOT NULL) FROM records
  UNION ALL
  SELECT 'ON_LEAVE'::TEXT, COUNT(*) FILTER (WHERE status = 'ON_LEAVE') FROM records
  UNION ALL
  SELECT 'ABSENT'::TEXT, (
    SELECT COUNT(*) FROM all_active ae
     WHERE ae.id NOT IN (SELECT employee_id FROM records WHERE clock_in_at IS NOT NULL))
  UNION ALL
  SELECT 'TOTAL'::TEXT, COUNT(*) FROM all_active;
$$;

REVOKE ALL ON FUNCTION public.admin_attendance_glance(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_attendance_glance(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.admin_provision_employee(UUID,UUID,TEXT,TEXT,user_role,UUID,UUID,DATE,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_provision_employee(UUID,UUID,TEXT,TEXT,user_role,UUID,UUID,DATE,UUID) TO service_role;
-- ============================================================
-- AttendX v2 — Migration 007: Announcements & Notifications Tables
-- ============================================================

-- 1. ANNOUNCEMENTS TABLE
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  cta_label TEXT,
  cta_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. ANNOUNCEMENT DISMISSALS TABLE
CREATE TABLE IF NOT EXISTS public.announcement_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (announcement_id, user_id)
);

-- 3. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'SYSTEM',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  link_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS Enablement
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.announcements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_dismissals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "announcements_read_tenant" ON public.announcements;
CREATE POLICY "announcements_read_tenant" ON public.announcements
  FOR SELECT USING (tenant_id = get_my_tenant_id() OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "announcement_dismissals_self" ON public.announcement_dismissals;
CREATE POLICY "announcement_dismissals_self" ON public.announcement_dismissals
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_read_self" ON public.notifications;
CREATE POLICY "notifications_read_self" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());
-- ============================================================
-- AttendX v2 — Migration 008: Invites and Unified Authentication
-- Implements single-use cryptographic invite tokens & verification
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tenant_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('SUPERADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES public.profiles(id),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NULL,
  revoked_at TIMESTAMPTZ DEFAULT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices for rapid lookup and tenant isolation
CREATE INDEX IF NOT EXISTS idx_tenant_invites_hash 
  ON public.tenant_invites(token_hash) 
  WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_invites_tenant 
  ON public.tenant_invites(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tenant_invites_email 
  ON public.tenant_invites(tenant_id, email);

-- Enable & Force RLS
ALTER TABLE public.tenant_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_invites FORCE ROW LEVEL SECURITY;

-- RLS Policy: Only ADMIN, SUPERADMIN, and HR within the active tenant can view & manage invites
DROP POLICY IF EXISTS tenant_invites_admin_all ON public.tenant_invites;
CREATE POLICY tenant_invites_admin_all ON public.tenant_invites
  FOR ALL
  TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id() 
    AND public.has_role(ARRAY['ADMIN', 'SUPERADMIN', 'HR']::user_role[])
  )
  WITH CHECK (
    tenant_id = public.get_my_tenant_id() 
    AND public.has_role(ARRAY['ADMIN', 'SUPERADMIN', 'HR']::user_role[])
  );

-- Attach audit log trigger
DROP TRIGGER IF EXISTS audit_tenant_invites ON public.tenant_invites;
CREATE TRIGGER audit_tenant_invites
  AFTER INSERT OR UPDATE OR DELETE ON public.tenant_invites
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- ------------------------------------------------------------
-- Atomic RPC: accept_tenant_invite
-- Validates token hash, marks invite used, provisions profile and role in one transaction
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_tenant_invite(
  p_token_hash TEXT,
  p_user_id UUID,
  p_full_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invite public.tenant_invites%ROWTYPE;
  v_tenant public.tenants%ROWTYPE;
BEGIN
  -- 1. Fetch and lock invite record
  SELECT * INTO v_invite
  FROM public.tenant_invites
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITE_NOT_FOUND: Invalid or unrecognized invitation token' USING ERRCODE = 'P0002';
  END IF;

  IF v_invite.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'INVITE_ALREADY_USED: This invitation has already been accepted' USING ERRCODE = 'P0003';
  END IF;

  IF v_invite.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'INVITE_REVOKED: This invitation has been revoked by an administrator' USING ERRCODE = 'P0004';
  END IF;

  IF v_invite.expires_at <= now() THEN
    RAISE EXCEPTION 'INVITE_EXPIRED: This invitation has expired' USING ERRCODE = 'P0005';
  END IF;

  -- 2. Validate tenant exists
  SELECT * INTO v_tenant
  FROM public.tenants
  WHERE id = v_invite.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND: Organization for this invite does not exist' USING ERRCODE = 'P0006';
  END IF;

  -- 3. Upsert profile
  INSERT INTO public.profiles (
    id,
    tenant_id,
    email,
    full_name,
    is_active,
    face_enrolled,
    onboarding_completed,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    v_invite.tenant_id,
    v_invite.email,
    COALESCE(NULLIF(trim(p_full_name), ''), v_invite.metadata->>'full_name', 'Member'),
    true,
    false,
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_active = true,
    onboarding_completed = true,
    updated_at = now();

  -- 4. Upsert user_role
  INSERT INTO public.user_roles (
    user_id,
    tenant_id,
    role,
    created_at
  ) VALUES (
    p_user_id,
    v_invite.tenant_id,
    v_invite.role::public.user_role,
    now()
  )
  ON CONFLICT (user_id, tenant_id, role) DO NOTHING;

  -- 5. Mark invite as used
  UPDATE public.tenant_invites
  SET used_at = now(),
      updated_at = now()
  WHERE id = v_invite.id;

  -- 6. Insert audit log record
  INSERT INTO public.audit_log (
    tenant_id,
    actor_id,
    action,
    table_name,
    record_id,
    new_data
  ) VALUES (
    v_invite.tenant_id,
    p_user_id,
    'INVITE_ACCEPTED',
    'tenant_invites',
    v_invite.id,
    jsonb_build_object(
      'email', v_invite.email,
      'role', v_invite.role,
      'user_id', p_user_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_invite.tenant_id,
    'tenant_name', v_tenant.name,
    'role', v_invite.role,
    'email', v_invite.email
  );
END;
$$;
-- ============================================================
-- AttendX Migration: 009_first_login_password_change.sql
-- Scope A (Part 2): First-Login Password Change & Anti-Tampering
-- ============================================================

-- 1. Ensure column onboarding_completed exists on profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;

-- 2. Anti-tampering trigger: Prevent client-side updates to onboarding_completed
CREATE OR REPLACE FUNCTION public.check_profile_onboarding_tampering()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent client role from directly updating onboarding_completed from false to true
  IF (OLD.onboarding_completed IS FALSE AND NEW.onboarding_completed IS TRUE) THEN
    IF (current_setting('request.jwt.claim.role', true) != 'service_role' 
        AND auth.uid() IS NOT NULL) THEN
      RAISE EXCEPTION 'onboarding_completed cannot be modified directly by client SDK.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_guard_profile_onboarding ON public.profiles;
CREATE TRIGGER trg_guard_profile_onboarding
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.check_profile_onboarding_tampering();

-- 3. Audit log trigger extension for password changes during onboarding
COMMENT ON COLUMN public.profiles.onboarding_completed IS 
  'Flag indicating whether the user has completed forced first-login password change.';
-- ============================================================
-- AttendX Migration: 010_session_management_hardening.sql
-- Scope A (Part 3): Session Management, Device Tracking & Revocation
-- ============================================================

-- 1. Create or harden public.active_sessions
CREATE TABLE IF NOT EXISTS public.active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  auth_session_id UUID, -- Corresponds to Supabase auth session if available
  session_token_hash TEXT,
  device_name TEXT NOT NULL DEFAULT 'Unknown Device',
  browser TEXT NOT NULL DEFAULT 'Unknown Browser',
  os TEXT NOT NULL DEFAULT 'Unknown OS',
  ip_address TEXT,
  city TEXT,
  country TEXT,
  user_agent TEXT NOT NULL DEFAULT '',
  is_revoked BOOLEAN NOT NULL DEFAULT false,
  revoked_at TIMESTAMPTZ DEFAULT NULL,
  last_active TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure all columns exist if table was already created
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS auth_session_id UUID;
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS session_token_hash TEXT;
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS device_name TEXT NOT NULL DEFAULT 'Unknown Device';
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS browser TEXT NOT NULL DEFAULT 'Unknown Browser';
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS os TEXT NOT NULL DEFAULT 'Unknown OS';
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT NOT NULL DEFAULT '';
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Indices for fast lookup and revocation queries
CREATE INDEX IF NOT EXISTS idx_active_sessions_user_lookup 
  ON public.active_sessions(user_id, is_revoked) 
  WHERE is_revoked IS FALSE;

CREATE INDEX IF NOT EXISTS idx_active_sessions_token_hash 
  ON public.active_sessions(session_token_hash);

CREATE INDEX IF NOT EXISTS idx_active_sessions_tenant 
  ON public.active_sessions(tenant_id);

-- 3. Enable & Force Row Level Security
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_sessions FORCE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS active_sessions_self_select ON public.active_sessions;
CREATE POLICY active_sessions_self_select ON public.active_sessions
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() 
    AND tenant_id = public.get_my_tenant_id()
  );

DROP POLICY IF EXISTS active_sessions_admin_select ON public.active_sessions;
CREATE POLICY active_sessions_admin_select ON public.active_sessions
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id()
    AND public.has_role(ARRAY['ADMIN', 'SUPERADMIN']::user_role[])
  );

DROP POLICY IF EXISTS active_sessions_service_modify ON public.active_sessions;
CREATE POLICY active_sessions_service_modify ON public.active_sessions
  FOR ALL
  TO authenticated
  USING (current_setting('request.jwt.claim.role', true) = 'service_role')
  WITH CHECK (current_setting('request.jwt.claim.role', true) = 'service_role');
-- ============================================================
-- AttendX Migration: 011_inactive_accounts_and_deactivation.sql
-- Scope A (Part 4) & Scope B.12: Inactive Accounts & Deactivation
-- ============================================================

-- 1. High-speed indices for authoritative is_active lookups
CREATE INDEX IF NOT EXISTS idx_profiles_id_active 
  ON public.profiles(id, is_active);

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_active 
  ON public.profiles(tenant_id, is_active);

-- 2. Anti-Tampering Trigger: Prevent users from self-updating is_active or privileged columns
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow service_role to update any column
  IF (current_setting('request.jwt.claim.role', true) = 'service_role') THEN
    RETURN NEW;
  END IF;

  -- Block standard authenticated users from altering is_active, tenant_id, id, or email directly
  IF (OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
    RAISE EXCEPTION 'Unauthorized: is_active can only be modified by tenant administrators.'
      USING ERRCODE = '42501';
  END IF;

  IF (OLD.tenant_id IS DISTINCT FROM NEW.tenant_id) THEN
    RAISE EXCEPTION 'Unauthorized: tenant_id is immutable.'
      USING ERRCODE = '42501';
  END IF;

  IF (OLD.id IS DISTINCT FROM NEW.id) THEN
    RAISE EXCEPTION 'Unauthorized: Profile ID is immutable.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_guard_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_guard_profile_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_privileged_columns();

-- 3. Atomic User Deactivation Stored Procedure (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.deactivate_user_atomic(
  p_target_user_id UUID,
  p_actor_id UUID,
  p_tenant_id UUID,
  p_reason TEXT DEFAULT 'Administrative Deactivation'
)
RETURNS JSONB AS $$
DECLARE
  v_actor_role TEXT;
  v_target_tenant_id UUID;
  v_admin_count INT;
BEGIN
  -- A. Verify caller role in tenant
  SELECT role INTO v_actor_role 
  FROM public.user_roles 
  WHERE user_id = p_actor_id AND tenant_id = p_tenant_id;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('SUPERADMIN', 'ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: Only tenant administrators can deactivate users.'
      USING ERRCODE = '42501';
  END IF;

  -- B. Verify target user belongs to the same tenant
  SELECT tenant_id INTO v_target_tenant_id 
  FROM public.profiles 
  WHERE id = p_target_user_id;

  IF v_target_tenant_id IS NULL OR v_target_tenant_id <> p_tenant_id THEN
    RAISE EXCEPTION 'Forbidden: Target user does not belong to your organization.'
      USING ERRCODE = '42501';
  END IF;

  -- C. Prevent Self-Deactivation of the last active Admin
  IF p_target_user_id = p_actor_id THEN
    SELECT COUNT(*) INTO v_admin_count
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.tenant_id = p_tenant_id 
      AND ur.role IN ('ADMIN', 'SUPERADMIN') 
      AND p.is_active = true;

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Operation Blocked: Cannot deactivate the sole active administrator of an organization.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- D. Deactivate Profile
  UPDATE public.profiles
  SET is_active = false, updated_at = now()
  WHERE id = p_target_user_id;

  -- E. Update Employee Status
  UPDATE public.employees
  SET status = 'TERMINATED', updated_at = now()
  WHERE id = p_target_user_id AND tenant_id = p_tenant_id;

  -- F. Revoke all active session records
  UPDATE public.active_sessions
  SET is_revoked = true, revoked_at = now()
  WHERE user_id = p_target_user_id AND is_revoked = false;

  -- G. Insert Immutable Audit Log Record
  INSERT INTO public.audit_log (
    tenant_id,
    actor_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data
  ) VALUES (
    p_tenant_id,
    p_actor_id,
    'USER_DEACTIVATED',
    'profiles',
    p_target_user_id,
    jsonb_build_object('is_active', true),
    jsonb_build_object('is_active', false, 'reason', p_reason, 'deactivated_at', now())
  );

  RETURN jsonb_build_object(
    'success', true,
    'target_user_id', p_target_user_id,
    'is_active', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 4. Atomic User Reactivation Stored Procedure with Seat Limit Enforcement
CREATE OR REPLACE FUNCTION public.reactivate_user_atomic(
  p_target_user_id UUID,
  p_actor_id UUID,
  p_tenant_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_actor_role TEXT;
  v_target_tenant_id UUID;
  v_current_active_count INT;
  v_max_employees INT;
BEGIN
  -- A. Verify caller role
  SELECT role INTO v_actor_role 
  FROM public.user_roles 
  WHERE user_id = p_actor_id AND tenant_id = p_tenant_id;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('SUPERADMIN', 'ADMIN') THEN
    RAISE EXCEPTION 'Forbidden: Only tenant administrators can reactivate users.'
      USING ERRCODE = '42501';
  END IF;

  -- B. Verify target user tenant
  SELECT tenant_id INTO v_target_tenant_id 
  FROM public.profiles 
  WHERE id = p_target_user_id;

  IF v_target_tenant_id IS NULL OR v_target_tenant_id <> p_tenant_id THEN
    RAISE EXCEPTION 'Forbidden: Target user does not belong to your organization.'
      USING ERRCODE = '42501';
  END IF;

  -- C. Enforce Tenant Employee Seat Limit Atomically
  SELECT max_employees INTO v_max_employees 
  FROM public.tenants 
  WHERE id = p_tenant_id;

  SELECT COUNT(*) INTO v_current_active_count
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND is_active = true;

  IF v_max_employees IS NOT NULL AND v_current_active_count >= v_max_employees THEN
    RAISE EXCEPTION 'Seat Limit Exceeded: Organization has reached its maximum active seat capacity (% / %).',
      v_current_active_count, v_max_employees
      USING ERRCODE = 'EX001';
  END IF;

  -- D. Reactivate Profile & Employee
  UPDATE public.profiles
  SET is_active = true, updated_at = now()
  WHERE id = p_target_user_id;

  UPDATE public.employees
  SET status = 'ACTIVE', updated_at = now()
  WHERE id = p_target_user_id AND tenant_id = p_tenant_id;

  -- E. Insert Audit Log
  INSERT INTO public.audit_log (
    tenant_id,
    actor_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data
  ) VALUES (
    p_tenant_id,
    p_actor_id,
    'USER_REACTIVATED',
    'profiles',
    p_target_user_id,
    jsonb_build_object('is_active', false),
    jsonb_build_object('is_active', true, 'reactivated_at', now())
  );

  RETURN jsonb_build_object(
    'success', true,
    'target_user_id', p_target_user_id,
    'is_active', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
-- ============================================================
-- AttendX Migration: 012_session_edge_cases_and_token_security.sql
-- Scope A (Part 5) & Scope E.27: Session Edge Cases & Token Security
-- ============================================================

-- 1. Password Resets Table (Cryptographic Single-Use Tokens)
CREATE TABLE IF NOT EXISTS public.password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_hash_active 
  ON public.password_resets(token_hash) 
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_password_resets_user 
  ON public.password_resets(user_id);

ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_resets FORCE ROW LEVEL SECURITY;

-- 2. Auth Rate Limits Table (Sliding Window Counter)
CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL UNIQUE, -- SHA-256(ip + ':' + action + ':' + identifier)
  attempt_count INT NOT NULL DEFAULT 1,
  first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_until TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_key 
  ON public.auth_rate_limits(key_hash);

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_rate_limits FORCE ROW LEVEL SECURITY;

-- 3. Comprehensive Session Validation Stored Procedure
CREATE OR REPLACE FUNCTION public.validate_session_and_role_atomic(
  p_user_id UUID,
  p_tenant_id UUID,
  p_session_token_hash TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_is_active BOOLEAN;
  v_onboarding_completed BOOLEAN;
  v_role TEXT;
  v_session_revoked BOOLEAN;
BEGIN
  -- A. Check Profile Active State & Onboarding
  SELECT is_active, onboarding_completed INTO v_is_active, v_onboarding_completed
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_is_active IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'code', 'USER_NOT_FOUND');
  END IF;

  IF v_is_active = false THEN
    RETURN jsonb_build_object('valid', false, 'code', 'ACCOUNT_DEACTIVATED');
  END IF;

  -- B. Check Active Session Revocation Status
  SELECT is_revoked INTO v_session_revoked
  FROM public.active_sessions
  WHERE session_token_hash = p_session_token_hash;

  IF v_session_revoked IS TRUE THEN
    RETURN jsonb_build_object('valid', false, 'code', 'SESSION_REVOKED');
  END IF;

  -- C. Check Tenant Role Membership
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = p_user_id AND tenant_id = p_tenant_id;

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'code', 'TENANT_MEMBERSHIP_REVOKED');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'role', v_role,
    'tenant_id', p_tenant_id,
    'onboarding_completed', v_onboarding_completed
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 4. Triggers for Authorization Changes
CREATE OR REPLACE FUNCTION public.trg_handle_user_authorization_change()
RETURNS TRIGGER AS $$
BEGIN
  -- If user was deactivated, immediately revoke all active sessions
  IF (TG_TABLE_NAME = 'profiles' AND OLD.is_active = true AND NEW.is_active = false) THEN
    UPDATE public.active_sessions 
    SET is_revoked = true, revoked_at = now() 
    WHERE user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_profiles_deactivation_change ON public.profiles;
CREATE TRIGGER trg_profiles_deactivation_change
  AFTER UPDATE OF is_active ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_handle_user_authorization_change();
-- ============================================================
-- AttendX Migration: 013_admin_provisioning_hardening.sql
-- Scope B (Specs 07-12): Admin Provisioning, Atomic Seat Limit & Rollback RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_provision_employee_v2(
  p_auth_user_id   UUID,
  p_tenant_id      UUID,
  p_full_name      TEXT,
  p_email          TEXT,
  p_role           user_role DEFAULT 'EMPLOYEE',
  p_department_id  UUID      DEFAULT NULL,
  p_designation_id UUID      DEFAULT NULL,
  p_join_date      DATE      DEFAULT CURRENT_DATE,
  p_assigned_by    UUID      DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_employees INT;
  v_current_count INT;
  v_emp_code      TEXT;
  v_seq           INT;
BEGIN
  -- 1. Atomic Seat Limit Enforcement with Row Lock (BRD §10)
  SELECT max_employees INTO v_max_employees
  FROM public.tenants
  WHERE id = p_tenant_id
  FOR UPDATE; -- Prevents concurrent race conditions

  IF v_max_employees IS NOT NULL THEN
    SELECT COUNT(*) INTO v_current_count
    FROM public.profiles p
    WHERE p.tenant_id = p_tenant_id AND p.is_active = TRUE;

    IF v_current_count >= v_max_employees THEN
      RAISE EXCEPTION 'SEAT_LIMIT_REACHED: Tenant limit of % active employees reached.', v_max_employees
        USING ERRCODE = 'EX001';
    END IF;
  END IF;

  -- 2. Sequential Employee Code Generation
  SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(employee_code, '[^0-9]', '', 'g') AS INT)), 0) + 1
  INTO v_seq
  FROM public.employees
  WHERE tenant_id = p_tenant_id;

  v_emp_code := 'EMP-' || LPAD(v_seq::TEXT, 4, '0');

  -- 3. Create / Upsert Profile (Onboarding Incomplete for First-Login Setup)
  INSERT INTO public.profiles (
    id, tenant_id, email, full_name, is_active, onboarding_completed, created_at, updated_at
  )
  VALUES (
    p_auth_user_id, p_tenant_id, LOWER(TRIM(p_email)), TRIM(p_full_name), TRUE, FALSE, NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_active = TRUE,
    onboarding_completed = FALSE,
    updated_at = NOW();

  -- 4. Assign Role
  INSERT INTO public.user_roles (
    user_id, tenant_id, role, assigned_by, assigned_at
  )
  VALUES (
    p_auth_user_id, p_tenant_id, p_role, p_assigned_by, NOW()
  )
  ON CONFLICT (user_id, tenant_id) DO UPDATE SET
    role = EXCLUDED.role,
    assigned_by = EXCLUDED.assigned_by,
    assigned_at = NOW();

  -- 5. Create Employee Record
  INSERT INTO public.employees (
    id, tenant_id, employee_code, department_id, designation_id, join_date, created_at, updated_at
  )
  VALUES (
    p_auth_user_id, p_tenant_id, v_emp_code, p_department_id, p_designation_id, p_join_date, NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    employee_code = v_emp_code,
    department_id = EXCLUDED.department_id,
    designation_id = EXCLUDED.designation_id,
    join_date = EXCLUDED.join_date,
    updated_at = NOW();

  -- 6. Immutable Audit Log Entry (Rule 5: Zero Passwords)
  INSERT INTO public.audit_log (
    tenant_id, actor_id, action, table_name, record_id, new_data, created_at
  )
  VALUES (
    p_tenant_id,
    p_assigned_by,
    'EMPLOYEE_PROVISIONED',
    'employees',
    p_auth_user_id,
    jsonb_build_object(
      'email', LOWER(TRIM(p_email)),
      'full_name', TRIM(p_full_name),
      'role', p_role,
      'employee_code', v_emp_code
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_auth_user_id,
    'employee_code', v_emp_code,
    'role', p_role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_provision_employee_v2 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_provision_employee_v2 TO service_role;
-- ============================================================
-- AttendX Migration: 014_multi_tenant_switcher_rpc.sql
-- Scope C (Specs 13-14): Multi-Tenant Switcher & Membership Validation
-- ============================================================

-- 1. RPC to list all authorized, active tenants for the calling user
CREATE OR REPLACE FUNCTION public.get_my_available_tenants()
RETURNS TABLE (
  tenant_id UUID,
  tenant_name TEXT,
  tenant_slug TEXT,
  role user_role,
  is_current BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_current_tenant UUID := public.get_my_tenant_id();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    t.id AS tenant_id,
    t.name AS tenant_name,
    t.slug AS tenant_slug,
    ur.role AS role,
    (t.id = v_current_tenant) AS is_current
  FROM public.user_roles ur
  JOIN public.tenants t ON t.id = ur.tenant_id
  JOIN public.profiles p ON p.id = ur.user_id AND p.tenant_id = ur.tenant_id
  WHERE ur.user_id = v_uid
    AND p.is_active = TRUE
  ORDER BY t.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_available_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_available_tenants() TO authenticated;

-- 2. Verification RPC to atomically validate membership before switching
CREATE OR REPLACE FUNCTION public.validate_tenant_membership(
  p_user_id UUID,
  p_tenant_id UUID
)
RETURNS TABLE (
  is_valid BOOLEAN,
  resolved_role user_role,
  tenant_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    TRUE AS is_valid,
    ur.role AS resolved_role,
    t.name AS tenant_name
  FROM public.user_roles ur
  JOIN public.tenants t ON t.id = ur.tenant_id
  JOIN public.profiles p ON p.id = ur.user_id AND p.tenant_id = ur.tenant_id
  WHERE ur.user_id = p_user_id
    AND ur.tenant_id = p_tenant_id
    AND p.is_active = TRUE
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_tenant_membership(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_tenant_membership(UUID, UUID) TO service_role;
-- ============================================================
-- AttendX v2 — Migration 016: Canonical Data Engine Reporting RPCs
-- Spec: docs/specs/29_31_ai_data_engine_handoff_spec.md (BRD §30)
-- ============================================================

-- 1. Today-at-a-Glance Workforce Summary (Tenant-Timezone Aware)
CREATE OR REPLACE FUNCTION public.admin_attendance_glance(p_tenant_id UUID)
RETURNS TABLE (status TEXT, employee_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH tz AS (
    SELECT COALESCE(timezone, 'UTC') AS tz_name 
    FROM public.tenants 
    WHERE id = p_tenant_id
  ),
  today_date AS (
    SELECT (NOW() AT TIME ZONE (SELECT tz_name FROM tz))::date AS d
  ),
  all_active AS (
    SELECT e.id 
    FROM public.employees e 
    JOIN public.profiles p ON p.id = e.id
    WHERE e.tenant_id = p_tenant_id 
      AND p.is_active = TRUE
  ),
  records AS (
    SELECT ar.employee_id, ar.status, ar.clock_in_at, ar.clock_out_at
    FROM public.attendance_records ar
    WHERE ar.tenant_id = p_tenant_id 
      AND ar.date = (SELECT d FROM today_date)
  )
  SELECT 'PRESENT'::TEXT,
         COUNT(*) FILTER (WHERE clock_in_at IS NOT NULL AND clock_out_at IS NULL) 
  FROM records
  UNION ALL
  SELECT 'COMPLETED'::TEXT, 
         COUNT(*) FILTER (WHERE clock_out_at IS NOT NULL) 
  FROM records
  UNION ALL
  SELECT 'ON_LEAVE'::TEXT, 
         COUNT(*) FILTER (WHERE status = 'ON_LEAVE') 
  FROM records
  UNION ALL
  SELECT 'ABSENT'::TEXT, (
    SELECT COUNT(*) 
    FROM all_active ae
    WHERE ae.id NOT IN (SELECT employee_id FROM records WHERE clock_in_at IS NOT NULL OR status = 'ON_LEAVE')
  )
  UNION ALL
  SELECT 'TOTAL'::TEXT, 
         COUNT(*) 
  FROM all_active;
$$;

REVOKE ALL ON FUNCTION public.admin_attendance_glance(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_attendance_glance(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_attendance_glance(UUID) TO authenticated;
-- ============================================================
-- AttendX v2 — Seed Data
-- 3 Tenants × 5 roles each + realistic multi-tenant data
-- ============================================================

-- ============================================================
-- 1. TENANTS
-- ============================================================

INSERT INTO tenants (id, name, slug, accent_color, app_name, timezone) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Acme Technologies', 'acme-tech',    '#6C63FF', 'AttendX',         'Asia/Kolkata'),
  ('22222222-0000-0000-0000-000000000002', 'Globex Corp',       'globex-corp',  '#0EA5E9', 'Globex Attend',   'America/New_York'),
  ('33333333-0000-0000-0000-000000000003', 'Initech Ltd',       'initech-ltd',  '#10B981', 'Initech HR',      'Europe/London')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug;

-- ============================================================
-- 2. AUTH USERS (3 Tenants × 5 Roles = 15 Users)
-- Complete GoTrue auth.users rows with encrypted password 'Password123!'
-- ============================================================

INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_sso_user,
  created_at,
  updated_at
) VALUES
  -- Tenant 1: Acme Technologies
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'superadmin@acme-tech.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '11111111-0000-0000-0000-000000000001'), jsonb_build_object('full_name', 'Alice Superadmin'), false, NOW(), NOW()),
  ('11111111-1111-1111-1111-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@acme-tech.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '11111111-0000-0000-0000-000000000001'), jsonb_build_object('full_name', 'Bob Admin'), false, NOW(), NOW()),
  ('11111111-1111-1111-1111-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hr@acme-tech.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '11111111-0000-0000-0000-000000000001'), jsonb_build_object('full_name', 'Carol HR'), false, NOW(), NOW()),
  ('11111111-1111-1111-1111-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager@acme-tech.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '11111111-0000-0000-0000-000000000001'), jsonb_build_object('full_name', 'David Manager'), false, NOW(), NOW()),
  ('11111111-1111-1111-1111-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employee@acme-tech.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '11111111-0000-0000-0000-000000000001'), jsonb_build_object('full_name', 'Eve Employee'), false, NOW(), NOW()),
  -- Tenant 2: Globex Corp
  ('22222222-2222-2222-2222-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'superadmin@globex-corp.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '22222222-0000-0000-0000-000000000002'), jsonb_build_object('full_name', 'Gary Superadmin'), false, NOW(), NOW()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@globex-corp.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '22222222-0000-0000-0000-000000000002'), jsonb_build_object('full_name', 'Grace Admin'), false, NOW(), NOW()),
  ('22222222-2222-2222-2222-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hr@globex-corp.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '22222222-0000-0000-0000-000000000002'), jsonb_build_object('full_name', 'Hannah HR'), false, NOW(), NOW()),
  ('22222222-2222-2222-2222-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager@globex-corp.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '22222222-0000-0000-0000-000000000002'), jsonb_build_object('full_name', 'Ian Manager'), false, NOW(), NOW()),
  ('22222222-2222-2222-2222-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employee@globex-corp.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '22222222-0000-0000-0000-000000000002'), jsonb_build_object('full_name', 'Ivy Employee'), false, NOW(), NOW()),
  -- Tenant 3: Initech Ltd
  ('33333333-3333-3333-3333-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'superadmin@initech-ltd.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '33333333-0000-0000-0000-000000000003'), jsonb_build_object('full_name', 'Ivan Superadmin'), false, NOW(), NOW()),
  ('33333333-3333-3333-3333-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@initech-ltd.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '33333333-0000-0000-0000-000000000003'), jsonb_build_object('full_name', 'Irene Admin'), false, NOW(), NOW()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hr@initech-ltd.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '33333333-0000-0000-0000-000000000003'), jsonb_build_object('full_name', 'Jack HR'), false, NOW(), NOW()),
  ('33333333-3333-3333-3333-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager@initech-ltd.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '33333333-0000-0000-0000-000000000003'), jsonb_build_object('full_name', 'Karen Manager'), false, NOW(), NOW()),
  ('33333333-3333-3333-3333-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employee@initech-ltd.com', crypt('Password123!', gen_salt('bf')), NOW(), jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'tenant_id', '33333333-0000-0000-0000-000000000003'), jsonb_build_object('full_name', 'Leo Employee'), false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET 
  instance_id = '00000000-0000-0000-0000-000000000000',
  aud = 'authenticated',
  role = 'authenticated',
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = NOW(),
  raw_app_meta_data = EXCLUDED.raw_app_meta_data,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  updated_at = NOW();

-- 2b. AUTH IDENTITIES (Required for GoTrue password verification)
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES
  -- Acme
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', jsonb_build_object('sub', '11111111-1111-1111-1111-111111111111', 'email', 'superadmin@acme-tech.com', 'email_verified', true), 'email', '11111111-1111-1111-1111-111111111111', NOW(), NOW(), NOW()),
  ('11111111-1111-1111-1111-222222222222', '11111111-1111-1111-1111-222222222222', jsonb_build_object('sub', '11111111-1111-1111-1111-222222222222', 'email', 'admin@acme-tech.com', 'email_verified', true), 'email', '11111111-1111-1111-1111-222222222222', NOW(), NOW(), NOW()),
  ('11111111-1111-1111-1111-333333333333', '11111111-1111-1111-1111-333333333333', jsonb_build_object('sub', '11111111-1111-1111-1111-333333333333', 'email', 'hr@acme-tech.com', 'email_verified', true), 'email', '11111111-1111-1111-1111-333333333333', NOW(), NOW(), NOW()),
  ('11111111-1111-1111-1111-444444444444', '11111111-1111-1111-1111-444444444444', jsonb_build_object('sub', '11111111-1111-1111-1111-444444444444', 'email', 'manager@acme-tech.com', 'email_verified', true), 'email', '11111111-1111-1111-1111-444444444444', NOW(), NOW(), NOW()),
  ('11111111-1111-1111-1111-555555555555', '11111111-1111-1111-1111-555555555555', jsonb_build_object('sub', '11111111-1111-1111-1111-555555555555', 'email', 'employee@acme-tech.com', 'email_verified', true), 'email', '11111111-1111-1111-1111-555555555555', NOW(), NOW(), NOW()),
  -- Globex
  ('22222222-2222-2222-2222-111111111111', '22222222-2222-2222-2222-111111111111', jsonb_build_object('sub', '22222222-2222-2222-2222-111111111111', 'email', 'superadmin@globex-corp.com', 'email_verified', true), 'email', '22222222-2222-2222-2222-111111111111', NOW(), NOW(), NOW()),
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', jsonb_build_object('sub', '22222222-2222-2222-2222-222222222222', 'email', 'admin@globex-corp.com', 'email_verified', true), 'email', '22222222-2222-2222-2222-222222222222', NOW(), NOW(), NOW()),
  ('22222222-2222-2222-2222-333333333333', '22222222-2222-2222-2222-333333333333', jsonb_build_object('sub', '22222222-2222-2222-2222-333333333333', 'email', 'hr@globex-corp.com', 'email_verified', true), 'email', '22222222-2222-2222-2222-333333333333', NOW(), NOW(), NOW()),
  ('22222222-2222-2222-2222-444444444444', '22222222-2222-2222-2222-444444444444', jsonb_build_object('sub', '22222222-2222-2222-2222-444444444444', 'email', 'manager@globex-corp.com', 'email_verified', true), 'email', '22222222-2222-2222-2222-444444444444', NOW(), NOW(), NOW()),
  ('22222222-2222-2222-2222-555555555555', '22222222-2222-2222-2222-555555555555', jsonb_build_object('sub', '22222222-2222-2222-2222-555555555555', 'email', 'employee@globex-corp.com', 'email_verified', true), 'email', '22222222-2222-2222-2222-555555555555', NOW(), NOW(), NOW()),
  -- Initech
  ('33333333-3333-3333-3333-111111111111', '33333333-3333-3333-3333-111111111111', jsonb_build_object('sub', '33333333-3333-3333-3333-111111111111', 'email', 'superadmin@initech-ltd.com', 'email_verified', true), 'email', '33333333-3333-3333-3333-111111111111', NOW(), NOW(), NOW()),
  ('33333333-3333-3333-3333-222222222222', '33333333-3333-3333-3333-222222222222', jsonb_build_object('sub', '33333333-3333-3333-3333-222222222222', 'email', 'admin@initech-ltd.com', 'email_verified', true), 'email', '33333333-3333-3333-3333-222222222222', NOW(), NOW(), NOW()),
  ('33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', jsonb_build_object('sub', '33333333-3333-3333-3333-111111111111', 'email', 'hr@initech-ltd.com', 'email_verified', true), 'email', '33333333-3333-3333-3333-333333333333', NOW(), NOW(), NOW()),
  ('33333333-3333-3333-3333-444444444444', '33333333-3333-3333-3333-444444444444', jsonb_build_object('sub', '33333333-3333-3333-3333-111111111111', 'email', 'manager@initech-ltd.com', 'email_verified', true), 'email', '33333333-3333-3333-3333-444444444444', NOW(), NOW(), NOW()),
  ('33333333-3333-3333-3333-555555555555', '33333333-3333-3333-3333-555555555555', jsonb_build_object('sub', '33333333-3333-3333-3333-111111111111', 'email', 'employee@initech-ltd.com', 'email_verified', true), 'email', '33333333-3333-3333-3333-555555555555', NOW(), NOW(), NOW())
ON CONFLICT (provider, provider_id) DO UPDATE SET
  identity_data = EXCLUDED.identity_data,
  updated_at = NOW();

-- ============================================================
-- 3. PROFILES
-- ============================================================

INSERT INTO profiles (id, tenant_id, email, full_name, is_active, onboarding_completed) VALUES
  -- Acme
  ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000001', 'superadmin@acme-tech.com', 'Alice Superadmin', TRUE, TRUE),
  ('11111111-1111-1111-1111-222222222222', '11111111-0000-0000-0000-000000000001', 'admin@acme-tech.com',      'Bob Admin',        TRUE, TRUE),
  ('11111111-1111-1111-1111-333333333333', '11111111-0000-0000-0000-000000000001', 'hr@acme-tech.com',         'Carol HR',         TRUE, TRUE),
  ('11111111-1111-1111-1111-444444444444', '11111111-0000-0000-0000-000000000001', 'manager@acme-tech.com',    'David Manager',    TRUE, TRUE),
  ('11111111-1111-1111-1111-555555555555', '11111111-0000-0000-0000-000000000001', 'employee@acme-tech.com',   'Eve Employee',     TRUE, TRUE),
  -- Globex
  ('22222222-2222-2222-2222-111111111111', '22222222-0000-0000-0000-000000000002', 'superadmin@globex-corp.com', 'Gary Superadmin', TRUE, TRUE),
  ('22222222-2222-2222-2222-222222222222', '22222222-0000-0000-0000-000000000002', 'admin@globex-corp.com',      'Grace Admin',     TRUE, TRUE),
  ('22222222-2222-2222-2222-333333333333', '22222222-0000-0000-0000-000000000002', 'hr@globex-corp.com',         'Hannah HR',        TRUE, TRUE),
  ('22222222-2222-2222-2222-444444444444', '22222222-0000-0000-0000-000000000002', 'manager@globex-corp.com',    'Ian Manager',      TRUE, TRUE),
  ('22222222-2222-2222-2222-555555555555', '22222222-0000-0000-0000-000000000002', 'employee@globex-corp.com',   'Ivy Employee',     TRUE, TRUE),
  -- Initech
  ('33333333-3333-3333-3333-111111111111', '33333333-0000-0000-0000-000000000003', 'superadmin@initech-ltd.com', 'Ivan Superadmin', TRUE, TRUE),
  ('33333333-3333-3333-3333-222222222222', '33333333-0000-0000-0000-000000000003', 'admin@initech-ltd.com',      'Irene Admin',     TRUE, TRUE),
  ('33333333-3333-3333-3333-333333333333', '33333333-0000-0000-0000-000000000003', 'hr@initech-ltd.com',         'Jack HR',          TRUE, TRUE),
  ('33333333-3333-3333-3333-444444444444', '33333333-0000-0000-0000-000000000003', 'manager@initech-ltd.com',    'Karen Manager',    TRUE, TRUE),
  ('33333333-3333-3333-3333-555555555555', '33333333-0000-0000-0000-000000000003', 'employee@initech-ltd.com',   'Leo Employee',     TRUE, TRUE)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- ============================================================
-- 4. USER ROLES
-- ============================================================

INSERT INTO user_roles (user_id, tenant_id, role) VALUES
  -- Acme
  ('11111111-1111-1111-1111-111111111111', '11111111-0000-0000-0000-000000000001', 'SUPERADMIN'),
  ('11111111-1111-1111-1111-222222222222', '11111111-0000-0000-0000-000000000001', 'ADMIN'),
  ('11111111-1111-1111-1111-333333333333', '11111111-0000-0000-0000-000000000001', 'HR'),
  ('11111111-1111-1111-1111-444444444444', '11111111-0000-0000-0000-000000000001', 'MANAGER'),
  ('11111111-1111-1111-1111-555555555555', '11111111-0000-0000-0000-000000000001', 'EMPLOYEE'),
  -- Globex
  ('22222222-2222-2222-2222-111111111111', '22222222-0000-0000-0000-000000000002', 'SUPERADMIN'),
  ('22222222-2222-2222-2222-222222222222', '22222222-0000-0000-0000-000000000002', 'ADMIN'),
  ('22222222-2222-2222-2222-333333333333', '22222222-0000-0000-0000-000000000002', 'HR'),
  ('22222222-2222-2222-2222-444444444444', '22222222-0000-0000-0000-000000000002', 'MANAGER'),
  ('22222222-2222-2222-2222-555555555555', '22222222-0000-0000-0000-000000000002', 'EMPLOYEE'),
  -- Initech
  ('33333333-3333-3333-3333-111111111111', '33333333-0000-0000-0000-000000000003', 'SUPERADMIN'),
  ('33333333-3333-3333-3333-222222222222', '33333333-0000-0000-0000-000000000003', 'ADMIN'),
  ('33333333-3333-3333-3333-333333333333', '33333333-0000-0000-0000-000000000003', 'HR'),
  ('33333333-3333-3333-3333-444444444444', '33333333-0000-0000-0000-000000000003', 'MANAGER'),
  ('33333333-3333-3333-3333-555555555555', '33333333-0000-0000-0000-000000000003', 'EMPLOYEE')
ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role;

-- ============================================================
-- 5. EMPLOYEES
-- ============================================================

INSERT INTO employees (id, tenant_id, employee_code, employment_type, manager_id) VALUES
  ('11111111-1111-1111-1111-555555555555', '11111111-0000-0000-0000-000000000001', 'ACM-101', 'FULL_TIME', '11111111-1111-1111-1111-444444444444'),
  ('22222222-2222-2222-2222-555555555555', '22222222-0000-0000-0000-000000000002', 'GLB-201', 'FULL_TIME', '22222222-2222-2222-2222-444444444444'),
  ('33333333-3333-3333-3333-555555555555', '33333333-0000-0000-0000-000000000003', 'INI-301', 'FULL_TIME', '33333333-3333-3333-3333-444444444444')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 6. ATTENDANCE & LEAVE RECORDS
-- ============================================================

INSERT INTO attendance_records (tenant_id, employee_id, date, clock_in_at, status, method, work_minutes) VALUES
  ('11111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-555555555555', CURRENT_DATE, NOW() - INTERVAL '4 hours', 'PRESENT', 'SELFIE_GPS', 240),
  ('22222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-555555555555', CURRENT_DATE, NOW() - INTERVAL '5 hours', 'PRESENT', 'SELFIE_GPS', 300)
ON CONFLICT (tenant_id, employee_id, date) DO NOTHING;

-- Attrition risk score
INSERT INTO attrition_risk_scores (tenant_id, employee_id, score, risk_level, factors) VALUES
  ('11111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-555555555555', 0.15, 'LOW', '{"overtime_hours": 2}'::jsonb),
  ('22222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-555555555555', 0.65, 'HIGH', '{"overtime_hours": 24}'::jsonb)
ON CONFLICT DO NOTHING;

-- Audit log entries
INSERT INTO audit_log (tenant_id, actor_id, action, table_name) VALUES
  ('11111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'TENANT_CREATED', 'tenants'),
  ('22222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-111111111111', 'TENANT_CREATED', 'tenants')
ON CONFLICT DO NOTHING;
