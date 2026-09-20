// Tipos TypeScript que reflejan el schema de la tabla `quests` en Supabase.
// Compartido entre los scripts de insercion y las utilidades del sitio Astro.

export interface QuestRewardItem {
    name: string;
    quantity: number;
    quality?: 'Poor' | 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
}

export interface Quest {
    id: number;
    title: string;

    // Contenido
    description?: string;
    objectives?: string[];
    completion_text?: string;

    // Cadena
    prev_quest_id?: number;
    next_quest_id?: number;
    chain_name?: string;

    // Clasificacion
    category?: string;
    quest_type?: 'Normal' | 'Elite' | 'Raid' | 'Daily';
    class_req?: string;
    race_req?: string;
    min_level?: number;

    // Ubicacion
    zone?: string;
    area?: string;
    giver_npc?: string;
    turn_in_npc?: string;

    // Recompensas
    reward_xp?: number;
    reward_gold?: number; // en cobres
    reward_items?: QuestRewardItem[];

    // Metadata
    source?: string;
    notes?: string;
    created_at?: string;
    updated_at?: string;
}

/** Util: convierte cobres a formato legible "X oro Y plata Z cobre" */
export function formatGold(copper: number): string {
    const gold   = Math.floor(copper / 10000);
    const silver = Math.floor((copper % 10000) / 100);
    const cop    = copper % 100;
    const parts: string[] = [];
    if (gold)   parts.push(`${gold} oro`);
    if (silver) parts.push(`${silver} plata`);
    if (cop)    parts.push(`${cop} cobre`);
    return parts.join(' ') || '0 cobre';
}
