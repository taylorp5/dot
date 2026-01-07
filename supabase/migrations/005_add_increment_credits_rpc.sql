-- Create RPC function for atomic credit increment
-- This avoids race conditions when multiple webhooks process simultaneously
CREATE OR REPLACE FUNCTION increment_credits(
  p_session_id UUID,
  p_amount INT
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  new_credits INT;
BEGIN
  UPDATE sessions
  SET credits = credits + p_amount
  WHERE session_id = p_session_id
  RETURNING credits INTO new_credits;
  
  RETURN new_credits;
END;
$$;

