local frame = CreateFrame("Frame")

-- Registrar unicamente eventos universales soportados en todos los clientes
frame:RegisterEvent("QUEST_WATCH_UPDATE")
frame:RegisterEvent("QUEST_LOG_UPDATE")
frame:RegisterEvent("PLAYER_ENTERING_WORLD")

local lastQuestIdentifier = ""
local dummyName = "OBSBotData"

-- Ocultar el susurro saliente en nuestra ventana de chat
local addChatFilter = ChatFrame_AddMessageEventFilter or _G.ChatFrame_AddMessageEventFilter
if addChatFilter then
    addChatFilter("CHAT_MSG_WHISPER_INFORM", function(self, event, msg, ...)
        if msg:find("OBS_QUEST_SYNC::") then return true end
        return false
    end)

    -- Ocultar el mensaje de error del servidor ("No player named OBSBotData..." / "No se encuentra el jugador...")
    addChatFilter("CHAT_MSG_SYSTEM", function(self, event, msg, ...)
        if msg:find(dummyName) then return true end
        return false
    end)
end

local function SendSyncMessage(msg)
    if C_ChatInfo and C_ChatInfo.SendChatMessage then
        C_ChatInfo.SendChatMessage(msg, "WHISPER", nil, dummyName)
    else
        local legacySend = rawget(_G, "SendChatMessage")
        if legacySend then
            legacySend(msg, "WHISPER", nil, dummyName)
        end
    end
end

local function SyncQuest()
    local questID = 0
    local questName = ""
    
    if C_SuperTrack and C_SuperTrack.GetSuperTrackedQuestID and C_QuestLog and C_QuestLog.GetTitleForQuestID then
        local qID = C_SuperTrack.GetSuperTrackedQuestID()
        if qID then
            questID = qID
            questName = C_QuestLog.GetTitleForQuestID(questID) or ""
        end
    else
        local getNumWatches = _G.GetNumQuestWatches
        local numWatches = getNumWatches and getNumWatches() or 0
        if numWatches > 0 and _G.GetQuestIndexForWatch and _G.GetQuestLogTitle then
            local questIndex = _G.GetQuestIndexForWatch(1)
            if questIndex then
                local title, _, _, _, _, _, _, _, qID = _G.GetQuestLogTitle(questIndex)
                questName = title or ""
                questID = qID or 0
            end
        end
    end
    
    local identifier = questID .. "_" .. questName
    
    if questName ~= "" and identifier ~= lastQuestIdentifier then
        lastQuestIdentifier = identifier
        SendSyncMessage("OBS_QUEST_SYNC::" .. questID .. "::" .. questName)
    elseif questName == "" and lastQuestIdentifier ~= "" then
        lastQuestIdentifier = ""
        SendSyncMessage("OBS_QUEST_SYNC::NONE::")
    end
end

frame:SetScript("OnEvent", function(self, event, ...)
    if C_Timer and C_Timer.After then
        C_Timer.After(0.5, SyncQuest)
    else
        SyncQuest()
    end
end)
