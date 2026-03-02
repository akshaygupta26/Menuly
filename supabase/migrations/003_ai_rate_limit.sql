-- Add AI generation rate-limiting columns to profiles
ALTER TABLE profiles
  ADD COLUMN ai_generation_count INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN ai_generation_reset_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  ADD COLUMN ai_unlimited BOOLEAN DEFAULT false NOT NULL;
