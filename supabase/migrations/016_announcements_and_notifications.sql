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
