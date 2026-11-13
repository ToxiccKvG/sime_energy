-- Auth events table for security monitoring
-- Logs failed login attempts (no PII stored — no email, no IP)
CREATE TABLE IF NOT EXISTS auth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE auth_events ENABLE ROW LEVEL SECURITY;

-- Allow any authenticated or anon client to INSERT (write-only access)
CREATE POLICY "allow_insert" ON auth_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);
