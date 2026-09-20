#!/usr/bin/env node
// Script CLI para insertar misiones extraidas de capturas de pantalla en Supabase.
// Uso: node scripts/quest-insert.ts '<json>'
//   o: node scripts/quest-insert.ts --file quests/mision-01.json
//
// Requiere SUPABASE_SERVICE_ROLE_KEY en .env para poder insertar sin RLS.

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { Quest } from '../src/utils/quest-types.ts';

/* ---------- Entorno ---------- */

function loadEnv(key: string): string {
    if (process.env[key]) return process.env[key]!;
    try {
        const envFile = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf-8');
        const line = envFile.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
        if (line) {
            const v = line.slice(key.length + 1).trim();
            if (v && !v.startsWith('#')) return v;
        }
    } catch { /* ignorar */ }
    return '';
}

function getClient() {
    const url = loadEnv('SUPABASE_URL');
    // Prioriza service_role; si no existe, usa anon (solo lectura, puede fallar en insert)
    const key = loadEnv('SUPABASE_SERVICE_ROLE_KEY') || loadEnv('SUPABASE_ANON_KEY');
    if (!url || !key) throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env');
    if (!loadEnv('SUPABASE_SERVICE_ROLE_KEY')) {
        console.warn('[quest-insert] Usando clave anon. La insercion puede fallar si RLS esta activo.');
    }
    return createClient(url, key);
}

/* ---------- Validacion ---------- */

function validate(quest: Partial<Quest>): quest is Quest {
    if (!quest.id || typeof quest.id !== 'number') {
        throw new Error('Campo requerido: "id" (numero entero)');
    }
    if (!quest.title || typeof quest.title !== 'string') {
        throw new Error('Campo requerido: "title" (string)');
    }
    return true;
}

/* ---------- Insercion ---------- */

async function upsertQuest(quest: Quest): Promise<void> {
    const supabase = getClient();
    const { data, error } = await supabase
        .from('quests')
        .upsert(quest, { onConflict: 'id' })
        .select('id, title')
        .single();

    if (error) throw new Error(`Supabase error: ${error.message}`);
    console.log(`[OK] Mision insertada/actualizada: #${data.id} "${data.title}"`);
}

/* ---------- CLI ---------- */

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log(`
Uso:
  node scripts/quest-insert.ts '<json>'
  node scripts/quest-insert.ts --file <ruta/al/archivo.json>

Ejemplo JSON minimo:
  {
    "id": 1,
    "title": "El Llamado del Bosque",
    "description": "Los espiritus del bosque te necesitan...",
    "objectives": ["Habla con el Archidruida Remulos"],
    "zone": "Bosque de Moonglade",
    "class_req": "Druid",
    "race_req": "Skyborne",
    "min_level": 1,
    "chain_name": "Cadena del Druida Skyborne"
  }
        `.trim());
        process.exit(0);
    }

    let raw: string;

    if (args[0] === '--file' && args[1]) {
        const filePath = path.resolve(args[1]);
        if (!fs.existsSync(filePath)) throw new Error(`Archivo no encontrado: ${filePath}`);
        raw = fs.readFileSync(filePath, 'utf-8');
    } else {
        raw = args[0];
    }

    let parsed: Partial<Quest>;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('JSON invalido. Verifica la sintaxis.');
    }

    if (validate(parsed)) await upsertQuest(parsed);
}

main().catch((err) => {
    console.error('[ERROR]', err.message);
    process.exit(1);
});
