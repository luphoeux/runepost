-- Migracion 001: Tabla de misiones de WoW Forever
-- Ejecutar en: Supabase Studio > SQL Editor

CREATE TABLE IF NOT EXISTS quests (
    -- Identificacion
    id              INTEGER PRIMARY KEY,         -- ID de la mision (del juego o asignado manualmente)
    title           TEXT        NOT NULL,

    -- Contenido
    description     TEXT,                        -- Texto del NPC al aceptar
    objectives      TEXT[],                      -- ["Matar 10 Kobolds", "Hablar con Thrall"]
    completion_text TEXT,                        -- Texto del NPC al entregar

    -- Cadena (modelo Blizzard: se completa manualmente)
    prev_quest_id   INTEGER REFERENCES quests(id) ON DELETE SET NULL,
    next_quest_id   INTEGER REFERENCES quests(id) ON DELETE SET NULL,
    chain_name      TEXT,                        -- Nombre descriptivo de la cadena

    -- Clasificacion
    category        TEXT,                        -- "Clase", "Principal", "Secundaria", "Diario"
    quest_type      TEXT DEFAULT 'Normal',       -- "Normal", "Elite", "Raid", "Daily"
    class_req       TEXT,                        -- "Druid" | NULL = sin restriccion
    race_req        TEXT,                        -- "Skyborne" | NULL = sin restriccion
    min_level       INTEGER,

    -- Ubicacion
    zone            TEXT,
    area            TEXT,
    giver_npc       TEXT,
    turn_in_npc     TEXT,

    -- Recompensas
    reward_xp       INTEGER,
    reward_gold     INTEGER,                     -- en cobres (copper), como Blizzard
    reward_items    JSONB DEFAULT '[]'::jsonb,   -- [{ "name": "...", "quantity": 1, "quality": "Uncommon" }]

    -- Metadata
    source          TEXT DEFAULT 'screenshot',
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Indices utiles
CREATE INDEX IF NOT EXISTS idx_quests_class_req  ON quests(class_req);
CREATE INDEX IF NOT EXISTS idx_quests_race_req   ON quests(race_req);
CREATE INDEX IF NOT EXISTS idx_quests_zone       ON quests(zone);
CREATE INDEX IF NOT EXISTS idx_quests_chain_name ON quests(chain_name);

-- Trigger para actualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER quests_updated_at
    BEFORE UPDATE ON quests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: deshabilitado por defecto para facilitar insercion desde scripts.
-- Habilitar y configurar politicas cuando el sitio sea publico.
ALTER TABLE quests DISABLE ROW LEVEL SECURITY;
