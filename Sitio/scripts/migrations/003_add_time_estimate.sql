-- Migracion 003: Agregar tiempo estimado a misiones
-- Ejecutar en: Supabase Studio > SQL Editor

ALTER TABLE quests ADD COLUMN IF NOT EXISTS time_estimate TEXT;
