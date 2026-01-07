-- Migration: Permanent coordinate system fix
-- 
-- This migration:
-- 1. Deletes all existing dots (they may have pixel coordinates that cannot be reliably converted)
-- 2. Adds optional clientW/clientH columns for debugging/auditing
-- 3. Ensures all future dots use normalized [0,1] coordinates
--
-- WARNING: This deletes all existing dots in the database.
-- For production: If you have logged original canvas dimensions, you can convert instead:
--   UPDATE dots SET x = x / original_width, y = y / original_height WHERE x > 1 OR y > 1;
-- Otherwise, delete legacy dots to start fresh.

-- Delete all existing dots (they may have pixel coordinates)
DELETE FROM dots;

-- Add optional clientW/clientH columns for debugging/auditing
-- These store the viewport dimensions when the dot was placed
ALTER TABLE dots 
  ADD COLUMN IF NOT EXISTS client_w FLOAT8,
  ADD COLUMN IF NOT EXISTS client_h FLOAT8;

-- Add check constraint to enforce normalized coordinates [0,1]
-- This prevents pixel coordinates from being inserted
ALTER TABLE dots 
  DROP CONSTRAINT IF EXISTS dots_coordinates_check;

ALTER TABLE dots 
  ADD CONSTRAINT dots_coordinates_check 
  CHECK (x >= 0 AND x <= 1 AND y >= 0 AND y <= 1);

-- Note: The constraint ensures x and y are always in [0,1]
-- Any attempt to insert coordinates outside this range will fail with a database error


