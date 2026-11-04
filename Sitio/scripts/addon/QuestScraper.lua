-- QuestScraper.lua
-- Captura automaticamente datos de misiones al abrirlas en WoW Forever.
-- Los datos se guardan en QuestScraperDB (SavedVariables) y persisten entre sesiones.

-- -----------------------------------------------------------------------
-- Inicializar DB
-- -----------------------------------------------------------------------
local ADDON_NAME = "QuestScraper"

local function InitDB()
    local clientLocale = (GetLocale and GetLocale()) or "enUS"
    if not QuestScraperDB then
        QuestScraperDB = {
            version = 1,
            locale = clientLocale,
            quests = {},
            inventory = {},
            seen_items = {},
            npcs = {},
            exportedAt = nil,
        }
    end
    if not QuestScraperDB.locale then
        QuestScraperDB.locale = clientLocale
    end
    if not QuestScraperDB.inventory then QuestScraperDB.inventory = {} end
    if not QuestScraperDB.seen_items then QuestScraperDB.seen_items = {} end
    if not QuestScraperDB.npcs then QuestScraperDB.npcs = {} end
    if not QuestScraperDB.gameobjects then QuestScraperDB.gameobjects = {} end
    if not QuestScraperDB.loot then QuestScraperDB.loot = {} end
    if not QuestScraperDB.vendors then QuestScraperDB.vendors = {} end
    if not QuestScraperDB.trainers then QuestScraperDB.trainers = {} end
    if not QuestScraperDB.recipes then QuestScraperDB.recipes = {} end
    if not QuestScraperDB.item_tooltips then QuestScraperDB.item_tooltips = {} end
    if not QuestScraperDB.spells then QuestScraperDB.spells = {} end
    if not QuestScraperDB.auras then QuestScraperDB.auras = {} end
    if not QuestScraperDB.achievements then QuestScraperDB.achievements = {} end
    if not QuestScraperDB.taxis then QuestScraperDB.taxis = {} end
    if not QuestScraperDB.factions then QuestScraperDB.factions = {} end
end

-- -----------------------------------------------------------------------
-- Utiles
-- -----------------------------------------------------------------------
local function trim(s)
    if not s then return nil end
    return s:match("^%s*(.-)%s*$")
end

local function splitLines(text)
    if not text then return {} end
    local lines = {}
    for line in text:gmatch("[^\r\n]+") do
        local t = trim(line)
        if t and t ~= "" then
            table.insert(lines, t)
        end
    end
    return lines
end

-- Convierte el nombre de la zona actual
local function getCurrentZone()
    local zone = GetZoneText()
    local subzone = GetSubZoneText()
    return trim(zone), trim(subzone)
end

-- Obtiene las coordenadas exactas y el ID del mapa
local function GetPlayerCoordinates()
    if C_Map and C_Map.GetBestMapForUnit then
        local mapID = C_Map.GetBestMapForUnit("player")
        if mapID then
            local position = C_Map.GetPlayerMapPosition(mapID, "player")
            if position then
                -- position.x y position.y suelen ir de 0 a 1
                return mapID, string.format("%.4f", position.x * 100), string.format("%.4f", position.y * 100)
            end
        end
    end
    return nil, nil, nil
end

-- -----------------------------------------------------------------------
-- Captura Pasiva de IDs (Data Mining)
-- -----------------------------------------------------------------------
local function RecordItemID(id)
    if not id then return false end
    local numId = tonumber(id)
    if numId and numId > 0 and not QuestScraperDB.seen_items[numId] then
        QuestScraperDB.seen_items[numId] = date("!%Y-%m-%dT%H:%M:%SZ")
        return true
    end
    return false
end

-- Obtener ID interno del NPC
local function GetNPCID(unit)
    local guid = UnitGUID(unit)
    if not guid or not canaccessvalue(guid) then return nil end
    -- GUID de criatura: "Creature-realmID-serverID-instanceID-zoneID-npcID-spawnUID"
    return tonumber(guid:match("Creature%-%d+%-%d+%-%d+%-%d+%-(%d+)")) or tonumber(guid:match("Vehicle%-%d+%-%d+%-%d+%-%d+%-(%d+)"))
end

-- -----------------------------------------------------------------------
-- Captura de datos de mision
-- -----------------------------------------------------------------------
local function CaptureCurrentQuest()
    -- Titulo y textos principales
    local title       = trim(GetTitleText())
    local description = trim(GetQuestText())
    local completion  = trim(GetRewardText())      -- texto al completar

    if not title or title == "" then return end

    -- Intentar obtener el ID interno de la mision
    local questID = GetQuestID and GetQuestID() or nil

    -- Objetivos
    local objectives = {}
    local numObj = GetNumQuestLeaderBoards and GetNumQuestLeaderBoards() or 0
    for i = 1, numObj do
        local text = GetQuestObjectiveInfo and select(1, GetQuestObjectiveInfo(questID, i, false)) or nil
        if not text then
            -- fallback para versiones antiguas de la API
            ---@diagnostic disable-next-line: redundant-parameter
            text = GetObjectiveText and GetObjectiveText(i) or nil
        end
        if text then table.insert(objectives, trim(text)) end
    end
    -- Si no hay objetivos via API, usar el texto del dialogo
    if #objectives == 0 then
        local objText = trim(GetObjectiveText and GetObjectiveText() or nil)
        if objText then objectives = splitLines(objText) end
    end

    -- Recompensas: XP y oro
    local rewardXP    = GetRewardXP and GetRewardXP() or 0
    local rewardMoney = GetRewardMoney and GetRewardMoney() or 0

    -- Recompensas: objetos (tipo "elegir")
    local rewardItems = {}
    local addedItems = 0
    local numChoices = GetNumQuestChoices and GetNumQuestChoices() or 0
    for i = 1, numChoices do
        local name, _, count, quality = GetQuestItemInfo("choice", i)
        if name then
            local itemID = nil
            local link = GetQuestItemLink and GetQuestItemLink("choice", i)
            if link then
                itemID = tonumber(string.match(link, "item:(%d+)"))
                if itemID then
                    if RecordItemID(itemID) then addedItems = addedItems + 1 end
                end
            end
            table.insert(rewardItems, {
                name     = trim(name),
                quantity = count or 1,
                quality  = quality,
                choice   = true,
                item_id  = itemID,
            })
        end
    end
    -- Recompensas: objetos fijos
    local numRewards = GetNumQuestRewards and GetNumQuestRewards() or 0
    for i = 1, numRewards do
        local name, _, count, quality = GetQuestItemInfo("reward", i)
        if name then
            local itemID = nil
            local link = GetQuestItemLink and GetQuestItemLink("reward", i)
            if link then
                itemID = tonumber(string.match(link, "item:(%d+)"))
                if itemID then
                    if RecordItemID(itemID) then addedItems = addedItems + 1 end
                end
            end
            table.insert(rewardItems, {
                name     = trim(name),
                quantity = count or 1,
                quality  = quality,
                choice   = false,
                item_id  = itemID,
            })
        end
    end

    -- Zona actual y coordenadas
    local zone, area = getCurrentZone()
    local mapID, posX, posY = GetPlayerCoordinates()

    -- NPC con quien se habla actualmente
    local rawNpcName = UnitName("npc") or UnitName("target")
    local npcName = (rawNpcName and canaccessvalue(rawNpcName)) and trim(rawNpcName) or ""

    -- Usar questID como clave si existe, sino el titulo
    local key = (questID and questID ~= 0) and tostring(questID) or title
    local existingEntry = QuestScraperDB.quests and QuestScraperDB.quests[key]
    local capturedAt = (existingEntry and existingEntry.captured_at) or date("!%Y-%m-%dT%H:%M:%SZ")

    -- Construir entrada
    local entry = {
        title          = title,
        description    = description,
        completion_text = completion,
        objectives     = objectives,
        giver_npc      = npcName ~= "" and npcName or nil,
        zone           = zone,
        area           = area,
        map_id         = mapID,
        pos_x          = posX,
        pos_y          = posY,
        reward_xp      = rewardXP > 0 and rewardXP or nil,
        reward_gold    = rewardMoney > 0 and rewardMoney or nil,
        reward_items   = #rewardItems > 0 and rewardItems or nil,
        captured_at    = capturedAt,
    }
    entry.quest_id = (questID and questID ~= 0) and questID or nil

    -- Guardar (upsert por clave)
    QuestScraperDB.quests[key] = entry

    -- Notificacion en pantalla
    local count = 0
    for _ in pairs(QuestScraperDB.quests) do count = count + 1 end
    print(string.format("|cFF00FF00[QuestScraper]|r Mision guardada: |cFFFFD700%s|r (total: %d)", title, count))

    if addedItems > 0 then
        print(string.format("|cFF00FF00[QuestScraper]|r Se registraron |cFFFFD700%d|r objetos nuevos de las recompensas.", addedItems))
    end
end



-- -----------------------------------------------------------------------
-- Escaneo del inventario
-- -----------------------------------------------------------------------
local function ScanInventory(isManual)
    if not QuestScraperDB.inventory then
        QuestScraperDB.inventory = {}
    end
    
    -- Borramos el registro actual para no acumular cantidades infinitamente en cada escaneo
    QuestScraperDB.inventory = {}
    local uniqueCount = 0

    local function GetNumSlots(bag)
        if C_Container and C_Container.GetContainerNumSlots then
            return C_Container.GetContainerNumSlots(bag)
        else
            return GetContainerNumSlots(bag)
        end
    end

    local function GetItemInfo(bag, slot)
        if C_Container and C_Container.GetContainerItemInfo then
            local info = C_Container.GetContainerItemInfo(bag, slot)
            if info then
                return info.itemName, info.quality, info.stackCount
            end
        else
            local _, itemCount, _, quality, _, _, _, _, _, itemID = GetContainerItemInfo(bag, slot)
            if itemID then
                local itemName = GetItemInfo(itemID)
                return itemName, quality, itemCount
            end
        end
        return nil
    end

    for bag = 0, 4 do
        local numSlots = GetNumSlots(bag)
        for slot = 1, numSlots do
            local itemName, quality, stackCount = GetItemInfo(bag, slot)
            if itemName then
                -- Intentar capturar el ID via link del contenedor
                local link
                if C_Container and C_Container.GetContainerItemLink then
                    link = C_Container.GetContainerItemLink(bag, slot)
                else
                    link = GetContainerItemLink(bag, slot)
                end
                local itemID = link and tonumber(string.match(link, "item:(%d+)"))
                if itemID then RecordItemID(itemID) end

                if not QuestScraperDB.inventory[itemName] then
                    uniqueCount = uniqueCount + 1
                    QuestScraperDB.inventory[itemName] = {
                        name        = itemName,
                        quality     = quality,
                        quantity    = stackCount,
                        item_id     = itemID,
                        captured_at = date("!%Y-%m-%dT%H:%M:%SZ"),
                    }
                else
                    QuestScraperDB.inventory[itemName].quantity = QuestScraperDB.inventory[itemName].quantity + stackCount
                end
            end
        end
    end
    
    if isManual then
        print("|cFF00FF00[QuestScraper]|r Inventario guardado con éxito. Tienes " .. uniqueCount .. " objetos distintos.")
    end
end


local function ScanMerchant()
    local numItems = GetMerchantNumItems()
    local npcId = GetNPCID("target")
    if not npcId then return end
    
    local key = tostring(npcId)
    if not QuestScraperDB.vendors[key] then
        QuestScraperDB.vendors[key] = {
            items = {},
            scanned_at = date("%Y-%m-%dT%H:%M:%S")
        }
    end

    local vendorData = QuestScraperDB.vendors[key]
    vendorData.scanned_at = date("%Y-%m-%dT%H:%M:%S")

    local added = 0
    for i = 1, numItems do
        local link = GetMerchantItemLink and GetMerchantItemLink(i)
        local price, quantity, numAvailable, extendedCost
        ---@diagnostic disable-next-line: deprecated
        if GetMerchantItemInfo then
            ---@diagnostic disable-next-line: deprecated
            _, _, price, quantity, numAvailable, _, _, extendedCost = GetMerchantItemInfo(i)
        end
        
        local itemID = GetMerchantItemID and GetMerchantItemID(i)
        if not itemID and link then
            itemID = tonumber(string.match(link, "item:(%d+)"))
        end
        
        if itemID then
            local idStr = tostring(itemID)
            if RecordItemID(idStr) then added = added + 1 end
            
            vendorData.items[idStr] = {
                item_id = itemID,
                price = price,
                quantity_sold = quantity,
                stock = (numAvailable and numAvailable > 0) and numAvailable or nil,
                extended_cost = extendedCost
            }
        end
    end
    if added > 0 then
        print(string.format("|cFF00FF00[QuestScraper]|r Se registraron |cFFFFD700%d|r objetos nuevos del vendedor.", added))
    end
end

local function GetLootSourceID()
    if GetNumLootItems() > 0 and GetLootSourceInfo then
        local guid = GetLootSourceInfo(1)
        if guid then
            if guid:find("^Creature") or guid:find("^Vehicle") then
                local npcId = tonumber(guid:match(".-%-%d+%-%d+%-%d+%-%d+%-(%d+)"))
                if npcId then return "npc", npcId end
            elseif guid:find("^GameObject") then
                local goId = tonumber(guid:match("GameObject%-%d+%-%d+%-%d+%-%d+%-(%d+)"))
                if goId then return "gameobject", goId end
            elseif guid:find("^Item") then
                -- Contenedores, almejas, lockboxes
                local itemId = tonumber(guid:match("Item%-%d+%-%d+%-%d+%-%d+%-(%d+)"))
                if itemId then return "item", itemId end
            end
        end
    end
    
    if UnitExists("target") and UnitIsDead("target") then
        local guid = UnitGUID("target")
        if guid and canaccessvalue(guid) then
            if guid:find("^Creature") or guid:find("^Vehicle") then
                local npcId = tonumber(guid:match(".-%-%d+%-%d+%-%d+%-%d+%-(%d+)"))
                if npcId then return "npc", npcId end
            end
        end
    end
    return nil, nil
end

local function ScanLoot()
    local numItems = GetNumLootItems()
    if numItems == 0 then return end

    local sourceType, sourceId = GetLootSourceID()
    local added = 0
    
    if sourceType and sourceId then
        local key = sourceType .. "_" .. sourceId
        if not QuestScraperDB.loot[key] then
            QuestScraperDB.loot[key] = {
                source_type = sourceType,
                source_id = sourceId,
                drops = {},
                looted_times = 0
            }
        end
        
        QuestScraperDB.loot[key].looted_times = QuestScraperDB.loot[key].looted_times + 1
        
        for i = 1, numItems do
            local link = GetLootSlotLink(i)
            local slotInfo = {GetLootSlotInfo(i)}
            local quantity = slotInfo[3] or 1
            
            if link then
                local id = string.match(link, "item:(%d+)")
                local itemIdNum = tonumber(id)
                if RecordItemID(id) then added = added + 1 end
                
                if itemIdNum then
                    if not QuestScraperDB.loot[key].drops[id] then
                        QuestScraperDB.loot[key].drops[id] = { item_id = itemIdNum, total_dropped = 0 }
                    end
                    QuestScraperDB.loot[key].drops[id].total_dropped = QuestScraperDB.loot[key].drops[id].total_dropped + quantity
                end
            end
        end
    else
        for i = 1, numItems do
            local link = GetLootSlotLink(i)
            if link then
                local id = string.match(link, "item:(%d+)")
                if RecordItemID(id) then added = added + 1 end
            end
        end
    end
    if added > 0 then
        print(string.format("|cFF00FF00[QuestScraper]|r Se registraron |cFFFFD700%d|r objetos nuevos del botin.", added))
    end
end

-- -----------------------------------------------------------------------
-- Captura de Entrenadores (Trainers)
-- -----------------------------------------------------------------------
local function ScanTrainer()
    local npcId = GetNPCID("target")
    if not npcId then return end
    
    local key = tostring(npcId)
    if not QuestScraperDB.trainers[key] then
        QuestScraperDB.trainers[key] = {
            services = {},
            scanned_at = date("%Y-%m-%dT%H:%M:%S")
        }
    end

    local added = 0
    local numServices = GetNumTrainerServices()
    for i = 1, numServices do
        local name, rank, category = GetTrainerServiceInfo(i)
        if category == "available" or category == "used" then
            local cost = GetTrainerServiceCost(i)
            local reqLevel = GetTrainerServiceLevelReq(i)
            local link = GetTrainerServiceItemLink(i)
            local id = link and (string.match(link, "spell:(%d+)") or string.match(link, "item:(%d+)"))
            
            if name then
                QuestScraperDB.trainers[key].services[name] = {
                    rank = rank,
                    cost = cost,
                    req_level = reqLevel,
                    id = tonumber(id),
                }
                added = added + 1
            end
        end
    end
    if added > 0 then
        print(string.format("|cFF00FF00[QuestScraper]|r Se registraron |cFFFFD700%d|r servicios de entrenador.", added))
    end
end

-- -----------------------------------------------------------------------
-- Captura de Profesiones (Trade Skills)
-- -----------------------------------------------------------------------
local function ScanTradeSkills()
    local added = 0
    -- Soporte para API Moderna
    if C_TradeSkillUI and C_TradeSkillUI.GetAllRecipeIDs then
        local recipes = C_TradeSkillUI.GetAllRecipeIDs()
        if not recipes then return end
        for _, recipeID in pairs(recipes) do
            local key = tostring(recipeID)
            if not QuestScraperDB.recipes[key] then
                local info = C_TradeSkillUI.GetRecipeInfo(recipeID)
                if info then
                    local itemLink = C_TradeSkillUI.GetRecipeItemLink(recipeID)
                    local itemID = itemLink and tonumber(string.match(itemLink, "item:(%d+)"))
                    
                    local reagents = {}
                    local numReagents = C_TradeSkillUI.GetRecipeNumReagents(recipeID)
                    for r = 1, numReagents do
                        local rLink = C_TradeSkillUI.GetRecipeReagentItemLink(recipeID, r)
                        local rID = rLink and tonumber(string.match(rLink, "item:(%d+)"))
                        if rID then
                            local _, _, rCount = C_TradeSkillUI.GetRecipeReagentInfo(recipeID, r)
                            table.insert(reagents, { item_id = rID, count = rCount })
                        end
                    end
                    
                    QuestScraperDB.recipes[key] = {
                        name = info.name,
                        creates_item_id = itemID,
                        spell_id = recipeID,
                        reagents = reagents,
                        scanned_at = date("%Y-%m-%dT%H:%M:%S")
                    }
                    added = added + 1
                end
            end
        end
    -- Soporte para API Clasica
    elseif _G.GetNumTradeSkills then
        local numSkills = _G.GetNumTradeSkills()
        for i = 1, numSkills do
            local name, tradeType = _G.GetTradeSkillInfo(i)
            if tradeType ~= "header" and name then
                local spellLink = _G.GetTradeSkillRecipeLink(i)
                local spellID = spellLink and tonumber(string.match(spellLink, "enchant:(%d+)"))
                
                if spellID then
                    local key = tostring(spellID)
                    if not QuestScraperDB.recipes[key] then
                        local link = _G.GetTradeSkillItemLink(i)
                        local itemID = link and tonumber(string.match(link, "item:(%d+)"))
                        
                        local reagents = {}
                        local numReagents = _G.GetTradeSkillNumReagents(i)
                        for r = 1, numReagents do
                            local rLink = _G.GetTradeSkillReagentItemLink(i, r)
                            local rID = rLink and tonumber(string.match(rLink, "item:(%d+)"))
                            if rID then
                                local _, _, rCount = _G.GetTradeSkillReagentInfo(i, r)
                                table.insert(reagents, { item_id = rID, count = rCount })
                            end
                        end
                        
                        QuestScraperDB.recipes[key] = {
                            name = name,
                            creates_item_id = itemID,
                            spell_id = spellID,
                            reagents = reagents,
                            scanned_at = date("%Y-%m-%dT%H:%M:%S")
                        }
                        added = added + 1
                    end
                end
            end
        end
    end
    
    if added > 0 then
        print(string.format("|cFF00FF00[QuestScraper]|r Se registraron |cFFFFD700%d|r recetas nuevas.", added))
    end
end

-- -----------------------------------------------------------------------
-- Captura de Auras (Buffs / Debuffs)
-- -----------------------------------------------------------------------
local function ScanAuras(unit)
    if not unit or not UnitExists(unit) then return end
    
    local function processAura(name, icon, count, debuffType, duration, expirationTime, source, isStealable, nameplateShowPersonal, spellId)
        if not spellId then return end
        local key = tostring(spellId)
        if not QuestScraperDB.auras[key] then
            QuestScraperDB.auras[key] = {
                spell_id = spellId,
                name = name,
                debuff_type = debuffType,
                duration = duration,
                is_stealable = isStealable,
                seen_at = date("%Y-%m-%dT%H:%M:%S")
            }
        end
    end

    if C_UnitAuras and C_UnitAuras.GetAuraDataByIndex then
        for _, filter in ipairs({"HELPFUL", "HARMFUL"}) do
            for i = 1, 40 do
                local success, auraData = pcall(C_UnitAuras.GetAuraDataByIndex, unit, i, filter)
                if not success or not auraData then break end
                processAura(auraData.name, auraData.icon, auraData.applications, auraData.dispelName, auraData.duration, auraData.expirationTime, auraData.sourceUnit, auraData.isStealable, auraData.nameplateShowPersonal, auraData.spellId)
            end
        end
    elseif _G.UnitAura then
        for _, filter in ipairs({"HELPFUL", "HARMFUL"}) do
            for i = 1, 40 do
                local success, name, icon, count, debuffType, duration, expirationTime, source, isStealable, nameplateShowPersonal, spellId = pcall(_G.UnitAura, unit, i, filter)
                if not success or not name then break end
                processAura(name, icon, count, debuffType, duration, expirationTime, source, isStealable, nameplateShowPersonal, spellId)
            end
        end
    end
end

-- -----------------------------------------------------------------------
-- Captura de NPCs
-- -----------------------------------------------------------------------
local hiddenModel = CreateFrame("DressUpModel", "QuestScraperHiddenModel")
hiddenModel:Hide()

local function GetUnitDisplayID(unit)
    if InCombatLockdown() then return nil end
    if not unit or not hiddenModel.GetDisplayInfo then return nil end
    hiddenModel:SetUnit(unit)
    return hiddenModel:GetDisplayInfo()
end

local function ReactionToString(r)
    if not r then return nil end
    if r <= 4 then return "hostile"
    elseif r == 5 then return "neutral"
    else return "friendly" end
end

local npcTitles = {} -- guid -> title, rellenado por el hook del tooltip

local function CaptureNPC(unit)
    unit = unit or "target"
    local guid = UnitGUID(unit)
    if not guid or not canaccessvalue(guid) then return end
    -- Solo criaturas (no jugadores, mascotas, etc.)
    if not guid:find("^Creature") then return end

    local npcId  = GetNPCID(unit)
    local name   = UnitName(unit)
    if not name or not canaccessvalue(name) then return end

    local level          = UnitLevel(unit)
    local classification = UnitClassification(unit)  -- "normal", "elite", "rare", "rareelite", "worldboss"
    local creatureType   = UnitCreatureType(unit)    -- "Humanoid", "Beast", "Undead", etc.
    local creatureFamily = UnitCreatureFamily(unit)  -- Familia de mascota (ej. "Lobo", "Gato")
    local reaction       = ReactionToString(UnitReaction("player", unit))
    local zone, area     = getCurrentZone()
    local mapID, x, y    = GetPlayerCoordinates()
    local displayId      = GetUnitDisplayID(unit)
    local title          = npcTitles[guid]           -- capturado por el hook de tooltip

    local key = npcId and tostring(npcId) or name

    -- Upsert: actualizar si ya existe (podemos mejorar datos con cada visita)
    local existing = QuestScraperDB.npcs[key]
    if not existing then
        QuestScraperDB.npcs[key] = {
            npc_id         = npcId,
            name           = trim(name),
            title          = title and trim(title) or nil,
            level          = level,
            classification = classification,
            creature_type  = creatureType,
            creature_family= creatureFamily,
            display_id     = displayId,
            reaction       = reaction,
            zone           = zone,
            area           = area,
            map_id         = mapID,
            pos_x          = x,
            pos_y          = y,
            seen_at        = date("%Y-%m-%dT%H:%M:%S"),
        }
        print(string.format("|cFF00FF00[QuestScraper]|r NPC registrado: |cFFFFD700%s|r (ID: %s)", name, tostring(npcId or "?")))
    else
        if title and not existing.title then
            existing.title = trim(title)
        end
        if mapID and not existing.map_id then
            existing.map_id = mapID
            existing.pos_x = x
            existing.pos_y = y
        end
        if displayId and not existing.display_id then
            existing.display_id = displayId
        end
        if creatureFamily and not existing.creature_family then
            existing.creature_family = creatureFamily
        end
    end
end

-- -----------------------------------------------------------------------
-- Captura de GameObjects y Gossip
-- -----------------------------------------------------------------------
local function RecordGameObject(id, name)
    if not id or not name then return end
    local numId = tonumber(id)
    if not numId then return end
    
    local zone, area = getCurrentZone()
    local mapID, x, y = GetPlayerCoordinates()

    if not QuestScraperDB.gameobjects[numId] then
        QuestScraperDB.gameobjects[numId] = {
            id = numId,
            name = trim(name),
            zone = zone,
            area = area,
            map_id = mapID,
            pos_x = x,
            pos_y = y,
            seen_at = date("%Y-%m-%dT%H:%M:%S")
        }
        print(string.format("|cFF00FF00[QuestScraper]|r Objeto registrado: |cFFFFD700%s|r (ID: %d)", name, numId))
    end
end

local function CaptureGossip()
    local rawName = UnitName("npc") or UnitName("target")
    local npcName = (rawName and canaccessvalue(rawName)) and trim(rawName) or ""
    local npcGuid = UnitGUID("npc") or UnitGUID("target")
    if not npcGuid or not canaccessvalue(npcGuid) or npcName == "" then return end
    
    local npcId = GetNPCID("npc") or GetNPCID("target")
    if not npcId then return end
    
    local gossipText = ""
    if C_GossipInfo and C_GossipInfo.GetText then
        gossipText = C_GossipInfo.GetText()
    elseif _G.GetGossipText then
        gossipText = _G.GetGossipText()
    end
    
    gossipText = trim(gossipText)
    if gossipText and gossipText ~= "" then
        local key = tostring(npcId)
        if not QuestScraperDB.npcs[key] then
            -- Forzar captura del NPC si no existía aún
            CaptureNPC("npc")
        end
        
        if QuestScraperDB.npcs[key] then
            QuestScraperDB.npcs[key].gossip_text = gossipText
        end
    end
end

-- -----------------------------------------------------------------------
-- Captura de Sistemas Avanzados (Fase 5)
-- -----------------------------------------------------------------------
local function ScanTaxis()
    local numNodes = NumTaxiNodes()
    if numNodes == 0 then return end
    
    local mapID, posX, posY = GetPlayerCoordinates()
    local zone = getCurrentZone()
    local added = 0
    
    for i = 1, numNodes do
        if TaxiNodeGetType(i) == "REACHABLE" or TaxiNodeGetType(i) == "CURRENT" then
            local name = TaxiNodeName(i)
            local cost = TaxiNodeCost(i)
            
            if name then
                local key = name
                if not QuestScraperDB.taxis[key] then
                    QuestScraperDB.taxis[key] = {
                        name = name,
                        cost = cost,
                        zone = zone,
                        map_id = mapID,
                        pos_x = posX,
                        pos_y = posY,
                        discovered_at = date("%Y-%m-%dT%H:%M:%S")
                    }
                    added = added + 1
                end
            end
        end
    end
    if added > 0 then
        print(string.format("|cFF00FF00[QuestScraper]|r Se registraron |cFFFFD700%d|r nodos de vuelo.", added))
    end
end

local function ScanAchievements()
    local categoryList = GetCategoryList()
    if not categoryList then return end
    local added = 0
    for _, categoryID in ipairs(categoryList) do
        local numAchievements = GetCategoryNumAchievements(categoryID)
        for i = 1, numAchievements do
            local id, name, points, _, _, _, _, description, _, icon, rewardText, isGuild = GetAchievementInfo(categoryID, i)
            if id then
                local key = tostring(id)
                if not QuestScraperDB.achievements[key] then
                    QuestScraperDB.achievements[key] = {
                        id = id,
                        name = name,
                        description = description,
                        points = points,
                        reward_text = rewardText,
                        icon = icon,
                        is_guild = isGuild,
                        category_id = categoryID
                    }
                    added = added + 1
                end
            end
        end
    end
    print(string.format("|cFF00FF00[QuestScraper]|r %d logros escaneados.", added))
end

-- -----------------------------------------------------------------------
-- Eventos
-- -----------------------------------------------------------------------
local frame = CreateFrame("Frame", "QuestScraperFrame")
frame:RegisterEvent("ADDON_LOADED")
frame:RegisterEvent("PLAYER_ENTERING_WORLD")
frame:RegisterEvent("BAG_UPDATE_DELAYED")
frame:RegisterEvent("QUEST_DETAIL")
frame:RegisterEvent("QUEST_PROGRESS")
frame:RegisterEvent("QUEST_COMPLETE")
frame:RegisterEvent("MERCHANT_SHOW")
frame:RegisterEvent("MERCHANT_UPDATE")
frame:RegisterEvent("LOOT_OPENED")
frame:RegisterEvent("GOSSIP_SHOW")
frame:RegisterEvent("PLAYER_TARGET_CHANGED")
frame:RegisterEvent("UPDATE_MOUSEOVER_UNIT")
frame:RegisterEvent("TRAINER_SHOW")
frame:RegisterEvent("TRADE_SKILL_LIST_UPDATE")
frame:RegisterEvent("TRADE_SKILL_SHOW")
frame:RegisterEvent("UNIT_AURA")
frame:RegisterEvent("TAXIMAP_OPENED")
    -- Eventos de combate y reputacion removidos por restricciones de API
frame:RegisterEvent("QUEST_TURNED_IN")

frame:SetScript("OnEvent", function(self, event, arg1, arg2, arg3)
    if event == "ADDON_LOADED" and arg1 == ADDON_NAME then
        InitDB()
        local qCount = 0; for _ in pairs(QuestScraperDB.quests) do qCount = qCount + 1 end
        local seenCount = 0; for _ in pairs(QuestScraperDB.seen_items) do seenCount = seenCount + 1 end
        local npcCount = 0; for _ in pairs(QuestScraperDB.npcs) do npcCount = npcCount + 1 end
        print(string.format("|cFF00FF00[QuestScraper]|r Cargado. Misiones: |cFFFFD700%d|r, Objetos: |cFFFFD700%d|r, NPCs: |cFFFFD700%d|r", qCount, seenCount, npcCount))

    elseif event == "PLAYER_ENTERING_WORLD" then
        ScanInventory(false)
        
    elseif event == "BAG_UPDATE_DELAYED" then
        ScanInventory(false)

    elseif event == "QUEST_DETAIL" then
        -- Pequeno delay para que la API tenga los datos cargados
        C_Timer.After(0.2, CaptureCurrentQuest)

    elseif event == "QUEST_COMPLETE" then
        -- Capturar el texto de completado y fusionar con la entrada existente
        C_Timer.After(0.2, function()
            local title = trim(GetTitleText())
            if not title or title == "" then return end
            -- Buscar la entrada existente y agregar completion_text
            for key, entry in pairs(QuestScraperDB.quests) do
                if entry.title == title then
                    entry.completion_text = trim(GetRewardText())
                    break
                end
            end
        end)
        
    elseif event == "MERCHANT_SHOW" or event == "MERCHANT_UPDATE" then
        CaptureNPC("target")
        ScanMerchant()
        
    elseif event == "TRAINER_SHOW" then
        CaptureNPC("target")
        ScanTrainer()
        
    elseif event == "TRADE_SKILL_LIST_UPDATE" or event == "TRADE_SKILL_SHOW" then
        C_Timer.After(0.5, ScanTradeSkills)
        
    elseif event == "GOSSIP_SHOW" then
        C_Timer.After(0.1, function()
            CaptureNPC("target")
            CaptureGossip()
        end)

    elseif event == "PLAYER_TARGET_CHANGED" then
        C_Timer.After(0.05, function()
            CaptureNPC("target")
            ScanAuras("target")
        end)

    elseif event == "UPDATE_MOUSEOVER_UNIT" then
        C_Timer.After(0.05, function()
            if not InCombatLockdown() then CaptureNPC("mouseover") end
        end)
        
    elseif event == "UNIT_AURA" then
        if arg1 == "player" or arg1 == "target" then
            ScanAuras(arg1)
        end

    elseif event == "TAXIMAP_OPENED" then
        C_Timer.After(0.5, ScanTaxis)

    elseif event == "QUEST_TURNED_IN" then
        local questID, xpReward, moneyReward = arg1, arg2, arg3
        if questID then
            local key = tostring(questID)
            if not QuestScraperDB.quests[key] then
                QuestScraperDB.quests[key] = {
                    quest_id = questID,
                    title = "Hidden/Tracking Quest",
                    reward_xp = xpReward and xpReward > 0 and xpReward or nil,
                    reward_gold = moneyReward and moneyReward > 0 and moneyReward or nil,
                    captured_at = date("%Y-%m-%dT%H:%M:%S"),
                    is_hidden = true
                }
            end
        end

    elseif event == "LOOT_OPENED" then
        ScanLoot()
    end
end)

-- -----------------------------------------------------------------------
-- Tooltip IDs y Textos Detallados
-- -----------------------------------------------------------------------
local function CaptureItemTooltip(tooltip, dataId)
    if not dataId then return end
    local key = tostring(dataId)
    
    if not QuestScraperDB.item_tooltips[key] then
        QuestScraperDB.item_tooltips[key] = { lines = {} }
    end
    
    local tooltipName = tooltip:GetName()
    if not tooltipName then return end
    
    local lines = {}
    for i = 1, 40 do
        local fontString = _G[tooltipName .. "TextLeft" .. i]
        if fontString then
            local text = fontString:GetText()
            if text and text ~= "" then
                table.insert(lines, trim(text))
            end
        else
            break
        end
    end
    
    if #lines > 1 then
        QuestScraperDB.item_tooltips[key].lines = lines
    end
end

local function CaptureSpellTooltip(tooltip, dataId)
    if not dataId then return end
    local key = tostring(dataId)
    
    if not QuestScraperDB.spells[key] then
        QuestScraperDB.spells[key] = { lines = {} }
    end
    
    local tooltipName = tooltip:GetName()
    if not tooltipName then return end
    
    local lines = {}
    for i = 1, 40 do
        local fontString = _G[tooltipName .. "TextLeft" .. i]
        if fontString then
            local text = fontString:GetText()
            if text and text ~= "" then
                table.insert(lines, trim(text))
            end
        else
            break
        end
    end
    
    if #lines > 1 then
        QuestScraperDB.spells[key].lines = lines
    end
end

if TooltipDataProcessor then
    TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Item, function(tooltip, data)
        if InCombatLockdown() then return end
        if data and data.id then
            local isSaved = QuestScraperDB and QuestScraperDB.seen_items and QuestScraperDB.seen_items[data.id]
            RecordItemID(data.id)
            local check = isSaved and " |TInterface\\RaidFrame\\ReadyCheck-Ready:0|t" or ""
            tooltip:AddLine("Item ID: |cffffffff" .. data.id .. "|r" .. check)
            CaptureItemTooltip(tooltip, data.id)
        end
    end)
    TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Spell, function(tooltip, data)
        if InCombatLockdown() then return end
        if data and data.id then
            local isSaved = QuestScraperDB and QuestScraperDB.spells and QuestScraperDB.spells[tostring(data.id)]
            local check = isSaved and " |TInterface\\RaidFrame\\ReadyCheck-Ready:0|t" or ""
            tooltip:AddLine("Spell ID: |cffffffff" .. data.id .. "|r" .. check)
            CaptureSpellTooltip(tooltip, data.id)
        end
    end)
    TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Unit, function(tooltip, data)
        if InCombatLockdown() then return end
        if data and data.guid then
            local npcId = tonumber(data.guid:match("Creature%-%d+%-%d+%-%d+%-%d+%-(%d+)"))
            if npcId then
                local isSaved = QuestScraperDB and QuestScraperDB.npcs and QuestScraperDB.npcs[tostring(npcId)]
                local check = isSaved and " |TInterface\\RaidFrame\\ReadyCheck-Ready:0|t" or ""
                tooltip:AddLine("NPC ID: |cffffffff" .. npcId .. "|r" .. check)
                -- Intentar capturar el titulo de la segunda linea del tooltip
                local tooltipName = tooltip:GetName()
                if tooltipName then
                    local line2 = _G[tooltipName .. "TextLeft2"]
                    if line2 then
                        local t = line2:GetText()
                        if t and t ~= "" then
                            npcTitles[data.guid] = t
                        end
                    end
                end
            end
        end
    end)
    -- En WoW moderno, TooltipDataType.Object maneja GameObjects
    if Enum.TooltipDataType.Object then
        TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Object, function(tooltip, data)
            if InCombatLockdown() then return end
            if data and data.id then
                local isSaved = QuestScraperDB and QuestScraperDB.gameobjects and QuestScraperDB.gameobjects[tostring(data.id)]
                local check = isSaved and " |TInterface\\RaidFrame\\ReadyCheck-Ready:0|t" or ""
                tooltip:AddLine("Object ID: |cffffffff" .. data.id .. "|r" .. check)
                local name = tooltip:GetName() and _G[tooltip:GetName() .. "TextLeft1"] and _G[tooltip:GetName() .. "TextLeft1"]:GetText()
                if name then
                    RecordGameObject(data.id, name)
                end
            end
        end)
    end
    if Enum.TooltipDataType.Quest then
        TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Quest, function(tooltip, data)
            if InCombatLockdown() then return end
            if data and data.id then
                local isSaved = QuestScraperDB and QuestScraperDB.quests and QuestScraperDB.quests[tostring(data.id)]
                local check = isSaved and " |TInterface\\RaidFrame\\ReadyCheck-Ready:0|t" or ""
                tooltip:AddLine("Quest ID: |cffffffff" .. data.id .. "|r" .. check)
            end
        end)
    end
else
    GameTooltip:HookScript("OnTooltipSetItem", function(self)
        if InCombatLockdown() then return end
        local _, link = self:GetItem()
        if link then
            local id = string.match(link, "item:(%d+)")
            if id then
                local isSaved = QuestScraperDB and QuestScraperDB.seen_items and QuestScraperDB.seen_items[id]
                RecordItemID(id)
                local check = isSaved and " |TInterface\\RaidFrame\\ReadyCheck-Ready:0|t" or ""
                self:AddLine("Item ID: |cffffffff" .. id .. "|r" .. check)
                CaptureItemTooltip(self, id)
            end
        end
    end)
    GameTooltip:HookScript("OnTooltipSetUnit", function(self)
        if InCombatLockdown() then return end
        local _, unit = self:GetUnit()
        if unit then
            local guid = UnitGUID(unit)
            if guid and canaccessvalue(guid) then
                if guid:find("^Creature") then
                    local npcId = tonumber(guid:match("Creature%-%d+%-%d+%-%d+%-%d+%-(%d+)"))
                    if npcId then
                        local isSaved = QuestScraperDB and QuestScraperDB.npcs and QuestScraperDB.npcs[tostring(npcId)]
                        local check = isSaved and " |TInterface\\RaidFrame\\ReadyCheck-Ready:0|t" or ""
                        self:AddLine("NPC ID: |cffffffff" .. npcId .. "|r" .. check)
                        -- Capturar titulo (linea 2 del tooltip = titulo del NPC)
                        local tooltipName = self:GetName()
                        if tooltipName then
                            local line2 = _G[tooltipName .. "TextLeft2"]
                            if line2 then
                                local t = line2:GetText()
                                if t and t ~= "" then
                                    npcTitles[guid] = t
                                end
                            end
                        end
                    end
                end
            end
        end
    end)
    GameTooltip:HookScript("OnTooltipSetSpell", function(self)
        if InCombatLockdown() then return end
        local _, id = self:GetSpell()
        if id then
            self:AddLine("Spell ID: |cffffffff" .. id .. "|r")
            CaptureSpellTooltip(self, id)
        end
    end)

    if _G.QuestLogTitleButton_OnEnter then
        hooksecurefunc("QuestLogTitleButton_OnEnter", function(self)
            local questID = self.questID
            
            if not questID then
                -- En clientes modernos basados en classic (como WoW Forever)
                -- el indice real es el ID del boton + el offset del scroll.
                local scrollFrame = _G.QuestLogListScrollFrame
                local getOffsetFunc = _G.FauxScrollFrame_GetOffset
                local offset = (scrollFrame and getOffsetFunc) and getOffsetFunc(scrollFrame) or 0
                local questIndex = self.questLogIndex or (self:GetID() + offset)
                
                if questIndex and questIndex > 0 then
                    if C_QuestLog and C_QuestLog.GetInfo then
                        local info = C_QuestLog.GetInfo(questIndex)
                        questID = info and info.questID
                    elseif _G.GetQuestLogTitle then
                        local _, _, _, _, _, _, _, t8, t9 = _G.GetQuestLogTitle(questIndex)
                        questID = type(t9) == "number" and t9 or (type(t8) == "number" and t8)
                    end
                end
            end

            if questID then
                local isSaved = QuestScraperDB and QuestScraperDB.quests and QuestScraperDB.quests[tostring(questID)]
                local check = isSaved and " |TInterface\\RaidFrame\\ReadyCheck-Ready:0|t" or ""
                
                local found = false
                if GameTooltip:IsShown() then
                    for i = 1, GameTooltip:NumLines() do
                        local line = _G["GameTooltipTextLeft" .. i]
                        if line and line:GetText() and line:GetText():find("Quest ID: ") then
                            found = true
                            break
                        end
                    end
                end
                
                if not found then
                    GameTooltip:AddLine("Quest ID: |cffffffff" .. questID .. "|r" .. check)
                    GameTooltip:Show()
                end
            end
        end)
    end
    
    -- =======================================================================
    -- QUEST ID EN TOOLTIP — mecanismos basados en eventos (como idTip)
    -- =======================================================================

    -- Helper: inyecta "QuestID  <id>" en el tooltip dado, con checkmark si ya fue capturada
    local function injectQuestID(tooltip, questID)
        if not questID or questID == 0 then return end
        local name = tooltip:GetName()
        if not name then return end
        -- No re-inyectar si ya está la línea
        for i = tooltip:NumLines(), 1, -1 do
            local f = _G[name .. "TextLeft" .. i]
            if f and f:GetText() and f:GetText():find("QuestID", 1, true) then
                return
            end
        end
        local isSaved = QuestScraperDB and QuestScraperDB.quests and QuestScraperDB.quests[tostring(questID)]
        local check   = isSaved and " |TInterface\\RaidFrame\\ReadyCheck-Ready:0|t" or ""
        tooltip:AddDoubleLine("QuestID", questID .. check, nil, nil, nil, 1, 1, 1)
        tooltip:Show()
    end

    -- MECANISMO 1: TooltipDataProcessor (cliente moderno / TWW)
    -- Blizzard llama este callback DESPUÉS de construir cualquier tooltip,
    -- pasando data.type = 23 (Quest) o 24 (QuestPartyProgress) y data.id = questID.
    if TooltipDataProcessor then
        TooltipDataProcessor.AddTooltipPostCall(TooltipDataProcessor.AllTypes, function(tooltip, data)
            if not data or not data.type then return end
            local t = tonumber(data.type)
            if (t == 23 or t == 24) and data.id then
                injectQuestID(tooltip, data.id)
            end
        end)
    end

    -- MECANISMO 2: Panel de aceptar / entregar misión (QuestFrame)
    -- GetQuestID() retorna el ID de la misión activa en el frame de diálogo.
    if _G.QuestFrame and GetQuestID then
        _G.QuestFrame:HookScript("OnShow", function()
            local qid = GetQuestID()
            if not qid or qid == 0 then return end
            local isSaved = QuestScraperDB and QuestScraperDB.quests and QuestScraperDB.quests[tostring(qid)]
            print(string.format("|cFF00FF00[QuestScraper]|r QuestID: |cFFFFD700%d|r%s", qid, isSaved and " (captured)" or ""))
        end)
    end

    -- MECANISMO 3: Botones del mapa de misiones (quest log moderno)
    -- QuestMapLogTitleButton_OnEnter se llama cuando el cursor pasa sobre una misión en el mapa.
    if C_QuestLog and C_QuestLog.GetQuestIDForLogIndex then
        hooksecurefunc(_G, "QuestMapLogTitleButton_OnEnter", function(btn)
            if not btn or not btn.questLogIndex then return end
            local qid = C_QuestLog.GetQuestIDForLogIndex(btn.questLogIndex)
            if qid then injectQuestID(GameTooltip, qid) end
        end)
    end

    -- MECANISMO 4: Tooltip de misión en el mapa del mundo (POI markers)
    hooksecurefunc(_G, "TaskPOI_OnEnter", function(btn)
        if btn and btn.questID then injectQuestID(GameTooltip, btn.questID) end
    end)

    -- MECANISMO 5: Quest log clásico (QuestLogTitle buttons)
    -- Para clientes que aún usan la UI clásica con QuestLogListScrollFrame
    hooksecurefunc(_G, "QuestLog_SetSelection", function(selection)
        local getQuestLogTitle = _G.GetQuestLogTitle
        if not getQuestLogTitle then return end
        -- El 8vo retorno de GetQuestLogTitle es el questID en versiones modernas
        local qid = select(8, getQuestLogTitle(selection))
        if qid and type(qid) == "number" and qid ~= 0 then
            injectQuestID(GameTooltip, qid)
        end
    end)
end


-- -----------------------------------------------------------------------
-- Comando /qs para ver estadisticas y exportar resumen
-- -----------------------------------------------------------------------
SLASH_QUESTSCRAPER1 = "/qs"
SlashCmdList["QUESTSCRAPER"] = function(msg)
    local cmd = trim(msg):lower()

    if cmd == "bag" then
        ScanInventory(true)
    elseif cmd == "count" or cmd == "" then
        local n = 0
        for _ in pairs(QuestScraperDB.quests) do n = n + 1 end
        local invCount = 0
        for _ in pairs(QuestScraperDB.inventory or {}) do invCount = invCount + 1 end
        local seenCount = 0
        for _ in pairs(QuestScraperDB.seen_items or {}) do seenCount = seenCount + 1 end
        local npcCount = 0
        for _ in pairs(QuestScraperDB.npcs or {}) do npcCount = npcCount + 1 end
        print(string.format("|cFF00FF00[QuestScraper]|r Capturados: |cFFFFD700%d|r misiones, |cFFFFD700%d|r items inventario, |cFFFFD700%d|r items vistos, |cFFFFD700%d|r NPCs", n, invCount, seenCount, npcCount))

    elseif cmd == "clear" then
        QuestScraperDB.quests = {}
        QuestScraperDB.inventory = {}
        QuestScraperDB.seen_items = {}
        QuestScraperDB.npcs = {}
        QuestScraperDB.gameobjects = {}
        QuestScraperDB.loot = {}
        QuestScraperDB.vendors = {}
        QuestScraperDB.trainers = {}
        QuestScraperDB.recipes = {}
        QuestScraperDB.item_tooltips = {}
        QuestScraperDB.spells = {}
        QuestScraperDB.auras = {}
        QuestScraperDB.achievements = {}
        QuestScraperDB.taxis = {}
        QuestScraperDB.factions = {}
        print("|cFF00FF00[QuestScraper]|r Base de datos limpiada.")

    elseif cmd == "achievements" then
        ScanAchievements()

    elseif cmd == "list" then
        print("|cFF00FF00[QuestScraper]|r Misiones guardadas:")
        for key, entry in pairs(QuestScraperDB.quests) do
            print(string.format("  |cFFFFD700%s|r — %s (XP: %s)",
                key,
                entry.title,
                tostring(entry.reward_xp or "?")))
        end


    elseif cmd == "tooltip" then
        -- Vuelca todas las lineas del GameTooltip al chat (para diagnostico)
        local n = GameTooltip:NumLines()
        if n == 0 then
            print("|cFF00FF00[QuestScraper]|r El GameTooltip no tiene lineas (o no esta abierto).")
        else
            print(string.format("|cFF00FF00[QuestScraper]|r GameTooltip tiene %d lineas:", n))
            for i = 1, n do
                local l = _G["GameTooltipTextLeft" .. i]
                local r = _G["GameTooltipTextRight" .. i]
                local lt = l and l:GetText() or ""
                local rt = r and r:GetText() or ""
                print(string.format("  [%d] L='%s' R='%s'", i, lt or "", rt or ""))
            end
            local owner = GameTooltip:GetOwner()
            local ownerName = owner and owner:GetName() or "nil"
            local ownerQuestID = owner and rawget(owner, "questID") or "nil"
            print(string.format("|cFF00FF00[QuestScraper]|r Owner: '%s', questID: %s", ownerName, tostring(ownerQuestID)))
        end

    elseif cmd == "help" then
        print("|cFF00FF00[QuestScraper] Comandos:|r")
        print("  /qs         — Muestra el total de misiones y objetos")
        print("  /qs list    — Lista todas las misiones")
        print("  /qs bag          — Escanea el inventario manualmente")
        print("  /qs achievements — Escanea todos los logros (toma un momento)")
        print("  /qs clear        — Borra la DB local completa")
        print("  /qs tooltip      — Vuelca las lineas del tooltip actual al chat")
        print("  /qs help         — Esta ayuda")
    else
        print("|cFF00FF00[QuestScraper]|r Comando desconocido. Usa /qs help")
    end
end
