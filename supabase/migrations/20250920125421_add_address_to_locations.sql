-- Migration: Add address column to locations and set Deliklikaya example
-- Run this in Supabase SQL Editor or include in your migration pipeline

ALTER TABLE IF EXISTS locations
  ADD COLUMN IF NOT EXISTS address text;

-- Optional: set the Deliklikaya example address if a matching row exists
UPDATE locations
SET address = 'Deliklikaya, 34555 Arnavutköy/İstanbul'
WHERE LOWER(name) LIKE '%deliklikaya%';
