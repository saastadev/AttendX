-- ============================================================
-- AttendX v2 — Reset and Clean Auth Users
-- Run this in Supabase SQL Editor (khaxowomjczuckfuraoh)
-- ============================================================

DELETE FROM auth.identities;
DELETE FROM auth.users;
