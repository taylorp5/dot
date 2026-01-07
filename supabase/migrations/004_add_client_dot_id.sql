-- Migration: Add client_dot_id for idempotency support
-- This allows clients to retry dot placements without creating duplicates

-- Add client_dot_id column to dots table
ALTER TABLE dots 
  ADD COLUMN IF NOT EXISTS client_dot_id UUID;

-- Create unique index on (session_id, client_dot_id) for idempotency
-- This ensures the same client_dot_id can only be used once per session
CREATE UNIQUE INDEX IF NOT EXISTS idx_dots_session_client_dot_id 
  ON dots(session_id, client_dot_id) 
  WHERE client_dot_id IS NOT NULL;

-- Note: client_dot_id is nullable to support existing dots and paid dots
-- that may not have a client_dot_id (they're placed after reveal)

