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
            exportedAt = nil,
        }
    end
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
-- Eventos
-- -----------------------------------------------------------------------
local frame = CreateFrame("Frame", "QuestScraperFrame", UIParent)
frame:RegisterEvent("ADDON_LOADED")
frame:RegisterEvent("QUEST_DETAIL")       -- se abre el dialogo de aceptar mision
frame:RegisterEvent("QUEST_PROGRESS")     -- se abre dialogo de mision en curso
frame:RegisterEvent("QUEST_COMPLETE")     -- se abre dialogo de entregar mision

frame:SetScript("OnEvent", function(self, event, arg1)
    if event == "ADDON_LOADED" and arg1 == ADDON_NAME then
        InitDB()
        print("|cFF00FF00[QuestScraper]|r Cargado. Misiones guardadas: |cFFFFD700" .. (function()
            local n = 0; for _ in pairs(QuestScraperDB.quests) do n = n + 1 end; return n
        end)() .. "|r")

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
    end
end)

-- -----------------------------------------------------------------------
-- Comando /qs para ver estadisticas y exportar resumen
-- -----------------------------------------------------------------------
SLASH_QUESTSCRAPER1 = "/qs"
SlashCmdList["QUESTSCRAPER"] = function(msg)
    local cmd = trim(msg):lower()

    if cmd == "count" or cmd == "" then
        local n = 0
        for _ in pairs(QuestScraperDB.quests) do n = n + 1 end
        print(string.format("|cFF00FF00[QuestScraper]|r Misiones capturadas: |cFFFFD700%d|r", n))

    elseif cmd == "clear" then
        QuestScraperDB.quests = {}
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
        print("  /qs         — Muestra el total de misiones capturadas")
        print("  /qs list    — Lista todas las misiones")
        print("  /qs clear   — Borra la DB local")
        print("  /qs help    — Esta ayuda")
    else
        print("|cFF00FF00[QuestScraper]|r Comando desconocido. Usa /qs help")
    end
end
