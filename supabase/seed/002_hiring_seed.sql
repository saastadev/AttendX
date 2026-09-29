-- ============================================================
-- AttendX v2 — Seed Data: Hiring Module (002_hiring_seed.sql)
-- 2 Tenants × 2 Requisitions each × 20+ Candidates Across All Funnel Stages
-- Provides complete data for Pipeline Kanban, Sourcing, Outreach, Voice AI,
-- Screening, Interviews, Onboarding, Documents, and Analytics dashboards
-- ============================================================

-- ------------------------------------------------------------
-- 1. DEPARTMENTS & DESIGNATIONS (Ensure present for Acme & Globex)
-- ------------------------------------------------------------
INSERT INTO public.departments (id, tenant_id, name, description) VALUES
  ('11111111-2222-3333-4444-000000000001', '11111111-0000-0000-0000-000000000001', 'Engineering', 'Core platform and product engineering'),
  ('11111111-2222-3333-4444-000000000002', '11111111-0000-0000-0000-000000000001', 'Product & Design', 'Product management and UI/UX design'),
  ('22222222-2222-3333-4444-000000000001', '22222222-0000-0000-0000-000000000002', 'Infrastructure', 'Cloud, Site Reliability & DevOps'),
  ('22222222-2222-3333-4444-000000000002', '22222222-0000-0000-0000-000000000002', 'Design Studio', 'Enterprise experience and visual design')
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO public.designations (id, tenant_id, name, level) VALUES
  ('11111111-3333-4444-5555-000000000001', '11111111-0000-0000-0000-000000000001', 'Senior Full-Stack Engineer', 4),
  ('11111111-3333-4444-5555-000000000002', '11111111-0000-0000-0000-000000000001', 'AI Systems Engineer', 4),
  ('22222222-3333-4444-5555-000000000001', '22222222-0000-0000-0000-000000000002', 'Senior DevOps Engineer', 4),
  ('22222222-3333-4444-5555-000000000002', '22222222-0000-0000-0000-000000000002', 'Senior Product Designer', 3)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- ------------------------------------------------------------
-- 2. ORG SCORE WEIGHTS
-- ------------------------------------------------------------
INSERT INTO public.org_score_weights (organization_id, skills_weight, interview_weight, experience_weight, communication_weight, assessment_weight, culture_fit_weight)
VALUES
  ('11111111-0000-0000-0000-000000000001', 30.00, 25.00, 15.00, 15.00, 10.00, 5.00),
  ('22222222-0000-0000-0000-000000000002', 30.00, 25.00, 15.00, 15.00, 10.00, 5.00)
ON CONFLICT (organization_id) DO UPDATE SET updated_at = NOW();

-- ------------------------------------------------------------
-- 3. JOB REQUISITIONS (2 for Acme, 2 for Globex)
-- ------------------------------------------------------------
INSERT INTO public.job_requisitions (
  id, organization_id, requisition_code, title, department_id, designation_id,
  hiring_manager_id, recruiter_id, status, priority, openings_count, filled_count,
  location, employment_type, min_experience_years, max_experience_years,
  min_salary, max_salary, job_description, total_rounds, document_mode
) VALUES
  (
    'a1000000-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    'REQ-ACME-001',
    'Senior Full-Stack Engineer',
    '11111111-2222-3333-4444-000000000001',
    '11111111-3333-4444-5555-000000000001',
    '11111111-1111-1111-1111-444444444444',
    '11111111-1111-1111-1111-333333333333',
    'OPEN',
    'HIGH',
    3,
    1,
    'Bengaluru, India (Hybrid)',
    'FULL_TIME',
    4.0,
    8.0,
    1800000.00,
    2800000.00,
    'We are looking for a Senior Full-Stack Engineer with strong TypeScript, React 19, Next.js, and PostgreSQL expertise to lead architecture for our scalable enterprise modules.',
    3,
    'NATIVE'
  ),
  (
    'a1000000-0000-0000-0000-000000000002',
    '11111111-0000-0000-0000-000000000001',
    'REQ-ACME-002',
    'AI Systems Engineer',
    '11111111-2222-3333-4444-000000000001',
    '11111111-3333-4444-5555-000000000002',
    '11111111-1111-1111-1111-444444444444',
    '11111111-1111-1111-1111-333333333333',
    'OPEN',
    'URGENT',
    2,
    0,
    'Remote / Bengaluru',
    'FULL_TIME',
    3.0,
    7.0,
    2200000.00,
    3500000.00,
    'Seeking an AI Engineer with deep knowledge of LLM orchestrations, RAG architectures, LangChain, semantic embeddings, and vector databases.',
    4,
    'NATIVE'
  ),
  (
    'a2000000-0000-0000-0000-000000000001',
    '22222222-0000-0000-0000-000000000002',
    'REQ-GLB-001',
    'Senior DevOps Engineer',
    '22222222-2222-3333-4444-000000000001',
    '22222222-3333-4444-5555-000000000001',
    '22222222-2222-2222-2222-444444444444',
    '22222222-2222-2222-2222-333333333333',
    'OPEN',
    'HIGH',
    2,
    0,
    'New York, NY (Hybrid)',
    'FULL_TIME',
    5.0,
    10.0,
    140000.00,
    180000.00,
    'Lead our multi-cloud Kubernetes infrastructure, CI/CD pipelines, Terraform automation, and observability stack.',
    3,
    'NATIVE'
  ),
  (
    'a2000000-0000-0000-0000-000000000002',
    '22222222-0000-0000-0000-000000000002',
    'REQ-GLB-002',
    'Senior Product Designer',
    '22222222-2222-3333-4444-000000000002',
    '22222222-3333-4444-5555-000000000002',
    '22222222-2222-2222-2222-444444444444',
    '22222222-2222-2222-2222-333333333333',
    'OPEN',
    'MEDIUM',
    1,
    0,
    'San Francisco / Remote',
    'FULL_TIME',
    4.0,
    8.0,
    120000.00,
    160000.00,
    'Design intuitive enterprise workflows, design tokens, design systems, and rapid interactive prototypes.',
    3,
    'NATIVE'
  )
ON CONFLICT (organization_id, requisition_code) DO NOTHING;

-- ------------------------------------------------------------
-- 4. REQUISITION SKILLS
-- ------------------------------------------------------------
INSERT INTO public.job_requisition_skills (organization_id, requisition_id, skill_name, is_required, weight, min_experience_years) VALUES
  ('11111111-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'React', TRUE, 4, 3.0),
  ('11111111-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'TypeScript', TRUE, 5, 3.0),
  ('11111111-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Node.js', TRUE, 4, 3.0),
  ('11111111-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'PostgreSQL', TRUE, 4, 2.0),
  ('11111111-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Next.js', FALSE, 3, 2.0),
  ('11111111-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'Python', TRUE, 5, 3.0),
  ('11111111-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'LLM Architectures', TRUE, 5, 2.0),
  ('11111111-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'Vector Databases', TRUE, 4, 1.5)
ON CONFLICT (requisition_id, skill_name) DO NOTHING;

-- ------------------------------------------------------------
-- 5. CANDIDATES (20 realistic candidates)
-- ------------------------------------------------------------
INSERT INTO public.candidates (
  id, organization_id, first_name, last_name, email, phone, current_company,
  current_designation, total_experience_years, location, current_ctc, expected_ctc,
  notice_period_days, source, consent_status
) VALUES
  -- Acme Candidates
  ('c1000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Aarav', 'Sharma', 'aarav.sharma@example.com', '+91 98765 43210', 'Infosys', 'Senior Software Engineer', 6.0, 'Bengaluru', 'enc:ctc:1600000', 'enc:ctc:2200000', 30, 'LINKEDIN', 'GIVEN'),
  ('c1000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Ananya', 'Iyer', 'ananya.iyer@example.com', '+91 98765 43211', 'Flipkart', 'Full Stack Developer', 5.5, 'Bengaluru', 'enc:ctc:2000000', 'enc:ctc:2600000', 15, 'REFERRAL', 'GIVEN'),
  ('c1000000-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'Rohan', 'Verma', 'rohan.verma@example.com', '+91 98765 43212', 'Swiggy', 'Lead Backend Engineer', 7.5, 'Hyderabad', 'enc:ctc:2400000', 'enc:ctc:3000000', 45, 'NAUKRI', 'GIVEN'),
  ('c1000000-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'Priya', 'Nair', 'priya.nair@example.com', '+91 98765 43213', 'Amazon', 'SDE II', 4.5, 'Bengaluru', 'enc:ctc:2200000', 'enc:ctc:2800000', 30, 'SOURCED', 'GIVEN'),
  ('c1000000-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', 'Siddharth', 'Mehta', 'siddharth.mehta@example.com', '+91 98765 43214', 'Razorpay', 'Senior Frontend Engineer', 5.0, 'Bengaluru', 'enc:ctc:1900000', 'enc:ctc:2500000', 30, 'CAREER_SITE', 'GIVEN'),
  ('c1000000-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001', 'Kavita', 'Reddy', 'kavita.reddy@example.com', '+91 98765 43215', 'Wipro', 'Tech Lead', 8.0, 'Chennai', 'enc:ctc:2500000', 'enc:ctc:3200000', 60, 'INDEED', 'GIVEN'),
  ('c1000000-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001', 'Vikram', 'Patel', 'vikram.patel@example.com', '+91 98765 43216', 'Freshworks', 'Senior React Developer', 6.2, 'Bengaluru', 'enc:ctc:2100000', 'enc:ctc:2700000', 30, 'GITHUB', 'GIVEN'),
  ('c1000000-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000001', 'Neha', 'Deshmukh', 'neha.deshmukh@example.com', '+91 98765 43217', 'Zomato', 'Software Engineer', 3.5, 'Delhi NCR', 'enc:ctc:1500000', 'enc:ctc:2000000', 15, 'CAREER_SITE', 'GIVEN'),
  ('c1000000-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000001', 'Aditya', 'Joshi', 'aditya.joshi@example.com', '+91 98765 43218', 'Microsoft', 'Software Engineer II', 5.0, 'Hyderabad', 'enc:ctc:2300000', 'enc:ctc:2900000', 30, 'LINKEDIN', 'GIVEN'),
  ('c1000000-0000-0000-0000-000000000010', '11111111-0000-0000-0000-000000000001', 'Sneha', 'Kulkarni', 'sneha.kulkarni@example.com', '+91 98765 43219', 'TCS', 'Senior Associate', 6.5, 'Pune', 'enc:ctc:1700000', 'enc:ctc:2300000', 45, 'NAUKRI', 'GIVEN'),

  -- Globex Candidates
  ('c2000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'Liam', 'Smith', 'liam.smith@example.com', '+1 555-0101', 'Datadog', 'Senior SRE', 7.0, 'New York, NY', 'enc:ctc:155000', 'enc:ctc:175000', 14, 'LINKEDIN', 'GIVEN'),
  ('c2000000-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'Emma', 'Johnson', 'emma.johnson@example.com', '+1 555-0102', 'Figma', 'Product Designer', 5.0, 'San Francisco, CA', 'enc:ctc:135000', 'enc:ctc:155000', 14, 'DRIBBBLE', 'GIVEN'),
  ('c2000000-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000002', 'Noah', 'Brown', 'noah.brown@example.com', '+1 555-0103', 'Cloudflare', 'Cloud Engineer', 6.5, 'Austin, TX', 'enc:ctc:145000', 'enc:ctc:165000', 30, 'GITHUB', 'GIVEN'),
  ('c2000000-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000002', 'Olivia', 'Davis', 'olivia.davis@example.com', '+1 555-0104', 'Stripe', 'UX Researcher', 4.5, 'Seattle, WA', 'enc:ctc:130000', 'enc:ctc:150000', 14, 'LINKEDIN', 'GIVEN'),
  ('c2000000-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000002', 'William', 'Miller', 'william.miller@example.com', '+1 555-0105', 'Twilio', 'DevOps Specialist', 8.0, 'Remote', 'enc:ctc:160000', 'enc:ctc:185000', 30, 'CAREER_SITE', 'GIVEN'),
  ('c2000000-0000-0000-0000-000000000006', '22222222-0000-0000-0000-000000000002', 'Sophia', 'Wilson', 'sophia.wilson@example.com', '+1 555-0106', 'Airbnb', 'Senior Product Designer', 6.0, 'San Francisco, CA', 'enc:ctc:150000', 'enc:ctc:170000', 14, 'REFERRAL', 'GIVEN'),
  ('c2000000-0000-0000-0000-000000000007', '22222222-0000-0000-0000-000000000002', 'James', 'Taylor', 'james.taylor@example.com', '+1 555-0107', 'HashiCorp', 'Infrastructure Architect', 9.0, 'Boston, MA', 'enc:ctc:175000', 'enc:ctc:200000', 30, 'SOURCED', 'GIVEN'),
  ('c2000000-0000-0000-0000-000000000008', '22222222-0000-0000-0000-000000000002', 'Isabella', 'Anderson', 'isabella.anderson@example.com', '+1 555-0108', 'Notion', 'Brand & UI Designer', 4.0, 'New York, NY', 'enc:ctc:120000', 'enc:ctc:140000', 14, 'INDEED', 'GIVEN'),
  ('c2000000-0000-0000-0000-000000000009', '22222222-0000-0000-0000-000000000002', 'Benjamin', 'Thomas', 'benjamin.thomas@example.com', '+1 555-0109', 'Spotify', 'Site Reliability Engineer', 5.5, 'Remote', 'enc:ctc:140000', 'enc:ctc:160000', 30, 'LINKEDIN', 'GIVEN'),
  ('c2000000-0000-0000-0000-000000000010', '22222222-0000-0000-0000-000000000002', 'Mia', 'Jackson', 'mia.jackson@example.com', '+1 555-0110', 'Canva', 'Visual Designer', 3.8, 'Remote', 'enc:ctc:110000', 'enc:ctc:130000', 14, 'DRIBBBLE', 'GIVEN')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 6. CANDIDATE SKILLS
-- ------------------------------------------------------------
INSERT INTO public.candidate_skills (organization_id, candidate_id, skill_name, experience_years, proficiency_level, verified_by_ai) VALUES
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'React', 5.0, 'EXPERT', TRUE),
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'TypeScript', 4.5, 'ADVANCED', TRUE),
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Node.js', 5.0, 'ADVANCED', TRUE),
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'PostgreSQL', 4.0, 'INTERMEDIATE', TRUE),
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'React', 4.5, 'ADVANCED', TRUE),
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'Next.js', 3.5, 'ADVANCED', TRUE),
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'TypeScript', 4.0, 'ADVANCED', TRUE),
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'Node.js', 7.0, 'EXPERT', TRUE),
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'PostgreSQL', 6.0, 'EXPERT', TRUE),
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000004', 'React', 4.0, 'INTERMEDIATE', FALSE),
  ('11111111-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000005', 'React', 4.5, 'ADVANCED', TRUE)
ON CONFLICT (candidate_id, skill_name) DO NOTHING;

-- ------------------------------------------------------------
-- 7. JOB APPLICATIONS ACROSS ALL FUNNEL STAGES
-- ------------------------------------------------------------
INSERT INTO public.job_applications (
  id, organization_id, application_code, requisition_id, candidate_id, stage,
  match_score, skill_score, experience_score, jd_relevance_score, current_decision, match_reasoning
) VALUES
  -- 1. SOURCED
  ('b1000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'APP-2026-001', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000004', 'SOURCED', 62.50, 60.00, 65.00, 62.50, 'PENDING', '{"summary": "Discovered via LinkedIn Sourcing. 4.5 years experience aligns with range."}'),
  
  -- 2. CONTACTED
  ('b1000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'APP-2026-002', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000006', 'CONTACTED', 72.00, 75.00, 80.00, 65.00, 'PENDING', '{"summary": "Outreach email sent; candidate confirmed receipt."}'),

  -- 3. APPLIED
  ('b1000000-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'APP-2026-003', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000007', 'APPLIED', 82.50, 85.00, 80.00, 82.00, 'PENDING', '{"summary": "Direct career site application with verified GitHub repository."}'),
  ('b1000000-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'APP-2026-004', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000008', 'APPLIED', 48.00, 45.00, 50.00, 50.00, 'PENDING', '{"summary": "Junior experience profile below 4 years baseline."}'),

  -- 4. SHORTLISTED
  ('b1000000-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', 'APP-2026-005', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000009', 'SHORTLISTED', 88.00, 90.00, 85.00, 89.00, 'PENDING', '{"summary": "Shortlisted by Recruiter. Excellent React and TypeScript track record."}'),

  -- 5. INTERVIEW
  ('b1000000-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001', 'APP-2026-006', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000005', 'INTERVIEW', 84.00, 85.00, 82.00, 85.00, 'PENDING', '{"summary": "Technical round 1 completed; managerial round scheduled."}'),

  -- 6. SELECTED
  ('b1000000-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001', 'APP-2026-007', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'SELECTED', 92.50, 95.00, 90.00, 93.00, 'SELECTED', '{"summary": "All rounds cleared with Strong Hire recommendations across interviewers."}'),

  -- 7. OFFER_INTEREST_SENT
  ('b1000000-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000001', 'APP-2026-008', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'OFFER_INTEREST_SENT', 89.00, 90.00, 88.00, 89.00, 'SELECTED', '{"summary": "Offer interest letter sent via candidate portal."}'),

  -- 8. OFFER_ACCEPTED
  ('b1000000-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000001', 'APP-2026-009', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000010', 'OFFER_ACCEPTED', 81.00, 80.00, 85.00, 80.00, 'SELECTED', '{"summary": "Candidate accepted preliminary interest terms."}'),

  -- 9. DOCUMENTS_PENDING
  ('b1000000-0000-0000-0000-000000000010', '11111111-0000-0000-0000-000000000001', 'APP-2026-010', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'DOCUMENTS_PENDING', 94.00, 96.00, 92.00, 94.00, 'SELECTED', '{"summary": "Candidate submitted 4 of 6 required documents for verification."}'),

  -- 10. REJECTED
  ('b1000000-0000-0000-0000-000000000011', '11111111-0000-0000-0000-000000000001', 'APP-2026-011', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000004', 'REJECTED', 52.00, 50.00, 55.00, 52.00, 'REJECTED', '{"summary": "Technical bar not met for LLM architecture requirements."}'),

  -- Globex Applications
  ('b2000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'APP-GLB-001', 'a2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'DOCUMENTS_VERIFIED', 91.00, 92.00, 90.00, 91.00, 'SELECTED', '{"summary": "All credentials verified. Offer letter generation pending."}'),
  ('b2000000-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'APP-GLB-002', 'a2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000003', 'OFFER_RELEASED', 93.50, 95.00, 92.00, 94.00, 'SELECTED', '{"summary": "Official offer letter released via portal."}'),
  ('b2000000-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000002', 'APP-GLB-003', 'a2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 'OFFER_FINAL_ACCEPTED', 95.00, 96.00, 94.00, 95.00, 'SELECTED', '{"summary": "Signed and accepted offer letter received. Conversion to employee ready."}'),
  ('b2000000-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000002', 'APP-GLB-004', 'a2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000006', 'ONBOARDED', 96.00, 98.00, 95.00, 96.00, 'ONBOARDING', '{"summary": "Successfully converted to full-time employee."}')
ON CONFLICT (organization_id, application_code) DO NOTHING;

-- ------------------------------------------------------------
-- 8. HIRING FUNNEL EVENTS
-- ------------------------------------------------------------
INSERT INTO public.hiring_funnel_events (organization_id, application_id, from_stage, to_stage, metadata) VALUES
  ('11111111-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', NULL, 'SOURCED', '{"source": "LINKEDIN"}'),
  ('11111111-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'SOURCED', 'CONTACTED', '{"channel": "EMAIL"}'),
  ('11111111-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000005', 'APPLIED', 'SHORTLISTED', '{"actor": "Carol HR"}'),
  ('11111111-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000006', 'SHORTLISTED', 'INTERVIEW', '{"round": 1}'),
  ('11111111-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000007', 'INTERVIEW', 'SELECTED', '{"decision": "SELECTED"}'),
  ('11111111-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000010', 'SELECTED', 'OFFER_INTEREST_SENT', '{"portal_link_created": true}'),
  ('11111111-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000010', 'OFFER_INTEREST_SENT', 'OFFER_ACCEPTED', '{"candidate_ip": "103.21.244.1"}'),
  ('11111111-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000010', 'OFFER_ACCEPTED', 'DOCUMENTS_PENDING', '{"docs_required": 6}');

-- ------------------------------------------------------------
-- 9. SOURCING SEARCHES & SOURCED CANDIDATES
-- ------------------------------------------------------------
INSERT INTO public.sourcing_searches (
  id, organization_id, requisition_id, search_title, platforms, skills_filter,
  min_experience, max_experience, location, status, total_results_count
) VALUES
  (
    's1000000-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'Senior React & TypeScript Engineers',
    '["linkedin", "github", "internal_db"]'::jsonb,
    '["React", "TypeScript", "Node.js"]'::jsonb,
    4.0, 8.0, 'Bengaluru', 'COMPLETED', 14
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sourced_candidates (
  organization_id, search_id, requisition_id, platform, full_name, email,
  "current_role", current_company, experience_years, skills, match_score,
  skill_score, experience_score, role_score, ai_reasoning, is_shortlisted
) VALUES
  (
    '11111111-0000-0000-0000-000000000001',
    's1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'LINKEDIN',
    'Deepak Verma',
    'deepak.verma@example.com',
    'Senior Full Stack Developer',
    'Paytm',
    6.0,
    '["React", "Node.js", "PostgreSQL", "Next.js"]'::jsonb,
    88.50,
    90.00,
    85.00,
    90.00,
    '{"strengths": ["6 years full stack experience", "Extensive React & Node production systems"]}'::jsonb,
    FALSE
  ),
  (
    '11111111-0000-0000-0000-000000000001',
    's1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'GITHUB',
    'Tarun Saxena',
    'tarun.saxena@example.com',
    'Staff Frontend Engineer',
    'Postman',
    7.5,
    '["TypeScript", "React 19", "WebSockets"]'::jsonb,
    92.00,
    95.00,
    90.00,
    91.00,
    '{"strengths": ["High open-source GitHub contribution", "Advanced TypeScript library maintainer"]}'::jsonb,
    FALSE
  );

-- ------------------------------------------------------------
-- 10. OUTREACH CAMPAIGNS, TEMPLATES & MESSAGES
-- ------------------------------------------------------------
INSERT INTO public.outreach_templates (
  id, organization_id, name, channel, subject, body_template, variables
) VALUES
  (
    't1000000-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    'Initial Engineering Outreach',
    'EMAIL',
    'Exciting Opportunity: {{role_title}} at {{company_name}}',
    'Hi {{candidate_name}},\n\nI came across your profile and was impressed with your work in {{key_skills}}. We are building high-throughput workforce infrastructure at {{company_name}} and would love to speak with you about our open {{role_title}} position.\n\nBest regards,\n{{recruiter_name}}',
    '["candidate_name", "role_title", "company_name", "key_skills", "recruiter_name"]'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.outreach_campaigns (
  id, organization_id, requisition_id, name, status, channels,
  total_targeted, total_sent, total_delivered, total_opened, total_replied
) VALUES
  (
    'm1000000-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'Senior Full-Stack Talent Outreach',
    'ACTIVE',
    '["EMAIL"]'::jsonb,
    25, 22, 21, 15, 6
  )
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 11. AI VOICE CALLS
-- ------------------------------------------------------------
INSERT INTO public.ai_voice_calls (
  organization_id, candidate_id, requisition_id, call_provider, provider_call_id,
  phone_number, call_purpose, status, duration_seconds, recording_url, transcript,
  ai_summary, overall_score, sentiment, extracted_data, model_name, model_version
) VALUES
  (
    '11111111-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'VAPI',
    'vapi_call_98124',
    '+91 98765 43210',
    'SCREENING',
    'COMPLETED',
    342,
    'https://storage.attendx.io/recordings/call_98124.mp3',
    'AI: Hi Aarav, thank you for taking the time to speak with AttendX. Could you share your recent hands-on experience with Next.js and PostgreSQL?\nAarav: Sure! At Infosys, I architected a multi-tenant client portal handling 50k DAU using Next.js App Router and PostgreSQL with row-level security.\nAI: That aligns well with our tech stack. What is your current notice period?\nAarav: 30 days, officially negotiable to 15 days.',
    'Aarav demonstrated crisp articulation of multi-tenant PostgreSQL RLS design and Next.js server components. Notice period is 30 days.',
    88.00,
    'POSITIVE',
    '{"confirmed_notice_period_days": 30, "experience_verified": true, "strongest_skill": "PostgreSQL RLS"}'::jsonb,
    'claude-3-7-sonnet',
    '20250219'
  );

-- ------------------------------------------------------------
-- 12. INTERVIEWS & CANDIDATE EVALUATIONS
-- ------------------------------------------------------------
INSERT INTO public.interviews (
  id, organization_id, application_id, candidate_id, round_number, round_type,
  title, scheduled_start, scheduled_end, timezone, platform, meeting_link,
  interviewer_ids, status, notes, ai_summary, decision, decided_by, decided_at
) VALUES
  (
    'i1000000-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000006',
    'c1000000-0000-0000-0000-000000000005',
    1,
    'TECHNICAL',
    'Round 1: System Design & TypeScript Deep Dive',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days' + INTERVAL '45 minutes',
    'Asia/Kolkata',
    'GOOGLE_MEET',
    'https://meet.google.com/abc-defg-hij',
    '["11111111-1111-1111-1111-444444444444"]'::jsonb,
    'COMPLETED',
    'Candidate solved state hydration and concurrent rendering challenges effectively.',
    'Clear architectural thinking in distributed state management. Recommended moving to Managerial round.',
    'PASS',
    '11111111-1111-1111-1111-444444444444',
    NOW() - INTERVAL '2 days'
  ),
  (
    'i1000000-0000-0000-0000-000000000002',
    '11111111-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000006',
    'c1000000-0000-0000-0000-000000000005',
    2,
    'MANAGERIAL',
    'Round 2: Engineering Culture & Ownership',
    NOW() + INTERVAL '1 day',
    NOW() + INTERVAL '1 day' + INTERVAL '45 minutes',
    'Asia/Kolkata',
    'GOOGLE_MEET',
    'https://meet.google.com/xyz-uvwx-rst',
    '["11111111-1111-1111-1111-444444444444"]'::jsonb,
    'SCHEDULED',
    NULL, NULL, 'PENDING', NULL, NULL
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.candidate_evaluations (
  organization_id, interview_id, application_id, candidate_id, evaluator_id,
  technical_score, communication_score, problem_solving_score, culture_fit_score,
  overall_score, scorecard_feedback, recommendation
) VALUES
  (
    '11111111-0000-0000-0000-000000000001',
    'i1000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000006',
    'c1000000-0000-0000-0000-000000000005',
    '11111111-1111-1111-1111-444444444444',
    90.00, 85.00, 92.00, 88.00, 88.75,
    'Demonstrated senior-level knowledge of React concurrency and PostgreSQL schema indexing. Very strong hire.',
    'STRONG_HIRE'
  );

-- ------------------------------------------------------------
-- 13. OFFER PORTAL TOKENS & JOB OFFERS
-- ------------------------------------------------------------
INSERT INTO public.offer_portal_tokens (
  organization_id, application_id, token_hash, purpose, expires_at, attempt_count
) VALUES
  (
    '11111111-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000008',
    'tok_hash_demo_interest_789abc',
    'INTEREST',
    NOW() + INTERVAL '7 days',
    0
  ),
  (
    '11111111-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000010',
    'tok_hash_demo_docs_123xyz',
    'DOCUMENTS',
    NOW() + INTERVAL '6 days',
    1
  )
ON CONFLICT (token_hash) DO NOTHING;

INSERT INTO public.job_offers (
  id, organization_id, application_id, candidate_id, offer_number, designation,
  department_id, fixed_salary, variable_salary, bonus, total_ctc, work_location,
  work_mode, reporting_manager_id, joining_date, probation_months, benefits,
  status, approval_status
) VALUES
  (
    'o1000000-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000010',
    'c1000000-0000-0000-0000-000000000001',
    'OFFER-ACME-2026-001',
    'Senior Full-Stack Engineer',
    '11111111-2222-3333-4444-000000000001',
    2200000.00,
    300000.00,
    200000.00,
    2700000.00,
    'Bengaluru HQ',
    'HYBRID',
    '11111111-1111-1111-1111-444444444444',
    CURRENT_DATE + INTERVAL '30 days',
    3,
    '["Comprehensive Health Insurance (Family coverage)", "Annual Learning Stipend ($1,000)", "Home Office Setup Allowance"]'::jsonb,
    'DRAFT',
    'APPROVED'
  )
ON CONFLICT (organization_id, offer_number) DO NOTHING;

-- ------------------------------------------------------------
-- 14. ONBOARDING PROCESSES, DOCUMENTS & TASKS
-- ------------------------------------------------------------
INSERT INTO public.onboarding_processes (
  id, organization_id, application_id, candidate_id, offer_id,
  status, completion_percentage, target_completion_date
) VALUES
  (
    'p1000000-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000010',
    'c1000000-0000-0000-0000-000000000001',
    'o1000000-0000-0000-0000-000000000001',
    'DOCUMENTS_PENDING',
    60.00,
    CURRENT_DATE + INTERVAL '25 days'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.onboarding_documents (
  organization_id, onboarding_id, document_type, document_name, file_url,
  status, is_required, reviewer_comment, reviewed_by, reviewed_at
) VALUES
  (
    '11111111-0000-0000-0000-000000000001',
    'p1000000-0000-0000-0000-000000000001',
    'ID_PROOF',
    'Aadhaar / National ID Card',
    'https://storage.attendx.io/docs/aarav_id.pdf',
    'VERIFIED',
    TRUE,
    'Government ID clearly verified against national database format.',
    '11111111-1111-1111-1111-333333333333',
    NOW() - INTERVAL '1 day'
  ),
  (
    '11111111-0000-0000-0000-000000000001',
    'p1000000-0000-0000-0000-000000000001',
    'EDUCATION_CERTIFICATE',
    'Degree Certificate (B.Tech Computer Science)',
    'https://storage.attendx.io/docs/aarav_degree.pdf',
    'VERIFIED',
    TRUE,
    'Original degree verified.',
    '11111111-1111-1111-1111-333333333333',
    NOW() - INTERVAL '1 day'
  ),
  (
    '11111111-0000-0000-0000-000000000001',
    'p1000000-0000-0000-0000-000000000001',
    'PREVIOUS_EMPLOYMENT',
    'Relieving Letter & Service Certificate',
    'https://storage.attendx.io/docs/aarav_relieving.pdf',
    'SUBMITTED',
    TRUE,
    NULL, NULL, NULL
  ),
  (
    '11111111-0000-0000-0000-000000000001',
    'p1000000-0000-0000-0000-000000000001',
    'SALARY_SLIP',
    'Last 3 Months Salary Slips',
    NULL,
    'NOT_SUBMITTED',
    TRUE,
    NULL, NULL, NULL
  ),
  (
    '11111111-0000-0000-0000-000000000001',
    'p1000000-0000-0000-0000-000000000001',
    'BANK_DETAILS',
    'Cancelled Cheque / Bank Passbook',
    'https://storage.attendx.io/docs/aarav_bank.pdf',
    'PENDING',
    TRUE,
    'IFSC code was partially blurry. Please re-upload a clear scan.',
    '11111111-1111-1111-1111-333333333333',
    NOW() - INTERVAL '12 hours'
  );

INSERT INTO public.onboarding_tasks (
  organization_id, onboarding_id, task_name, description, category, status, due_date
) VALUES
  ('11111111-0000-0000-0000-000000000001', 'p1000000-0000-0000-0000-000000000001', 'Provision Corporate Laptop (MacBook Pro M3)', 'Configure dev tools, VPN, and device security profiles', 'IT', 'IN_PROGRESS', CURRENT_DATE + INTERVAL '10 days'),
  ('11111111-0000-0000-0000-000000000001', 'p1000000-0000-0000-0000-000000000001', 'Create Google Workspace & GitHub accounts', 'Grant repository write access and add to engineering groups', 'IT', 'PENDING', CURRENT_DATE + INTERVAL '15 days'),
  ('11111111-0000-0000-0000-000000000001', 'p1000000-0000-0000-0000-000000000001', 'Schedule First-Day Orientation & Buddy intro', 'Assign engineering onboarding mentor', 'HR', 'PENDING', CURRENT_DATE + INTERVAL '20 days');

-- ------------------------------------------------------------
-- 15. HIRING ANALYTICS SNAPSHOTS & RECOMMENDATIONS
-- ------------------------------------------------------------
INSERT INTO public.hiring_analytics_snapshots (
  organization_id, snapshot_date, metrics
) VALUES
  (
    '11111111-0000-0000-0000-000000000001',
    CURRENT_DATE,
    '{
      "total_applications": 11,
      "active_requisitions": 2,
      "stage_distribution": {
        "SOURCED": 1,
        "CONTACTED": 1,
        "APPLIED": 2,
        "SHORTLISTED": 1,
        "INTERVIEW": 1,
        "SELECTED": 1,
        "OFFER_INTEREST_SENT": 1,
        "OFFER_ACCEPTED": 1,
        "DOCUMENTS_PENDING": 1,
        "REJECTED": 1
      },
      "average_time_to_hire_days": 21.4,
      "average_cost_per_hire": 42000,
      "bottleneck_stage": "DOCUMENTS_PENDING",
      "sourcing_channel_effectiveness": {
        "LINKEDIN": {"total": 4, "hire_rate": 0.25},
        "REFERRAL": {"total": 3, "hire_rate": 0.66},
        "GITHUB": {"total": 2, "hire_rate": 0.50},
        "NAUKRI": {"total": 2, "hire_rate": 0.00}
      }
    }'::jsonb
  )
ON CONFLICT (organization_id, snapshot_date) DO NOTHING;

INSERT INTO public.hiring_ai_recommendations (
  organization_id, requisition_id, recommendation_type, title, description, impact_score, status
) VALUES
  (
    '11111111-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'BOTTLENECK',
    'Document Collection Lag in REQ-ACME-001',
    'Candidates spend an average of 4.2 days uploading previous employer documents. Enable automated SMS reminders to reduce turnaround by 40%.',
    8.5,
    'PENDING'
  ),
  (
    '11111111-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000002',
    'SOURCING_GAP',
    'Low Pipeline Volume for AI Systems Engineers',
    'Only 1 shortlisted candidate currently in pipeline for REQ-ACME-002. Recommended action: Expand sourcing search to GitHub and HuggingFace repositories.',
    9.0,
    'PENDING'
  );
