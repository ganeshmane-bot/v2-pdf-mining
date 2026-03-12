-- ══════════════════════════════════════════════════
-- MATERIAL DEPOT — PDF MINER (SIMPLE)
-- Run once in Supabase SQL Editor
-- ══════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── CATEGORIES ────────────────────────────────────
CREATE TABLE categories (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

INSERT INTO categories (name) VALUES
  ('tiles'),('laminates'),('panels'),('louvers'),('wallpapers'),('quartz');

-- ── JOBS ──────────────────────────────────────────
-- One row per extraction run
CREATE TABLE jobs (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid REFERENCES auth.users(id),
  pdf_name     text NOT NULL,
  category_id  uuid REFERENCES categories(id),
  status       text DEFAULT 'pending',  -- pending | processing | done | failed
  row_count    int  DEFAULT 0,
  csv_output   text,                    -- the full CSV string
  error        text,
  created_at   timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- ── RLS ───────────────────────────────────────────
ALTER TABLE jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON jobs       FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all" ON categories FOR ALL TO authenticated USING (true);

-- ── INDEXES ───────────────────────────────────────
CREATE INDEX idx_jobs_user ON jobs(user_id);
CREATE INDEX idx_jobs_created ON jobs(created_at DESC);
