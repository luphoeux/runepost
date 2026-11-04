-- 008_fix_rls_security_all_tables.sql
-- Resuelve la vulnerabilidad rls_disabled_in_public en Supabase.
-- Habilita Row Level Security (RLS) en todas las tablas del esquema public
-- y configura las políticas de acceso de forma idempotente.

BEGIN;

-- 1. Habilitar RLS en todas las tablas existentes del esquema public
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
    END LOOP;
END $$;

-- 2. Configurar politicas de acceso para las tablas de la aplicacion
DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'quests',
        'items',
        'npcs',
        'npc_vendors',
        'gameobjects',
        'loot',
        'npc_trainers',
        'recipes',
        'taxis',
        'factions',
        'auras',
        'wow_token_prices'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
            EXECUTE format('DROP POLICY IF EXISTS "Acceso total anonimo %I" ON public.%I;', t, t);
            EXECUTE format('CREATE POLICY "Acceso total anonimo %I" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);', t, t);
        END IF;
    END LOOP;
END $$;

COMMIT;
