-- 004_addon_advanced_tables.sql
-- Nuevas tablas para soportar la captura avanzada de QuestScraper

CREATE TABLE IF NOT EXISTS gameobjects (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    zone TEXT,
    area TEXT,
    map_id BIGINT,
    pos_x FLOAT,
    pos_y FLOAT,
    seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS npc_vendors (
    npc_id BIGINT NOT NULL, -- references npcs(npc_id) if it exists as PK, otherwise just BIGINT
    item_id BIGINT NOT NULL, -- references items(id)
    price BIGINT,
    quantity_sold INTEGER,
    stock INTEGER,
    extended_cost BIGINT,
    PRIMARY KEY (npc_id, item_id)
);

CREATE TABLE IF NOT EXISTS loot (
    source_type TEXT NOT NULL, -- 'npc', 'gameobject', 'item'
    source_id BIGINT NOT NULL,
    item_id BIGINT NOT NULL,
    total_dropped INTEGER DEFAULT 1,
    looted_times INTEGER DEFAULT 1,
    PRIMARY KEY (source_type, source_id, item_id)
);

CREATE TABLE IF NOT EXISTS npc_trainers (
    npc_id BIGINT NOT NULL,
    service_name TEXT NOT NULL,
    rank TEXT,
    cost BIGINT,
    req_level INTEGER,
    spell_or_item_id BIGINT,
    PRIMARY KEY (npc_id, service_name)
);

CREATE TABLE IF NOT EXISTS recipes (
    spell_id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    creates_item_id BIGINT,
    reagents JSONB, -- Array de { item_id, count }
    scanned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS taxis (
    name TEXT PRIMARY KEY,
    cost BIGINT,
    map_id BIGINT,
    zone TEXT,
    area TEXT,
    pos_x FLOAT,
    pos_y FLOAT
);

CREATE TABLE IF NOT EXISTS factions (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    standing TEXT,
    val INTEGER,
    min INTEGER,
    max INTEGER
);

CREATE TABLE IF NOT EXISTS auras (
    spell_id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    debuff_type TEXT,
    duration FLOAT,
    is_stealable BOOLEAN,
    seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
