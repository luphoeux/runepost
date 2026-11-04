#!/usr/bin/env node
// Importa misiones capturadas por el addon QuestScraper desde el archivo SavedVariables de WoW.
// Uso: node scripts/quest-from-addon.mjs
//
// El addon guarda los datos en:
//   E:\World of Warcraft\_classic_beta_\WTF\Account\<CUENTA>\SavedVariables\QuestScraper.lua

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

/* ---------- Config ---------- */

const SAVED_VAR_FILENAME = 'QuestScraper.lua';

/* ---------- Entorno ---------- */

function loadEnv(key) {
    if (process.env[key]) return process.env[key];
    try {
        const envFile = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf-8');
        const line = envFile.split(/\r?\n/).find(l => l.startsWith(`${key}=`));
        if (line) return line.slice(key.length + 1).trim();
    } catch { }
    return '';
}

function getSupabase() {
    const url = loadEnv('SUPABASE_URL');
    const key = loadEnv('SUPABASE_SERVICE_ROLE_KEY') || loadEnv('SUPABASE_ANON_KEY');
    if (!url || !key) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env');
    return createClient(url, key);
}

/* ---------- Buscar el archivo SavedVariables ---------- */

function getCandidateWowAccountDirs() {
    const customPath = loadEnv('WOW_PATH');
    const baseCandidates = [
        customPath,
        'E:\\World of Warcraft',
        'C:\\Program Files (x86)\\World of Warcraft',
        'C:\\World of Warcraft',
        'D:\\World of Warcraft',
    ].filter(Boolean);

    // Prioridad 1: The War Within: Forever (_forever_), Prioridad 2: Retail (_retail_)
    const flavors = ['_forever_', '_retail_', '_classic_beta_', '_ptr_', '_xptr_'];
    const accountDirs = [];

    for (const base of baseCandidates) {
        for (const flavor of flavors) {
            const candidate = path.join(base, flavor, 'WTF', 'Account');
            if (fs.existsSync(candidate) && !accountDirs.includes(candidate)) {
                accountDirs.push(candidate);
            }
        }
        const directAccount = path.join(base, 'WTF', 'Account');
        if (fs.existsSync(directAccount) && !accountDirs.includes(directAccount)) {
            accountDirs.push(directAccount);
        }
    }

    return accountDirs;
}

function findSavedVarsFile() {
    const accountDirs = getCandidateWowAccountDirs();
    if (accountDirs.length === 0) {
        throw new Error('No se encontro la carpeta WTF/Account en las rutas de WoW configuradas o detectadas.');
    }

    const candidates = [];
    for (const accountDir of accountDirs) {
        try {
            const accounts = fs.readdirSync(accountDir, { withFileTypes: true })
                .filter(d => d.isDirectory())
                .map(d => d.name);

            for (const account of accounts) {
                const candidate = path.join(accountDir, account, 'SavedVariables', SAVED_VAR_FILENAME);
                if (fs.existsSync(candidate)) {
                    const stat = fs.statSync(candidate);
                    candidates.push({ path: candidate, mtime: stat.mtimeMs });
                }
            }

            const sharedCandidate = path.join(accountDir, 'SavedVariables', SAVED_VAR_FILENAME);
            if (fs.existsSync(sharedCandidate)) {
                const stat = fs.statSync(sharedCandidate);
                candidates.push({ path: sharedCandidate, mtime: stat.mtimeMs });
            }
        } catch { }
    }

    if (candidates.length === 0) {
        throw new Error(
            `No se encontro ${SAVED_VAR_FILENAME}. ` +
            'Asegurate de haber entrado al juego con el addon activado, interactuar con misiones y ejecutar /reload o salir del personaje.'
        );
    }

    candidates.sort((a, b) => b.mtime - a.mtime);

    if (candidates.length > 1) {
        console.log('[addon-import] Archivos de SavedVariables encontrados:');
        candidates.forEach((c, i) => console.log(`  [${i}] ${c.path} (modificado: ${new Date(c.mtime).toISOString()})`));
        console.log(`[addon-import] Usando el mas reciente: ${candidates[0].path}`);
    }

    return candidates[0].path;
}

/* ---------- Parser de Lua SavedVariables ---------- */
// WoW guarda las variables en Lua. Usamos regex para extraer la tabla sin depender de un interprete Lua.

function parseLuaString(content) {
    const quests = {};

    // Encontrar el inicio de ["quests"] = {
    const questsMatch = content.match(/\["quests"\]\s*=\s*\{/);
    if (!questsMatch) return quests;
    
    let startIndex = questsMatch.index + questsMatch[0].length;
    const keyRegex = /\["([^"]+)"\]\s*=\s*\{/g;
    keyRegex.lastIndex = startIndex;
    
    let match;
    while ((match = keyRegex.exec(content)) !== null) {
        const key = match[1];
        let braceCount = 1;
        let i = match.index + match[0].length;
        let inString = false;
        let escape = false;
        
        while (i < content.length && braceCount > 0) {
            const char = content[i];
            if (escape) {
                escape = false;
            } else if (char === '\\') {
                escape = true;
            } else if (char === '"') {
                inString = !inString;
            } else if (!inString) {
                if (char === '{') braceCount++;
                else if (char === '}') braceCount--;
            }
            i++;
        }
        
        if (braceCount === 0) {
            const body = content.substring(match.index + match[0].length, i - 1);
            const entry = {};

            // Helper to find a field safely
            const strFields = ['title', 'description', 'completion_text', 'giver_npc', 'zone', 'area', 'captured_at'];
            for (const field of strFields) {
                const re = new RegExp(`\\[?"${field}"\\]?\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`);
                const m = body.match(re);
                if (m) entry[field] = m[1].replace(/\\r/g, '').replace(/\\n/g, '\n').replace(/\\"/g, '"');
            }

            const numFields = ['reward_xp', 'reward_gold', 'quest_id'];
            for (const field of numFields) {
                const re = new RegExp(`\\[?"${field}"\\]?\\s*=\\s*(\\d+)`);
                const m = body.match(re);
                if (m) entry[field] = parseInt(m[1], 10);
            }

            // Extract objectives
            const objMatch = body.match(/\["objectives"\]\s*=\s*\{([\s\S]*?)\n\s*\}/);
            if (objMatch) {
                entry.objectives = [...objMatch[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)]
                    .map(m => m[1]);
            }

            // Extract reward_items
            const itemsMatch = body.match(/\["reward_items"\]\s*=\s*\{([\s\S]*?)\n\s*\},\n/);
            if (itemsMatch) {
                const itemsBlock = itemsMatch[1];
                const itemEntries = [...itemsBlock.matchAll(/\{\s*([^}]+)\s*\}/g)];
                entry.reward_items = itemEntries.map(ie => {
                    const ib = ie[1];
                    const item = {};
                    const nameM = ib.match(/\["name"\]\s*=\s*"([^"]*)"/);
                    const qtyM  = ib.match(/\["quantity"\]\s*=\s*(\d+)/);
                    const qualM = ib.match(/\["quality"\]\s*=\s*(\d+)/);
                    
                    if (nameM) item.name = nameM[1];
                    if (qtyM)  item.quantity = parseInt(qtyM[1], 10);
                    if (qualM) {
                        const qualMap = { 0: 'Poor', 1: 'Common', 2: 'Uncommon', 3: 'Rare', 4: 'Epic', 5: 'Legendary' };
                        item.quality = qualMap[parseInt(qualM[1], 10)] ?? 'Common';
                    }
                    return item;
                }).filter(i => i.name);
            }

            if (entry.title) {
                quests[key] = entry;
            }
            
            keyRegex.lastIndex = i;
        } else {
            break; // Malformed Lua table
        }
    }

    return quests;
}

/* ---------- Mapeo Lua → schema Supabase ---------- */

let autoId = 9000; // IDs temporales para misiones sin ID del juego

function luaEntryToSupabase(key, entry) {
    let id = entry.quest_id;
    if (!id) {
        // Intentar parsear el key como numero
        const parsed = parseInt(key, 10);
        id = !isNaN(parsed) ? parsed : ++autoId;
    }

    return {
        id,
        title:           entry.title,
        description:     entry.description     || null,
        completion_text: entry.completion_text || null,
        objectives:      entry.objectives?.length ? entry.objectives : null,
        giver_npc:       entry.giver_npc       || null,
        zone:            entry.zone            || null,
        area:            entry.area            || null,
        reward_xp:       entry.reward_xp       || null,
        reward_gold:     entry.reward_gold      || null,
        reward_items:    entry.reward_items?.length ? entry.reward_items : null,
        source:          'addon',
    };
}

/* ---------- Main ---------- */

async function main() {
    const savedVarsFile = findSavedVarsFile();
    console.log(`[addon-import] Leyendo: ${savedVarsFile}`);

    const content = fs.readFileSync(savedVarsFile, 'utf-8');
    const quests = parseLuaString(content);

    const count = Object.keys(quests).length;
    if (count === 0) {
        console.log('[addon-import] No se encontraron misiones en el archivo. Abre misiones en el juego primero.');
        return;
    }

    console.log(`[addon-import] ${count} misiones encontradas. Insertando en Supabase...`);

    const supabase = getSupabase();
    let ok = 0;
    let errors = 0;

    for (const [key, entry] of Object.entries(quests)) {
        const row = luaEntryToSupabase(key, entry);
        const { error } = await supabase.from('quests').upsert(row, { onConflict: 'id' });
        if (error) {
            console.error(`  [ERROR] ${entry.title}: ${error.message}`);
            errors++;
        } else {
            console.log(`  [OK] #${row.id} "${row.title}"`);
            ok++;
        }
    }

    console.log(`\n[addon-import] Completado: ${ok} insertadas, ${errors} errores.`);
}

main().catch(err => {
    console.error('[ERROR]', err.message);
    process.exit(1);
});
