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
-- ENUMS (Idempotent creation)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('SUPERADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY', 'WEEKEND');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE attendance_method AS ENUM ('SELFIE_GPS', 'MANUAL', 'CORRECTION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE leave_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'WITHDRAWN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE case_status AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE case_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE review_cycle_status AS ENUM ('DRAFT', 'ACTIVE', 'SELF_REVIEW', 'MANAGER_REVIEW', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'LEAVE_REQUEST', 'LEAVE_APPROVED', 'LEAVE_REJECTED',
    'CORRECTION_REQUEST', 'CORRECTION_APPROVED', 'CORRECTION_REJECTED',
    'CASE_UPDATE', 'CASE_ASSIGNED', 'CASE_RESOLVED',
    'PERFORMANCE_REVIEW', 'GOAL_ASSIGNED', 'REVIEW_DUE',
    'RECOGNITION_RECEIVED', 'BADGE_EARNED',
    'ANNOUNCEMENT', 'SYSTEM'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE offline_sync_status AS ENUM ('PENDING', 'SYNCED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TENANTS (Organizations)
-- ============================================================

CREATE TABLE IF NOT EXISTS tenants (
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

-- Back-fill columns on tenants for column-level idempotency
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS accent_color TEXT NOT NULL DEFAULT '#6C63FF';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS app_name TEXT NOT NULL DEFAULT 'AttendX';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '{"copilot": true, "face_checkin": true, "skill_gap": true}'::jsonb;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_employees INT NOT NULL DEFAULT 500;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

-- ============================================================
-- USER PROFILES (shadow of auth.users)
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
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

-- Back-fill columns on profiles for column-level idempotency
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS face_enrolled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- ============================================================
-- USER ROLES (RBAC — never trust client-supplied role)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_roles (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role       user_role NOT NULL DEFAULT 'EMPLOYEE',
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tenant_id)
);

-- Back-fill columns on user_roles for column-level idempotency
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id);
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ DEFAULT NOW();

-- Helper function — get the calling user's tenant_id (used in RLS policies)
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid() LIMIT 1;
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

CREATE TABLE IF NOT EXISTS departments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  head_id     UUID REFERENCES auth.users(id),  -- Department head (FK to profiles)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

-- Back-fill columns on departments for column-level idempotency
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS head_id UUID REFERENCES auth.users(id);
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS description TEXT;

-- ============================================================
-- DESIGNATIONS / JOB TITLES
-- ============================================================

CREATE TABLE IF NOT EXISTS designations (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  level      INT NOT NULL DEFAULT 1,           -- Seniority level
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

-- Back-fill columns on designations for column-level idempotency
ALTER TABLE public.designations ADD COLUMN IF NOT EXISTS level INT NOT NULL DEFAULT 1;

-- ============================================================
-- EMPLOYEES (extends profiles)
-- ============================================================

CREATE TABLE IF NOT EXISTS employees (
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
  status          TEXT NOT NULL DEFAULT 'ACTIVE',     -- ACTIVE, INACTIVE, TERMINATED, ON_LEAVE
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, employee_code)
);

-- ============================================================
-- SHIFTS
-- ============================================================

CREATE TABLE IF NOT EXISTS shifts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  break_minutes INT NOT NULL DEFAULT 60,
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Back-fill columns & FK on employees for column-level idempotency
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS break_minutes INT NOT NULL DEFAULT 60;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS employment_type TEXT NOT NULL DEFAULT 'FULL_TIME';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS work_location TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS join_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS gender TEXT;
DO $$ BEGIN
  UPDATE public.employees SET join_date = CURRENT_DATE WHERE join_date IS NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- GEOFENCES (valid clock-in zones per tenant)
-- ============================================================

CREATE TABLE IF NOT EXISTS geofences (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  radius_m    INT NOT NULL DEFAULT 100,        -- Radius in meters
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Back-fill columns on geofences for column-level idempotency
ALTER TABLE public.geofences ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE public.geofences ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE public.geofences ADD COLUMN IF NOT EXISTS radius_m INT DEFAULT 100;
DO $$ BEGIN
  UPDATE public.geofences 
  SET lat = COALESCE(lat, latitude), 
      lng = COALESCE(lng, longitude), 
      radius_m = COALESCE(radius_m, radius_meters) 
  WHERE lat IS NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- ATTENDANCE RECORDS
-- ============================================================

CREATE TABLE IF NOT EXISTS attendance_records (
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

-- Back-fill columns on attendance_records for column-level idempotency
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS work_minutes INT DEFAULT 0;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS break_minutes INT DEFAULT 0;

-- ============================================================
-- ATTENDANCE CORRECTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS attendance_corrections (
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

CREATE TABLE IF NOT EXISTS breaks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  attendance_id   UUID NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ,
  duration_minutes INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Back-fill columns on breaks for column-level idempotency
ALTER TABLE public.breaks ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.breaks ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.breaks ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;
ALTER TABLE public.breaks ADD COLUMN IF NOT EXISTS duration_minutes INT;
DO $$ BEGIN
  UPDATE public.breaks b 
  SET tenant_id = a.tenant_id 
  FROM public.attendance_records a 
  WHERE b.attendance_id = a.id AND b.tenant_id IS NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- LEAVE TYPES
-- ============================================================

CREATE TABLE IF NOT EXISTS leave_types (
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

CREATE TABLE IF NOT EXISTS leave_balances (
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

CREATE TABLE IF NOT EXISTS leaves (
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

CREATE TABLE IF NOT EXISTS holidays (
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

CREATE TABLE IF NOT EXISTS performance_cycles (
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

CREATE TABLE IF NOT EXISTS goals (
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

CREATE TABLE IF NOT EXISTS self_reviews (
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

CREATE TABLE IF NOT EXISTS manager_reviews (
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

CREATE TABLE IF NOT EXISTS recognition_categories (
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

CREATE TABLE IF NOT EXISTS recognition_events (
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

CREATE TABLE IF NOT EXISTS recognition_badges (
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
CREATE MATERIALIZED VIEW IF NOT EXISTS recognition_leaderboard AS
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_recognition_leaderboard_tenant_emp ON recognition_leaderboard (tenant_id, employee_id);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
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

-- Back-fill columns on notifications for column-level idempotency
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS deep_link TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- ============================================================
-- PUSH TOKENS (Web Push subscriptions)
-- ============================================================

CREATE TABLE IF NOT EXISTS push_tokens (
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

CREATE TABLE IF NOT EXISTS notification_preferences (
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

CREATE TABLE IF NOT EXISTS cases (
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

CREATE TABLE IF NOT EXISTS case_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id     UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES auth.users(id),
  body        TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,    -- Internal HR/admin notes not shown to reporter
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS case_attachments (
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

CREATE TABLE IF NOT EXISTS announcements (
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

-- Back-fill columns on announcements for column-level idempotency
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS cta_label TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS cta_url TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS banner_image_url TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_roles user_role[] NOT NULL DEFAULT '{EMPLOYEE,MANAGER,HR,ADMIN}'::user_role[];
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

CREATE TABLE IF NOT EXISTS announcement_dismissals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (announcement_id, user_id)
);

-- Back-fill columns on announcement_dismissals for column-level idempotency
ALTER TABLE public.announcement_dismissals ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ DEFAULT NOW();
DO $$ BEGIN
  UPDATE public.announcement_dismissals SET dismissed_at = created_at WHERE dismissed_at IS NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- SKILL EMBEDDINGS (pgvector — replaces Milvus)
-- ============================================================

CREATE TABLE IF NOT EXISTS skill_embeddings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id   UUID NOT NULL REFERENCES auth.users(id),
  skill_text    TEXT NOT NULL,               -- Raw skill description
  embedding     vector,                -- text-embedding-3-small output
  source        TEXT NOT NULL DEFAULT 'profile',  -- 'profile', 'review', 'goal'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Back-fill columns on skill_embeddings for column-level idempotency
ALTER TABLE public.skill_embeddings ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES auth.users(id);
ALTER TABLE public.skill_embeddings ADD COLUMN IF NOT EXISTS skill_text TEXT;
ALTER TABLE public.skill_embeddings ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'profile';
ALTER TABLE public.skill_embeddings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DO $$ BEGIN
  UPDATE public.skill_embeddings SET skill_text = content WHERE skill_text IS NULL AND content IS NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Approximate nearest-neighbor index (IVFFlat for speed at scale)
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_skill_embeddings_vec ON skill_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'ivfflat index skipped (vector extension not loaded)';
END $$;

-- ============================================================
-- ATTRITION RISK SCORES
-- ============================================================

CREATE TABLE IF NOT EXISTS attrition_risk_scores (
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

CREATE TABLE IF NOT EXISTS audit_log (
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

CREATE TABLE IF NOT EXISTS active_sessions (
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

CREATE TABLE IF NOT EXISTS onboarding_state (
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

CREATE TABLE IF NOT EXISTS offline_sync_log (
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

CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant ON user_roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_tenant ON employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_manager ON employees(manager_id);
CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_records(employee_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_date ON attendance_records(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_leaves_employee ON leaves(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_leaves_reviewer ON leaves(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_tenant_status ON cases(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_reporter ON cases(reporter_id);
CREATE INDEX IF NOT EXISTS idx_cases_assignee ON cases(assignee_id);
CREATE INDEX IF NOT EXISTS idx_recognition_receiver ON recognition_events(tenant_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_recognition_giver ON recognition_events(giver_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(tenant_id, is_active, starts_at, ends_at);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_updated ON tenants;
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_profiles_updated ON profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_employees_updated ON employees;
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_attendance_updated ON attendance_records;
CREATE TRIGGER trg_attendance_updated BEFORE UPDATE ON attendance_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_leaves_updated ON leaves;
CREATE TRIGGER trg_leaves_updated BEFORE UPDATE ON leaves FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_leave_balances_updated ON leave_balances;
CREATE TRIGGER trg_leave_balances_updated BEFORE UPDATE ON leave_balances FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_goals_updated ON goals;
CREATE TRIGGER trg_goals_updated BEFORE UPDATE ON goals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_self_reviews_updated ON self_reviews;
CREATE TRIGGER trg_self_reviews_updated BEFORE UPDATE ON self_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_manager_reviews_updated ON manager_reviews;
CREATE TRIGGER trg_manager_reviews_updated BEFORE UPDATE ON manager_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_perf_cycles_updated ON performance_cycles;
CREATE TRIGGER trg_perf_cycles_updated BEFORE UPDATE ON performance_cycles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_cases_updated ON cases;
CREATE TRIGGER trg_cases_updated BEFORE UPDATE ON cases FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_announcements_updated ON announcements;
CREATE TRIGGER trg_announcements_updated BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_onboarding_updated ON onboarding_state;
CREATE TRIGGER trg_onboarding_updated BEFORE UPDATE ON onboarding_state FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Refresh leaderboard on every new recognition
CREATE OR REPLACE FUNCTION refresh_leaderboard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY recognition_leaderboard;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_leaderboard ON recognition_events;
CREATE TRIGGER trg_refresh_leaderboard
  AFTER INSERT ON recognition_events
  FOR EACH STATEMENT EXECUTE FUNCTION refresh_leaderboard();
