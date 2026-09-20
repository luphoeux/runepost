// Utilidades de lectura de misiones desde Supabase.
// Usado por las paginas Astro para mostrar datos de quests.
import { createClient } from '@supabase/supabase-js';
import type { Quest } from './quest-types.ts';

function getSupabaseClient() {
    const url = (import.meta as any).env?.SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
    const key = (import.meta as any).env?.SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';
    if (!url || !key) throw new Error('Faltan SUPABASE_URL / SUPABASE_ANON_KEY en el entorno.');
    return createClient(url, key);
}

/** Obtiene una mision por ID. */
export async function getQuestById(id: number): Promise<Quest | null> {
    const { data, error } = await getSupabaseClient()
        .from('quests')
        .select('*')
        .eq('id', id)
        .single();
    if (error) { console.error('[quests]', error.message); return null; }
    return data as Quest;
}

/** Actualiza campos especificos de una mision en Supabase */
export async function updateQuest(id: number, updates: Partial<Quest>): Promise<{ error: Error | null }> {
    const { error } = await getSupabaseClient()
        .from('quests')
        .update(updates)
        .eq('id', id);
    return { error };
}

/**
 * Reconstruye la cadena completa a partir de cualquier mision de la cadena.
 * Navega hacia atras (prev_quest_id) hasta el inicio y luego hacia adelante.
 */
export async function getQuestChain(questId: number): Promise<Quest[]> {
    const supabase = getSupabaseClient();

    // Obtener todas las misiones de la misma cadena por chain_name
    const seed = await getQuestById(questId);
    if (!seed) return [];
    if (!seed.chain_name) return [seed];

    const { data, error } = await supabase
        .from('quests')
        .select('*')
        .eq('chain_name', seed.chain_name)
        .order('id', { ascending: true });

    if (error) { console.error('[quests]', error.message); return [seed]; }
    return (data ?? []) as Quest[];
}

/** Obtiene todas las misiones de una clase especifica. */
export async function getQuestsByClass(className: string): Promise<Quest[]> {
    const { data, error } = await getSupabaseClient()
        .from('quests')
        .select('*')
        .eq('class_req', className)
        .order('min_level', { ascending: true });
    if (error) { console.error('[quests]', error.message); return []; }
    return (data ?? []) as Quest[];
}

/** Obtiene todas las misiones de una raza especifica. */
export async function getQuestsByRace(raceName: string): Promise<Quest[]> {
    const { data, error } = await getSupabaseClient()
        .from('quests')
        .select('*')
        .eq('race_req', raceName)
        .order('min_level', { ascending: true });
    if (error) { console.error('[quests]', error.message); return []; }
    return (data ?? []) as Quest[];
}

/** Lista todas las misiones, con filtros opcionales. */
export async function listQuests(filters?: {
    zone?: string;
    category?: string;
    class_req?: string;
    race_req?: string;
}): Promise<Quest[]> {
    let query = getSupabaseClient().from('quests').select('*');
    if (filters?.zone)      query = query.eq('zone', filters.zone);
    if (filters?.category)  query = query.eq('category', filters.category);
    if (filters?.class_req) query = query.eq('class_req', filters.class_req);
    if (filters?.race_req)  query = query.eq('race_req', filters.race_req);
    const { data, error } = await query.order('id', { ascending: true });
    if (error) { console.error('[quests]', error.message); return []; }
    return (data ?? []) as Quest[];
}
