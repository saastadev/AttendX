-- ============================================================
-- Migration 017: MVP Scope — AI Sentiment Analysis, Employee 360°
-- (Productivity & Learning), and Copilot Multi-Turn Sessions
-- ============================================================

-- 1. AI SENTIMENT ANALYSIS: FEEDBACK & SURVEYS
CREATE TABLE IF NOT EXISTS employee_feedback (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id       UUID REFERENCES employees(id) ON DELETE SET NULL, -- NULL if anonymous
  department_id     UUID REFERENCES departments(id) ON DELETE SET NULL,
  feedback_type     TEXT NOT NULL CHECK (feedback_type IN ('FEEDBACK', 'SURVEY', 'EXIT_INTERVIEW', 'COMMENT')),
  content           TEXT NOT NULL,
  is_anonymous      BOOLEAN NOT NULL DEFAULT false,
  sentiment_score   NUMERIC(4, 3) NOT NULL, -- Normalized: -1.000 to +1.000
  sentiment_label   TEXT NOT NULL CHECK (sentiment_label IN ('POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED')),
  engagement_score  NUMERIC(5, 2) NOT NULL DEFAULT 50.00, -- 0 to 100
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_feedback_tenant ON employee_feedback(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_feedback_dept ON employee_feedback(tenant_id, department_id);

-- Snapshot table for aggregate sentiment analytics
CREATE TABLE IF NOT EXISTS sentiment_analytics_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  department_id         UUID REFERENCES departments(id) ON DELETE CASCADE, -- NULL for tenant-wide
  period                TEXT NOT NULL, -- e.g. '2026-Q1' or '2026-09'
  morale_index          NUMERIC(5, 2) NOT NULL DEFAULT 50.00, -- 0 to 100
  engagement_score      NUMERIC(5, 2) NOT NULL DEFAULT 50.00, -- 0 to 100
  culture_health_score  NUMERIC(5, 2) NOT NULL DEFAULT 50.00, -- 0 to 100
  retention_risk_score  NUMERIC(5, 2) NOT NULL DEFAULT 20.00, -- 0 to 100
  positive_count        INT NOT NULL DEFAULT 0,
  negative_count        INT NOT NULL DEFAULT 0,
  neutral_count         INT NOT NULL DEFAULT 0,
  mixed_count           INT NOT NULL DEFAULT 0,
  total_responses       INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, department_id, period)
);

-- 2. EMPLOYEE 360°: PRODUCTIVITY LOGS
CREATE TABLE IF NOT EXISTS productivity_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date              DATE NOT NULL,
  tasks_assigned    INT NOT NULL DEFAULT 0,
  tasks_completed   INT NOT NULL DEFAULT 0,
  hours_logged      NUMERIC(4, 2) NOT NULL DEFAULT 8.00,
  efficiency_score  NUMERIC(5, 2) NOT NULL DEFAULT 85.00, -- 0 to 100
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_productivity_emp ON productivity_logs(tenant_id, employee_id, date DESC);

-- 3. EMPLOYEE 360°: LEARNING COURSES & ENROLLMENTS
CREATE TABLE IF NOT EXISTS learning_courses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  category          TEXT NOT NULL,
  level             TEXT NOT NULL DEFAULT 'Intermediate',
  skill_tags        TEXT[] NOT NULL DEFAULT '{}',
  estimated_hours   NUMERIC(4, 1) NOT NULL DEFAULT 10.0,
  duration_hours    NUMERIC(4, 1) NOT NULL DEFAULT 10.0,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS learning_enrollments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  course_id         UUID NOT NULL REFERENCES learning_courses(id) ON DELETE CASCADE,
  status            TEXT NOT NULL CHECK (status IN ('ENROLLED', 'IN_PROGRESS', 'COMPLETED')),
  progress_percent  INT NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  score             NUMERIC(5, 2),
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, employee_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_learning_enrollments_emp ON learning_enrollments(tenant_id, employee_id);

-- 4. GENAI COPILOT: CONVERSATION SESSIONS (MULTI-TURN MEMORY)
CREATE TABLE IF NOT EXISTS copilot_conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content       TEXT NOT NULL,
  tool_invoked  TEXT,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_conversations_session 
  ON copilot_conversations(tenant_id, user_id, session_id, created_at ASC);

-- 4b. SEED LMS COURSES FOR TENANT 1 (ACME TECH)
INSERT INTO learning_courses (tenant_id, title, category, level, duration_hours, estimated_hours, skill_tags)
SELECT '10000000-0000-0000-0000-000000000001'::uuid, title, category, level, duration, duration, tags
FROM (VALUES
  ('Advanced Cloud Architecture', 'Engineering', 'Advanced', 12.0, ARRAY['aws', 'cloud', 'architecture']),
  ('Full-Stack TypeScript & Next.js', 'Engineering', 'Intermediate', 8.0, ARRAY['typescript', 'nextjs', 'react']),
  ('DevSecOps & Secure Coding', 'Security', 'Intermediate', 6.0, ARRAY['security', 'devops', 'owasp']),
  ('Engineering Leadership & Mentoring', 'Leadership', 'Beginner', 10.0, ARRAY['leadership', 'management'])
) AS c(title, category, level, duration, tags)
WHERE NOT EXISTS (
  SELECT 1 FROM learning_courses lc 
  WHERE lc.tenant_id = '10000000-0000-0000-0000-000000000001'::uuid AND lc.title = c.title
);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES

ALTER TABLE employee_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentiment_analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE productivity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_conversations ENABLE ROW LEVEL SECURITY;

-- employee_feedback:
CREATE POLICY "feedback_tenant_insert" ON employee_feedback
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT auth.jwt()->>'tenant_id')::uuid
  );

CREATE POLICY "feedback_hr_read" ON employee_feedback
  FOR SELECT USING (
    tenant_id = (SELECT auth.jwt()->>'tenant_id')::uuid AND
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = employee_feedback.tenant_id
        AND ur.role IN ('HR', 'ADMIN', 'SUPERADMIN')
    )
  );

-- sentiment_analytics_snapshots:
CREATE POLICY "sentiment_snapshots_read" ON sentiment_analytics_snapshots
  FOR SELECT USING (
    tenant_id = (SELECT auth.jwt()->>'tenant_id')::uuid AND (
      EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.tenant_id = sentiment_analytics_snapshots.tenant_id
          AND ur.role IN ('HR', 'ADMIN', 'SUPERADMIN')
      ) OR (
        department_id IS NOT NULL AND
        EXISTS (
          SELECT 1 FROM employees emp
          JOIN user_roles ur ON ur.user_id = emp.id AND ur.tenant_id = emp.tenant_id
          WHERE emp.id = auth.uid()
            AND emp.department_id = sentiment_analytics_snapshots.department_id
            AND ur.role = 'MANAGER'
        )
      )
    )
  );

-- productivity_logs:
CREATE POLICY "productivity_read" ON productivity_logs
  FOR SELECT USING (
    tenant_id = (SELECT auth.jwt()->>'tenant_id')::uuid AND (
      employee_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM employees emp
        WHERE emp.id = productivity_logs.employee_id
          AND emp.manager_id = auth.uid()
      ) OR
      EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.tenant_id = productivity_logs.tenant_id
          AND ur.role IN ('HR', 'ADMIN', 'SUPERADMIN')
      )
    )
  );

-- learning_courses:
CREATE POLICY "learning_courses_read" ON learning_courses
  FOR SELECT USING (
    tenant_id = (SELECT auth.jwt()->>'tenant_id')::uuid AND is_active = true
  );

-- learning_enrollments:
CREATE POLICY "learning_enrollments_read" ON learning_enrollments
  FOR SELECT USING (
    tenant_id = (SELECT auth.jwt()->>'tenant_id')::uuid AND (
      employee_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM employees emp
        WHERE emp.id = learning_enrollments.employee_id
          AND emp.manager_id = auth.uid()
      ) OR
      EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.tenant_id = learning_enrollments.tenant_id
          AND ur.role IN ('HR', 'ADMIN', 'SUPERADMIN')
      )
    )
  );

-- copilot_conversations:
CREATE POLICY "copilot_conversations_self" ON copilot_conversations
  FOR ALL USING (
    tenant_id = (SELECT auth.jwt()->>'tenant_id')::uuid AND
    user_id = auth.uid()
  ) WITH CHECK (
    tenant_id = (SELECT auth.jwt()->>'tenant_id')::uuid AND
    user_id = auth.uid()
  );

-- 6. PERFORMANCE COMPATIBILITY ALIASES
ALTER TABLE manager_reviews ADD COLUMN IF NOT EXISTS rating NUMERIC(3, 1);
UPDATE manager_reviews SET rating = overall_rating WHERE rating IS NULL;

ALTER TABLE goals ADD COLUMN IF NOT EXISTS current_value NUMERIC;
UPDATE goals SET current_value = actual_value WHERE current_value IS NULL;

