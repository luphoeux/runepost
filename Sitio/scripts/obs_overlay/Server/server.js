const { Tail } = require('tail');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// ==========================================
// CONFIGURACIÓN: CAMBIAR A LA RUTA DE TU WOW
// ==========================================
const wowLogPath = 'E:\\World of Warcraft\\_classic_beta_\\Logs\\WoWChatLog.txt';
const wsPort = 8080;

if (!fs.existsSync(wowLogPath)) {
    console.log(`El archivo de log no existe en: ${wowLogPath}`);
    console.log('Creándolo automáticamente para que el servidor pueda arrancar...');
    
    // Asegurar que el directorio Logs existe
    const logDir = path.dirname(wowLogPath);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    
    fs.writeFileSync(wowLogPath, ''); // Crear archivo vacío
}

const wss = new WebSocket.Server({ port: wsPort });
let lastQuestData = null;

wss.on('connection', function connection(ws) {
    console.log('✅ Cliente OBS (Overlay) conectado.');
    if (lastQuestData) {
        ws.send(JSON.stringify(lastQuestData));
    }
});

// Leemos el log desde el final para capturar solo lo nuevo
const tail = new Tail(wowLogPath, { fromBeginning: false });

tail.on('line', function(data) {
    if (data.includes('OBS_QUEST_SYNC::')) {
        const match = data.match(/OBS_QUEST_SYNC::(.*?)::(.*)/);
        if (match) {
            const questId = match[1];
            const questName = match[2];
            
            lastQuestData = { id: questId, name: questName };
            console.log(`[Actualización] Misión: ${questName} (ID: ${questId})`);
            
            // Transmitir a todos los clientes (OBS)
            wss.clients.forEach(function each(client) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(lastQuestData));
                }
            });
        }
    }
});

tail.on('error', function(error) {
    console.error('ERROR al leer el archivo de log: ', error);
});

console.log(`Servidor de conexión iniciado en el puerto ${wsPort}.`);
console.log(`Monitoreando en tiempo real: ${wowLogPath}`);
