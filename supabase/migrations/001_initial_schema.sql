-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  color_name TEXT NOT NULL,
  color_hex TEXT NOT NULL UNIQUE,
  blind_dots_used INT NOT NULL DEFAULT 0,
  revealed BOOLEAN NOT NULL DEFAULT false,
  credits INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create dots table
CREATE TABLE IF NOT EXISTS dots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  x FLOAT8 NOT NULL,
  y FLOAT8 NOT NULL,
  color_hex TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('blind', 'paid')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_dots_created_at ON dots(created_at);
CREATE INDEX IF NOT EXISTS idx_dots_session_id ON dots(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_color_hex ON sessions(color_hex);



