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
    const seenItemsTimestamps: Record<number, string> = {};

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

                const itemsBlock = extractLuaBlock(block, 'reward_items');
                if (itemsBlock) {
                    const itemEntries = [...itemsBlock.matchAll(/\{\s*([^}]+)\s*\}/g)];
                    entry.reward_items = itemEntries.map(ie => {
                        const ib = ie[1];
                        const item: any = {};
                        const nameM  = ib.match(/\["name"\]\s*=\s*"([^"]*)"/);
                        const qtyM   = ib.match(/\["quantity"\]\s*=\s*(\d+)/);
                        const qualM  = ib.match(/\["quality"\]\s*=\s*(\d+)/);
                        const idM    = ib.match(/\["item_id"\]\s*=\s*(\d+)/);
                        const choiceM = ib.match(/\["choice"\]\s*=\s*(true|false)/);
                        
                        if (nameM) item.name = nameM[1];
                        if (qtyM)  item.quantity = parseInt(qtyM[1], 10);
                        if (idM)   item.item_id = parseInt(idM[1], 10);
                        if (choiceM) item.choice = choiceM[1] === 'true';
                        if (qualM) {
                            const qualMap: Record<number, string> = { 0: 'Poor', 1: 'Common', 2: 'Uncommon', 3: 'Rare', 4: 'Epic', 5: 'Legendary' };
                            item.quality = qualMap[parseInt(qualM[1], 10)] ?? 'Common';
                        }
                        return item;
                    }).filter((i: any) => i.name);
                }

                if (entry.title) {
                    entry.title_en = entry.title;
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
                
                const nameM  = block.match(/(?:\["name"\]|name)\s*=\s*"([^"]*)"/);
                const qtyM   = block.match(/(?:\["quantity"\]|quantity)\s*=\s*(\d+)/);
                const qualM  = block.match(/(?:\["quality"\]|quality)\s*=\s*(\d+)/);
                const idM    = block.match(/(?:\["item_id"\]|item_id)\s*=\s*(\d+)/);
                const capM   = block.match(/(?:\["captured_at"\]|captured_at)\s*=\s*"([^"]*)"/);
                
                if (nameM) entry.name = nameM[1];
                if (qtyM)  entry.quantity = parseInt(qtyM[1], 10);
                if (idM)   entry.item_id = parseInt(idM[1], 10);
                if (capM)  entry.captured_at = capM[1];
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
        const idRegex = /\[(\d+)\]\s*=\s*(?:true|"([^"]*)")/g;
        let match;
        while ((match = idRegex.exec(seenBlock)) !== null) {
            const id = parseInt(match[1], 10);
            seenItems.push(id);
            if (match[2]) {
                seenItemsTimestamps[id] = match[2];
            }
        }
    }

    // 4. Parse NPCs
    const npcs: any[] = [];
    const npcBlock = extractLuaBlock(content, 'npcs');
    if (npcBlock) {
        const keyRegex = /\["([^"]+)"\]\s*=\s*\{/g;
        let match;
        while ((match = keyRegex.exec(npcBlock)) !== null) {
            const key = match[1];
            const block = extractLuaBlock(npcBlock.substring(match.index), key);
            if (block) {
                const entry: any = {};
                
                const idM     = block.match(/(?:\["npc_id"\]|npc_id)\s*=\s*(\d+)/);
                const nameM   = block.match(/(?:\["name"\]|name)\s*=\s*"([^"]*)"/);
                const titleM  = block.match(/(?:\["title"\]|title)\s*=\s*"([^"]*)"/);
                const lvlM    = block.match(/(?:\["level"\]|level)\s*=\s*(\d+)/);
                const classM  = block.match(/(?:\["classification"\]|classification)\s*=\s*"([^"]*)"/);
                const typeM   = block.match(/(?:\["creature_type"\]|creature_type)\s*=\s*"([^"]*)"/);
                const reactM  = block.match(/(?:\["reaction"\]|reaction)\s*=\s*"([^"]*)"/);
                const zoneM   = block.match(/(?:\["zone"\]|zone)\s*=\s*"([^"]*)"/);
                const areaM   = block.match(/(?:\["area"\]|area)\s*=\s*"([^"]*)"/);
                const seenM   = block.match(/(?:\["seen_at"\]|seen_at)\s*=\s*"([^"]*)"/);

                if (idM)     entry.npc_id         = parseInt(idM[1], 10);
                if (nameM)   entry.name           = nameM[1];
                if (titleM)  entry.title          = titleM[1];
                if (lvlM)    entry.level          = parseInt(lvlM[1], 10);
                if (classM)  entry.classification = classM[1];
                if (typeM)   entry.creature_type  = typeM[1];
                if (reactM)  entry.reaction       = reactM[1];
                if (zoneM)   entry.zone           = zoneM[1];
                if (areaM)   entry.area           = areaM[1];
                if (seenM)   entry.seen_at        = seenM[1];

                if (entry.name) {
                    entry.name_en = entry.name;
                    npcs.push(entry);
                }
            }
        }
    }

    // 5. Parse Vendors
    const vendors: any[] = [];
    const vendorBlock = extractLuaBlock(content, 'vendors');
    if (vendorBlock) {
        const keyRegex = /\["([^"]+)"\]\s*=\s*\{/g;
        let match;
        while ((match = keyRegex.exec(vendorBlock)) !== null) {
            const npcId = parseInt(match[1], 10);
            const block = extractLuaBlock(vendorBlock.substring(match.index), match[1]);
            if (block) {
                const itemsBlock = extractLuaBlock(block, 'items');
                if (itemsBlock) {
                    const itemKeyRegex = /\["([^"]+)"\]\s*=\s*\{/g;
                    let itemMatch;
                    while ((itemMatch = itemKeyRegex.exec(itemsBlock)) !== null) {
                        const iblock = extractLuaBlock(itemsBlock.substring(itemMatch.index), itemMatch[1]);
                        if (iblock) {
                            const entry: any = { npc_id: npcId };
                            const idM = iblock.match(/(?:\["item_id"\]|item_id)\s*=\s*(\d+)/);
                            const priceM = iblock.match(/(?:\["price"\]|price)\s*=\s*(\d+)/);
                            const qtyM = iblock.match(/(?:\["quantity_sold"\]|quantity_sold)\s*=\s*(\d+)/);
                            const stockM = iblock.match(/(?:\["stock"\]|stock)\s*=\s*(\d+)/);
                            const extCostM = iblock.match(/(?:\["extended_cost"\]|extended_cost)\s*=\s*(\d+)/);

                            if (idM) entry.item_id = parseInt(idM[1], 10);
                            if (priceM) entry.price = parseInt(priceM[1], 10);
                            if (qtyM) entry.quantity_sold = parseInt(qtyM[1], 10);
                            if (stockM) entry.stock = parseInt(stockM[1], 10);
                            if (extCostM) entry.extended_cost = parseInt(extCostM[1], 10);

                            if (entry.item_id) {
                                vendors.push(entry);
                                seenItems.push(entry.item_id);
                            }
                        }
                    }
                }
            }
        }
    }

    return { quests, inventoryItems, seenItems, seenItemsTimestamps, npcs, vendors };
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
        created_at:      entry.captured_at ? new Date(entry.captured_at).toISOString() : new Date().toISOString(),
    };
}

export async function processAddonData(
    content: string, 
    onProgress: (msg: string) => void
): Promise<{ newQuests: any[], conflicts: any[], newItems: any[], newNpcs: any[], newVendors: any[], total: number }> {
    onProgress('Parseando archivo Lua...');
    const parsedData = parseLuaString(content);
    const quests = parsedData.quests;
    const inventoryItems = parsedData.inventoryItems;
    const seenItems = parsedData.seenItems;
    const seenItemsTimestamps = parsedData.seenItemsTimestamps;
    const npcs = parsedData.npcs;
    const vendors = parsedData.vendors;
    
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
    const uniqueItemNames = new Set<string>();
    const uniqueItemIds = new Set<number>(seenItems);
    const basicItemData = new Map<number, any>();
    const basicItemDataByName = new Map<string, any>();
    
    for (const row of parsedRows) {
        if (row.reward_items) {
            for (const item of row.reward_items) {
                if (item.item_id) {
                    uniqueItemIds.add(item.item_id); // ID capturado por el addon
                    basicItemData.set(item.item_id, { name: item.name, quality: item.quality, captured_at: row.created_at });
                } else if (item.name) {
                    uniqueItemNames.add(item.name);  // Fallback por nombre
                    basicItemDataByName.set(item.name, { quality: item.quality, captured_at: row.created_at });
                }
            }
        }
    }
    
    for (const key in inventoryItems) {
        const inv = inventoryItems[key];
        if (inv.item_id) {
            uniqueItemIds.add(inv.item_id);          // ID capturado por el addon
            basicItemData.set(inv.item_id, { name: inv.name, quality: inv.quality, captured_at: inv.captured_at });
        } else if (inv.name) {
            uniqueItemNames.add(inv.name);           // Fallback por nombre
            basicItemDataByName.set(inv.name, { quality: inv.quality, captured_at: inv.captured_at });
        }
    }

    const getItemCreatedAt = (id?: number, name?: string) => {
        const raw = (id && seenItemsTimestamps[id]) || (id && basicItemData.get(id)?.captured_at) || (name && basicItemDataByName.get(name)?.captured_at);
        return raw ? new Date(raw).toISOString() : new Date().toISOString();
    };


    // 4.5. Filtrar items que ya están en la base de datos
    onProgress('Buscando objetos existentes en la base de datos...');
    
    // Validar qué IDs ya existen
    if (uniqueItemIds.size > 0) {
        const { data: existingItemsById } = await supabase
            .from('items')
            .select('id')
            .in('id', Array.from(uniqueItemIds));
            
        if (existingItemsById) {
            existingItemsById.forEach(row => {
                uniqueItemIds.delete(row.id);
                // No necesitamos buscar de nuevo este item
            });
        }
    }

    // Validar qué nombres ya existen
    const existingByName = new Map<string, number>(); // name -> id
    if (uniqueItemNames.size > 0) {
        const { data: existingItemsByName } = await supabase
            .from('items')
            .select('id, name')
            .in('name', Array.from(uniqueItemNames));
            
        if (existingItemsByName) {
            existingItemsByName.forEach(row => {
                uniqueItemNames.delete(row.name);
                existingByName.set(row.name, row.id);
            });
        }
    }

    const newItems: any[] = [];
    
    // --- 1. PROCESAR OBJETOS POR ID (seen_items de Wowhead Looter) ---
    if (uniqueItemIds.size > 0) {
        const idsArray = Array.from(uniqueItemIds);
        let itemsProcessed = 0;
        
        for (const itemId of idsArray) {
            itemsProcessed++;
            onProgress(`Consultando Blizzard API: Objeto ${itemsProcessed} de ${idsArray.length} (ID: ${itemId})...`);
            try {
                const res = await fetch(`/api/blizzard/item?id=${itemId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.item) {
                        const blizz = data.item;
                        const basic = basicItemData.get(itemId);
                        if (!newItems.find(i => i.id === blizz.id)) {
                            newItems.push({
                                id: blizz.id,
                                name: blizz.name,
                                name_en: basic?.name || blizz.name,
                                quality: blizz.quality,
                                media: blizz.media,
                                iconUrl: blizz.iconUrl,
                                description: blizz.description,
                                itemClass: blizz.itemClass,
                                itemSubclass: blizz.itemSubclass,
                                binding: blizz.binding,
                                requiredLevel: blizz.requiredLevel,
                                buy_price: blizz.purchasePrice,
                                sell_price: blizz.sellPrice,
                                created_at: getItemCreatedAt(blizz.id, basic?.name)
                            });
                        }
                    } else {
                        // Fallback si la API devuelve success: false
                        const basic = basicItemData.get(itemId);
                        if (!newItems.find(i => i.id === itemId)) {
                            newItems.push({
                                id: itemId,
                                name: basic?.name || `Objeto Desconocido ${itemId}`,
                                name_en: basic?.name || `Objeto Desconocido ${itemId}`,
                                quality: { name: basic?.quality || 'Común' },
                                iconUrl: null,
                                created_at: getItemCreatedAt(itemId, basic?.name)
                            });
                        }
                    }
                } else {
                    // Fallback si la API de Blizzard falla HTTP
                    const basic = basicItemData.get(itemId);
                    if (!newItems.find(i => i.id === itemId)) {
                        newItems.push({
                            id: itemId,
                            name: basic?.name || `Objeto Desconocido ${itemId}`,
                            name_en: basic?.name || `Objeto Desconocido ${itemId}`,
                            quality: { name: basic?.quality || 'Común' },
                            iconUrl: null,
                            created_at: getItemCreatedAt(itemId, basic?.name)
                        });
                    }
                }
            } catch (err) {
                console.error(`Error fetch Blizzard item ID ${itemId}`, err);
                const basic = basicItemData.get(itemId);
                if (!newItems.find(i => i.id === itemId)) {
                    newItems.push({
                        id: itemId,
                        name: basic?.name || `Objeto Desconocido ${itemId}`,
                        name_en: basic?.name || `Objeto Desconocido ${itemId}`,
                        quality: { name: basic?.quality || 'Común' },
                        iconUrl: null,
                        created_at: getItemCreatedAt(itemId, basic?.name)
                    });
                }
            }
        }
    }

    // --- 2. PROCESAR OBJETOS POR NOMBRE (Recompensas e Inventario clásico) ---
    const namesArray = Array.from(uniqueItemNames);
    let nameItemsProcessed = 0;

    for (const itemName of namesArray) {
        nameItemsProcessed++;
        onProgress(`Consultando Blizzard API: Objeto por nombre ${nameItemsProcessed} de ${namesArray.length} (${itemName})...`);
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
                            name_en: itemName,
                            quality: blizz.quality,
                            media: blizz.media,
                            iconUrl: blizz.iconUrl,
                            description: blizz.description,
                            itemClass: blizz.itemClass,
                            itemSubclass: blizz.itemSubclass,
                            binding: blizz.binding,
                            requiredLevel: blizz.requiredLevel,
                            buy_price: blizz.purchasePrice,
                            sell_price: blizz.sellPrice,
                            created_at: getItemCreatedAt(blizz.id, itemName)
                        });
                    }
                } else {
                    const basic = basicItemDataByName.get(itemName);
                    if (basic && !newItems.find(i => i.name === itemName)) {
                        newItems.push({
                            id: Math.floor(Math.random() * 1000000) + 9000000,
                            name: itemName,
                            quality: { name: basic.quality || 'Común' },
                            iconUrl: null,
                            created_at: getItemCreatedAt(undefined, itemName)
                        });
                    }
                }
            }
        } catch (err) {
            console.error(`Error fetch Blizzard item ${itemName}`, err);
            const basic = basicItemDataByName.get(itemName);
            if (basic && !newItems.find(i => i.name === itemName)) {
                newItems.push({
                    id: Math.floor(Math.random() * 1000000) + 9000000,
                    name: itemName,
                    quality: { name: basic.quality || 'Común' },
                    iconUrl: null,
                    created_at: getItemCreatedAt(undefined, itemName)
                });
            }
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

    // 5. Devolver NPCs parseados
    onProgress('Preparando NPCs para insertar...');
    let newNpcs = npcs.map(n => ({
        ...n,
        created_at: n.seen_at ? new Date(n.seen_at).toISOString() : new Date().toISOString()
    }));
    
    if (newNpcs.length > 0) {
        const npcIds = newNpcs.map(n => n.npc_id);
        const { data: existingNpcs } = await supabase
            .from('npcs')
            .select('npc_id')
            .in('npc_id', npcIds);
            
        if (existingNpcs && existingNpcs.length > 0) {
            const existingSet = new Set(existingNpcs.map(n => n.npc_id));
            newNpcs = newNpcs.filter(n => !existingSet.has(n.npc_id));
        }
    }

    // 6. Devolver Vendedores
    const newVendors = vendors;

    return { newQuests, conflicts, newItems, newNpcs, newVendors, total: keys.length };
}
