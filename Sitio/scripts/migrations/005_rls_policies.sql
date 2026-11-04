-- 005_rls_policies.sql
-- Habilitar RLS (Row Level Security) y crear políticas de acceso

-- 1. Habilitar RLS en todas las tablas
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE npcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE npc_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE gameobjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE loot ENABLE ROW LEVEL SECURITY;
ALTER TABLE npc_trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxis ENABLE ROW LEVEL SECURITY;
ALTER TABLE factions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auras ENABLE ROW LEVEL SECURITY;

-- 2. Crear políticas que permiten acceso total (Lectura, Inserción, Actualización, Borrado)
-- a cualquier usuario (incluido el rol "anon" que usa tu panel sin login).

-- Tabla: items
CREATE POLICY "Acceso total anonimo items" ON items FOR ALL USING (true) WITH CHECK (true);

-- Tabla: npcs
CREATE POLICY "Acceso total anonimo npcs" ON npcs FOR ALL USING (true) WITH CHECK (true);

-- Tabla: quests
CREATE POLICY "Acceso total anonimo quests" ON quests FOR ALL USING (true) WITH CHECK (true);

-- Tabla: npc_vendors
CREATE POLICY "Acceso total anonimo npc_vendors" ON npc_vendors FOR ALL USING (true) WITH CHECK (true);

-- Tabla: gameobjects
CREATE POLICY "Acceso total anonimo gameobjects" ON gameobjects FOR ALL USING (true) WITH CHECK (true);

-- Tabla: loot
CREATE POLICY "Acceso total anonimo loot" ON loot FOR ALL USING (true) WITH CHECK (true);

-- Tabla: npc_trainers
CREATE POLICY "Acceso total anonimo npc_trainers" ON npc_trainers FOR ALL USING (true) WITH CHECK (true);

-- Tabla: recipes
CREATE POLICY "Acceso total anonimo recipes" ON recipes FOR ALL USING (true) WITH CHECK (true);

-- Tabla: taxis
CREATE POLICY "Acceso total anonimo taxis" ON taxis FOR ALL USING (true) WITH CHECK (true);

-- Tabla: factions
CREATE POLICY "Acceso total anonimo factions" ON factions FOR ALL USING (true) WITH CHECK (true);

-- Tabla: auras
CREATE POLICY "Acceso total anonimo auras" ON auras FOR ALL USING (true) WITH CHECK (true);
