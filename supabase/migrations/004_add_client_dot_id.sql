-- Add client_dot_id column to dots table
ALTER TABLE dots ADD COLUMN IF NOT EXISTS client_dot_id TEXT;

-- Create unique index on (session_id, client_dot_id)
-- This ensures each clientDotId is unique per session
CREATE UNIQUE INDEX IF NOT EXISTS dots_session_clientdot_unique ON dots(session_id, client_dot_id) WHERE client_dot_id IS NOT NULL;


