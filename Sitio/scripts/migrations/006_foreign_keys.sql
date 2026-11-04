-- 006_foreign_keys.sql
-- Agregar llaves foráneas para que Supabase reconozca las relaciones en la API (joins)

-- 1. npc_vendors -> npcs
ALTER TABLE npc_vendors 
    ADD CONSTRAINT fk_npc_vendors_npc 
    FOREIGN KEY (npc_id) 
    REFERENCES npcs(npc_id) 
    ON DELETE CASCADE;

-- 2. npc_vendors -> items
ALTER TABLE npc_vendors 
    ADD CONSTRAINT fk_npc_vendors_item 
    FOREIGN KEY (item_id) 
    REFERENCES items(id) 
    ON DELETE CASCADE;

-- (Opcional) Puedes hacer lo mismo para el resto cuando consultemos los datos
-- ALTER TABLE loot ADD CONSTRAINT fk_loot_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE;
