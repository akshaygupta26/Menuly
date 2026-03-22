-- 010_onboarding.sql
-- Add onboarding tracking and preference columns to profiles

ALTER TABLE profiles
  ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN onboarding_page_visits JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN dietary_preferences TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN allergies TEXT[] NOT NULL DEFAULT '{}';
