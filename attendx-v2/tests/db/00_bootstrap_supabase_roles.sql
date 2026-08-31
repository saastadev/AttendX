-- ============================================================
-- CI bootstrap: create the roles a managed Supabase project
-- provides out of the box. Migration 001 GRANTs to these, so on
-- bare Postgres they must exist before anything else runs.
-- Not for production — Supabase owns these roles there.
-- ============================================================
DO $$ BEGIN CREATE ROLE anon NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticator NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- NOTE: deliberately NOT creating supabase_auth_admin.
-- Migration 001 uses the presence of that role as its "is this real Supabase?"
-- detector. Creating it here would make the shim skip creating the auth schema,
-- which does not exist on bare Postgres. (The detector is fragile for this
-- reason -- it should test for the auth schema itself, not the role.)
GRANT anon, authenticated, service_role TO authenticator;

-- ------------------------------------------------------------
-- Faithful-enough auth schema for CI.
--
-- Migration 001 creates a MINIMAL auth.users shim (id/email/meta/created_at),
-- but supabase/seed/001_seed_data.sql inserts the full Supabase column set
-- (instance_id, aud, role, encrypted_password, raw_app_meta_data,
-- is_sso_user, ...). On bare Postgres the seed therefore fails.
--
-- We pre-create the richer table here. 001 uses CREATE TABLE IF NOT EXISTS,
-- so it leaves this alone and still installs auth.uid()/auth.role().
-- Real Supabase is unaffected: this file never runs there.
-- ------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id        UUID,
  aud                TEXT,
  role               TEXT,
  email              TEXT UNIQUE,
  encrypted_password TEXT,
  email_confirmed_at TIMESTAMPTZ,
  invited_at         TIMESTAMPTZ,
  confirmation_token TEXT,
  recovery_token     TEXT,
  last_sign_in_at    TIMESTAMPTZ,
  raw_app_meta_data  JSONB DEFAULT '{}'::jsonb,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
  is_super_admin     BOOLEAN,
  is_sso_user        BOOLEAN NOT NULL DEFAULT FALSE,
  phone              TEXT,
  banned_until       TIMESTAMPTZ,
  deleted_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth.identities (
  id              UUID NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_data   JSONB NOT NULL,
  provider        TEXT NOT NULL,
  provider_id     TEXT NOT NULL,
  last_sign_in_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (provider, provider_id)
);

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO anon, authenticated, service_role;
