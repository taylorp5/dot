-- Migration: Normalize dot coordinates to [0,1]
-- 
-- WARNING: This migration deletes all existing dots because we cannot reliably
-- convert old pixel-based coordinates to normalized coordinates without knowing
-- the original canvas dimensions.
--
-- For production: If you have logged the original canvas dimensions, you can
-- modify this migration to convert coordinates instead of deleting.
-- Example conversion (if canvas was 1200x600):
--   x_norm = x_old / 1200.0
--   y_norm = y_old / 600.0
--
-- For now, we delete all dots to start fresh with normalized coordinates.

-- Delete all existing dots (they use old pixel-based coordinates)
DELETE FROM dots;

-- Note: The x and y columns are already FLOAT8, so they can store [0,1] values
-- No schema changes needed, just data cleanup

