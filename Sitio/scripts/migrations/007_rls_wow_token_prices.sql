-- 007_rls_wow_token_prices.sql
-- Habilitar RLS (Row Level Security) en wow_token_prices sin cambiar el comportamiento actual.
--
-- Consumidores de la tabla:
--   - Sitio/scripts/token-cron.mjs            -> SUPABASE_SERVICE_ROLE_KEY (bypassa RLS)
--   - supabase/functions/fetch-wow-token      -> SUPABASE_SERVICE_ROLE_KEY (bypassa RLS)
--   - Admin/src/components/TokenAdmin.tsx     -> VITE_SUPABASE_ANON_KEY (SELECT/INSERT/DELETE)
--   - supabase/functions/get-latest-wow-token -> SUPABASE_ANON_KEY (SELECT)
--
-- La politica es permisiva para replicar el acceso actual del panel admin sin login.

BEGIN;

ALTER TABLE wow_token_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso total anonimo wow_token_prices" ON wow_token_prices;

CREATE POLICY "Acceso total anonimo wow_token_prices"
    ON wow_token_prices
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

COMMIT;
