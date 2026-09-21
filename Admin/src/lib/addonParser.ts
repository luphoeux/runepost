import { supabase } from './supabaseClient';

function extractLuaBlock(content: string, blockName: string): string | null {
    const match = content.match(new RegExp(`\\["${blockName}"\\]\\s*=\\s*\\{`));
    if (!match) return null;
    
    let braceCount = 1;
    let i = match.index! + match[0].length;
    let inString = false;
    let escape = false;
    const startIndex = i;
    
    while (i < content.length && braceCount > 0) {
        const char = content[i];
        if (escape) escape = false;
        else if (char === '\\') escape = true;
        else if (char === '"') inString = !inString;
        else if (!inString) {
            if (char === '{') braceCount++;
            else if (char === '}') braceCount--;
        }
        i++;
    }
    
    if (braceCount === 0) {
        return content.substring(startIndex, i - 1);
    }
    return null;
}

function parseLuaString(content: string) {
    const quests: Record<string, any> = {};
    const inventoryItems: Record<string, any> = {};
    const seenItems: number[] = [];

    // 1. Parse quests
    const questsBlock = extractLuaBlock(content, 'quests');
    if (questsBlock) {
        const keyRegex = /\["([^"]+)"\]\s*=\s*\{/g;
        let match;
        while ((match = keyRegex.exec(questsBlock)) !== null) {
            const key = match[1];
            const block = extractLuaBlock(questsBlock.substring(match.index), key);
            if (block) {
                const entry: any = {};

                const strFields = ['title', 'description', 'completion_text', 'giver_npc', 'zone', 'area', 'captured_at'];
                for (const field of strFields) {
                    const re = new RegExp(`\\[?"${field}"\\]?\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`);
                    const m = block.match(re);
                    if (m) entry[field] = m[1].replace(/\\r/g, '').replace(/\\n/g, '\n').replace(/\\"/g, '"');
                }

                const numFields = ['reward_xp', 'reward_gold', 'quest_id'];
                for (const field of numFields) {
                    const re = new RegExp(`\\[?"${field}"\\]?\\s*=\\s*(\\d+)`);
                    const m = block.match(re);
                    if (m) entry[field] = parseInt(m[1], 10);
                }

                const objMatch = block.match(/\["objectives"\]\s*=\s*\{([\s\S]*?)\n\s*\}/);
                if (objMatch) {
                    entry.objectives = [...objMatch[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)]
                        .map(m => m[1]);
                }

                const itemsMatch = block.match(/\["reward_items"\]\s*=\s*\{([\s\S]*?)\n\s*\}/);
                if (itemsMatch) {
                    const itemsBlock = itemsMatch[1];
                    const itemEntries = [...itemsBlock.matchAll(/\{\s*([^}]+)\s*\}/g)];
                    entry.reward_items = itemEntries.map(ie => {
                        const ib = ie[1];
                        const item: any = {};
                        const nameM = ib.match(/\["name"\]\s*=\s*"([^"]*)"/);
                        const qtyM  = ib.match(/\["quantity"\]\s*=\s*(\d+)/);
                        const qualM = ib.match(/\["quality"\]\s*=\s*(\d+)/);
                        
                        if (nameM) item.name = nameM[1];
                        if (qtyM)  item.quantity = parseInt(qtyM[1], 10);
                        if (qualM) {
                            const qualMap: Record<number, string> = { 0: 'Poor', 1: 'Common', 2: 'Uncommon', 3: 'Rare', 4: 'Epic', 5: 'Legendary' };
                            item.quality = qualMap[parseInt(qualM[1], 10)] ?? 'Common';
                        }
                        return item;
                    }).filter((i: any) => i.name);
                }

                if (entry.title) {
                    quests[key] = entry;
                }
            }
        }
    }

    // 2. Parse inventory
    const inventoryBlock = extractLuaBlock(content, 'inventory');
    if (inventoryBlock) {
        const keyRegex = /\["([^"]+)"\]\s*=\s*\{/g;
        let match;
        while ((match = keyRegex.exec(inventoryBlock)) !== null) {
            const key = match[1];
            const block = extractLuaBlock(inventoryBlock.substring(match.index), key);
            if (block) {
                const entry: any = {};
                
                const nameM = block.match(/\["name"\]\s*=\s*"([^"]*)"/);
                const qtyM  = block.match(/\["quantity"\]\s*=\s*(\d+)/);
                const qualM = block.match(/\["quality"\]\s*=\s*(\d+)/);
                
                if (nameM) entry.name = nameM[1];
                if (qtyM)  entry.quantity = parseInt(qtyM[1], 10);
                if (qualM) {
                    const qualMap: Record<number, string> = { 0: 'Poor', 1: 'Common', 2: 'Uncommon', 3: 'Rare', 4: 'Epic', 5: 'Legendary' };
                    entry.quality = qualMap[parseInt(qualM[1], 10)] ?? 'Common';
                }

                if (entry.name) {
                    inventoryItems[key] = entry;
                }
            }
        }
    }

    // 3. Parse seen_items
    const seenBlock = extractLuaBlock(content, 'seen_items');
    if (seenBlock) {
        const idRegex = /\[(\d+)\]\s*=\s*true/g;
        let match;
        while ((match = idRegex.exec(seenBlock)) !== null) {
            seenItems.push(parseInt(match[1], 10));
        }
    }

    return { quests, inventoryItems, seenItems };
}

let autoId = 9000;

function luaEntryToSupabase(key: string, entry: any) {
    let id = entry.quest_id;
    if (!id) {
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
        reward_gold:     entry.reward_gold     || null,
        reward_items:    entry.reward_items?.length ? entry.reward_items : null,
        source:          'addon',
    };
}

export async function importQuestsFromLua(fileContent: string, onProgress: (msg: string) => void) {
    onProgress('Analizando archivo Lua...');
    const parsedData = parseLuaString(fileContent);
    const quests = parsedData.quests;
    const inventoryItems = parsedData.inventoryItems;
    const seenItems = parsedData.seenItems;
    
    const keys = Object.keys(quests);

    if (keys.length === 0 && Object.keys(inventoryItems).length === 0 && seenItems.length === 0) {
        throw new Error('No se encontraron datos. Asegurate de haber capturado algo en el juego.');
    }

    onProgress('Preparando datos...');
    const parsedRows = keys.map(key => luaEntryToSupabase(key, quests[key]));
    const importedIds = parsedRows.map(r => r.id);

    onProgress('Buscando misiones existentes en la base de datos...');
    
    // Fetch existing quests to check for conflicts
    const { data: existingData, error: fetchError } = await supabase
        .from('quests')
        .select('*')
        .in('id', importedIds);

    if (fetchError) {
        throw new Error(`Error consultando la base de datos: ${fetchError.message}`);
    }

    const existingMap = new Map((existingData || []).map(q => [q.id, q]));

    const newQuests: any[] = [];
    const conflicts: { existing: any, imported: any }[] = [];

    for (const row of parsedRows) {
        const existing = existingMap.get(row.id);
        if (existing) {
            conflicts.push({ existing, imported: row });
        } else {
            newQuests.push(row);
        }
    }

    onProgress('Extrayendo objetos y cruzando datos con Blizzard API...');
    // Primero preparamos una lista de nombres a buscar y una lista de IDs a buscar.
    const uniqueItemNames = new Set<string>();
    const uniqueItemIds = new Set<number>(seenItems);
    
    for (const row of parsedRows) {
        if (row.reward_items) {
            for (const item of row.reward_items) {
                if (item.name) uniqueItemNames.add(item.name);
            }
        }
    }
    
    for (const key in inventoryItems) {
        if (inventoryItems[key].name) {
            uniqueItemNames.add(inventoryItems[key].name);
        }
    }

    const newItems: any[] = [];
    
    // --- 1. PROCESAR OBJETOS POR ID (seen_items de Wowhead Looter) ---
    if (uniqueItemIds.size > 0) {
        onProgress(`Verificando ${uniqueItemIds.size} objetos avistados en DB...`);
        // Para evitar errores por limites del in(), particionamos si son demasiados
        const idsArray = Array.from(uniqueItemIds);
        const existingIds = new Set<number>();
        
        for (let i = 0; i < idsArray.length; i += 100) {
            const chunk = idsArray.slice(i, i + 100);
            const { data } = await supabase.from('items').select('id').in('id', chunk);
            if (data) data.forEach(d => existingIds.add(d.id));
        }
        
        const missingIds = idsArray.filter(id => !existingIds.has(id));
        let itemsProcessed = 0;
        
        for (const itemId of missingIds) {
            itemsProcessed++;
            onProgress(`Consultando Blizzard API: Objeto nuevo ${itemsProcessed} de ${missingIds.length} (ID: ${itemId})...`);
            try {
                const res = await fetch(`/api/blizzard/item?id=${itemId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.item) {
                        const blizz = data.item;
                        newItems.push({
                            id: blizz.id,
                            name: blizz.name,
                            quality: blizz.quality,
                            media: blizz.media,
                            iconUrl: blizz.iconUrl,
                            description: blizz.description,
                            itemClass: blizz.itemClass,
                            itemSubclass: blizz.itemSubclass,
                            binding: blizz.binding,
                            requiredLevel: blizz.requiredLevel
                        });
                    }
                }
            } catch (err) {
                console.error(`Error fetch Blizzard item ID ${itemId}`, err);
            }
        }
    }

    // --- 2. PROCESAR OBJETOS POR NOMBRE (Recompensas e Inventario clásico) ---
    // Primero verificamos cuáles ya existen en la DB por nombre para no desperdiciar llamadas a Blizzard
    const namesArray = Array.from(uniqueItemNames);
    const existingByName = new Map<string, number>(); // name -> id

    if (namesArray.length > 0) {
        onProgress(`Verificando ${namesArray.length} objetos por nombre en DB...`);
        for (let i = 0; i < namesArray.length; i += 100) {
            const chunk = namesArray.slice(i, i + 100);
            const { data } = await supabase.from('items').select('id, name').in('name', chunk);
            if (data) data.forEach(d => existingByName.set(d.name, d.id));
        }
    }

    const missingNames = namesArray.filter(n => !existingByName.has(n));
    let nameItemsProcessed = 0;

    for (const itemName of missingNames) {
        nameItemsProcessed++;
        onProgress(`Consultando Blizzard API: Objeto por nombre ${nameItemsProcessed} de ${missingNames.length} (${itemName})...`);
        try {
            const res = await fetch(`/api/blizzard/search-item?name=${encodeURIComponent(itemName)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.item) {
                    const blizz = data.item;
                    // Solo lo agregamos si no lo habiamos agregado ya por ID
                    if (!newItems.find(i => i.id === blizz.id)) {
                        newItems.push({
                            id: blizz.id,
                            name: blizz.name,
                            quality: blizz.quality,
                            media: blizz.media,
                            iconUrl: blizz.iconUrl,
                            description: blizz.description,
                            itemClass: blizz.itemClass,
                            itemSubclass: blizz.itemSubclass,
                            binding: blizz.binding,
                            requiredLevel: blizz.requiredLevel
                        });
                        // Registramos en el map para el linkeo de recompensas
                        existingByName.set(blizz.name, blizz.id);
                    }
                }
            }
        } catch (err) {
            console.error(`Error fetch Blizzard item ${itemName}`, err);
        }
    }

    // Mapear los IDs de Blizzard de vuelta a las recompensas de la misión
    // Incluye tanto los items nuevos como los que ya estaban en la DB
    const itemsMap = new Map<string, number>(existingByName);
    newItems.forEach(i => itemsMap.set(i.name, i.id));

    
    const updateQuestRewards = (quest: any) => {
        if (quest.reward_items) {
            quest.reward_items = quest.reward_items.map((ri: any) => {
                const blizzId = itemsMap.get(ri.name);
                if (blizzId) {
                    return { ...ri, id: blizzId };
                }
                return ri;
            });
        }
    };

    newQuests.forEach(updateQuestRewards);
    conflicts.forEach(c => updateQuestRewards(c.imported));

    return { newQuests, conflicts, newItems, total: keys.length };
}
