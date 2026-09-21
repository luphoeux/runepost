-- QuestScraper.lua
-- Captura automaticamente datos de misiones al abrirlas en WoW Forever.
-- Los datos se guardan en QuestScraperDB (SavedVariables) y persisten entre sesiones.

-- -----------------------------------------------------------------------
-- Inicializar DB
-- -----------------------------------------------------------------------
local ADDON_NAME = "QuestScraper"

local function InitDB()
    if not QuestScraperDB then
        QuestScraperDB = {
            version = 1,
            quests = {},
            inventory = {},
            seen_items = {},
            exportedAt = nil,
        }
    end
    if not QuestScraperDB.inventory then QuestScraperDB.inventory = {} end
    if not QuestScraperDB.seen_items then QuestScraperDB.seen_items = {} end
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

-- -----------------------------------------------------------------------
-- Captura de datos de mision
-- -----------------------------------------------------------------------
local function CaptureCurrentQuest()
    -- Titulo y textos principales
    local title       = trim(GetTitleText())
    local description = trim(GetQuestText())
    local progress    = trim(GetProgressText())   -- texto cuando la mision esta en progreso
    local completion  = trim(GetRewardText())      -- texto al completar

    if not title or title == "" then return end

    -- Intentar obtener el ID interno de la mision
    local questID = GetQuestID and GetQuestID() or nil

    -- Objetivos
    local objectives = {}
    local numObj = GetNumQuestLeaderBoards and GetNumQuestLeaderBoards() or 0
    for i = 1, numObj do
        local text = GetQuestObjectiveInfo and select(1, GetQuestObjectiveInfo(i)) or nil
        if not text then
            -- fallback para versiones antiguas de la API
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
    local numChoices = GetNumQuestChoices and GetNumQuestChoices() or 0
    for i = 1, numChoices do
        local name, _, count, _, _, _, _, quality = GetQuestItemInfo("choice", i)
        if name then
            table.insert(rewardItems, {
                name     = trim(name),
                quantity = count or 1,
                quality  = quality,
                choice   = true,
            })
        end
    end
    -- Recompensas: objetos fijos
    local numRewards = GetNumQuestRewards and GetNumQuestRewards() or 0
    for i = 1, numRewards do
        local name, _, count, _, _, _, _, quality = GetQuestItemInfo("reward", i)
        if name then
            table.insert(rewardItems, {
                name     = trim(name),
                quantity = count or 1,
                quality  = quality,
                choice   = false,
            })
        end
    end

    -- Zona actual
    local zone, area = getCurrentZone()

    -- NPC con quien se habla actualmente
    local npcName = trim(UnitName("npc") or UnitName("target") or "")

    -- Construir entrada
    local entry = {
        title          = title,
        description    = description,
        completion_text = completion,
        objectives     = objectives,
        giver_npc      = npcName ~= "" and npcName or nil,
        zone           = zone,
        area           = area,
        reward_xp      = rewardXP > 0 and rewardXP or nil,
        reward_gold    = rewardMoney > 0 and rewardMoney or nil,
        reward_items   = #rewardItems > 0 and rewardItems or nil,
        captured_at    = date("%Y-%m-%dT%H:%M:%S"),
    }

    -- Usar questID como clave si existe, sino el titulo
    local key = (questID and questID ~= 0) and tostring(questID) or title
    entry.quest_id = (questID and questID ~= 0) and questID or nil

    -- Guardar (upsert por clave)
    QuestScraperDB.quests[key] = entry

    -- Notificacion en pantalla
    local count = 0
    for _ in pairs(QuestScraperDB.quests) do count = count + 1 end
    print(string.format("|cFF00FF00[QuestScraper]|r Mision guardada: |cFFFFD700%s|r (total: %d)", title, count))
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
                if not QuestScraperDB.inventory[itemName] then
                    uniqueCount = uniqueCount + 1
                    QuestScraperDB.inventory[itemName] = {
                        name = itemName,
                        quality = quality,
                        quantity = stackCount
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

-- -----------------------------------------------------------------------
-- Captura Pasiva de IDs (Data Mining)
-- -----------------------------------------------------------------------
local function RecordItemID(id)
    if not id then return false end
    local numId = tonumber(id)
    if numId and numId > 0 and not QuestScraperDB.seen_items[numId] then
        QuestScraperDB.seen_items[numId] = true
        return true
    end
    return false
end

local function ScanMerchant()
    local numItems = GetMerchantNumItems()
    local added = 0
    for i = 1, numItems do
        local link = GetMerchantItemLink(i)
        if link then
            local id = string.match(link, "item:(%d+)")
            if RecordItemID(id) then added = added + 1 end
        end
    end
    if added > 0 then
        print(string.format("|cFF00FF00[QuestScraper]|r Se registraron |cFFFFD700%d|r objetos nuevos del vendedor.", added))
    end
end

local function ScanLoot()
    local numItems = GetNumLootItems()
    local added = 0
    for i = 1, numItems do
        local link = GetLootSlotLink(i)
        if link then
            local id = string.match(link, "item:(%d+)")
            if RecordItemID(id) then added = added + 1 end
        end
    end
    if added > 0 then
        print(string.format("|cFF00FF00[QuestScraper]|r Se registraron |cFFFFD700%d|r objetos nuevos del botín.", added))
    end
end

-- -----------------------------------------------------------------------
-- Eventos
-- -----------------------------------------------------------------------
local frame = CreateFrame("Frame", "QuestScraperFrame", UIParent)
frame:RegisterEvent("ADDON_LOADED")
frame:RegisterEvent("PLAYER_ENTERING_WORLD")
frame:RegisterEvent("BAG_UPDATE_DELAYED")
frame:RegisterEvent("QUEST_DETAIL")
frame:RegisterEvent("QUEST_PROGRESS")
frame:RegisterEvent("QUEST_COMPLETE")
frame:RegisterEvent("MERCHANT_SHOW")
frame:RegisterEvent("LOOT_OPENED")

frame:SetScript("OnEvent", function(self, event, arg1)
    if event == "ADDON_LOADED" and arg1 == ADDON_NAME then
        InitDB()
        local qCount = 0; for _ in pairs(QuestScraperDB.quests) do qCount = qCount + 1 end
        local seenCount = 0; for _ in pairs(QuestScraperDB.seen_items) do seenCount = seenCount + 1 end
        print(string.format("|cFF00FF00[QuestScraper]|r Cargado. Misiones: |cFFFFD700%d|r, Objetos Descubiertos: |cFFFFD700%d|r", qCount, seenCount))

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
        
    elseif event == "MERCHANT_SHOW" then
        ScanMerchant()
        
    elseif event == "LOOT_OPENED" then
        ScanLoot()
    end
end)

-- -----------------------------------------------------------------------
-- Tooltip IDs
-- -----------------------------------------------------------------------
if TooltipDataProcessor then
    TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Item, function(tooltip, data)
        if data and data.id then
            RecordItemID(data.id)
            tooltip:AddLine("Item ID: |cffffffff" .. data.id .. "|r")
        end
    end)
    TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Spell, function(tooltip, data)
        if data and data.id then
            tooltip:AddLine("Spell ID: |cffffffff" .. data.id .. "|r")
        end
    end)
else
    GameTooltip:HookScript("OnTooltipSetItem", function(self)
        local _, link = self:GetItem()
        if link then
            local id = string.match(link, "item:(%d+)")
            if id then
                RecordItemID(id)
                self:AddLine("Item ID: |cffffffff" .. id .. "|r")
                self:Show()
            end
        end
    end)
    GameTooltip:HookScript("OnTooltipSetSpell", function(self)
        local _, id = self:GetSpell()
        if id then
            self:AddLine("Spell ID: |cffffffff" .. id .. "|r")
            self:Show()
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
        print(string.format("|cFF00FF00[QuestScraper]|r Capturados: |cFFFFD700%d|r misiones, |cFFFFD700%d|r items en inventario, |cFFFFD700%d|r items avistados (DB)", n, invCount, seenCount))

    elseif cmd == "clear" then
        QuestScraperDB.quests = {}
        QuestScraperDB.inventory = {}
        QuestScraperDB.seen_items = {}
        print("|cFF00FF00[QuestScraper]|r Base de datos limpiada.")

    elseif cmd == "list" then
        print("|cFF00FF00[QuestScraper]|r Misiones guardadas:")
        for key, entry in pairs(QuestScraperDB.quests) do
            print(string.format("  |cFFFFD700%s|r — %s (XP: %s)",
                key,
                entry.title,
                tostring(entry.reward_xp or "?")))
        end


    elseif cmd == "help" then
        print("|cFF00FF00[QuestScraper] Comandos:|r")
        print("  /qs         — Muestra el total de misiones y objetos")
        print("  /qs list    — Lista todas las misiones")
        print("  /qs bag     — Escanea el inventario manualmente")
        print("  /qs clear   — Borra la DB local")
        print("  /qs help    — Esta ayuda")
    else
        print("|cFF00FF00[QuestScraper]|r Comando desconocido. Usa /qs help")
    end
end
