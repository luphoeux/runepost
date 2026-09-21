import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Function to get env from both folders
function loadEnvValue(key) {
    const envPaths = [
        path.join(process.cwd(), '.env'),
        path.join(process.cwd(), '../Sitio', '.env'),
        path.join(process.cwd(), '../Admin', '.env'),
        path.join(process.cwd(), 'Sitio', '.env'),
        path.join(process.cwd(), 'Admin', '.env')
    ];
    for (const envPath of envPaths) {
        if (fs.existsSync(envPath)) {
            const envFile = fs.readFileSync(envPath, 'utf-8');
            const line = envFile.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
            if (line) {
                const value = line.slice(key.length + 1).trim();
                if (value) return value;
            }
        }
    }
    return undefined;
}

const supabaseUrl = loadEnvValue('SUPABASE_URL') || loadEnvValue('VITE_SUPABASE_URL');
const supabaseKey = loadEnvValue('SUPABASE_SERVICE_ROLE_KEY') || loadEnvValue('SUPABASE_ANON_KEY') || loadEnvValue('VITE_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseKey) {
    console.error("Faltan credenciales de Supabase");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function requestNewToken() {
    const clientId = loadEnvValue('BLIZZARD_CLIENT_ID');
    const clientSecret = loadEnvValue('BLIZZARD_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
        throw new Error("Faltan credenciales de Blizzard (BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET)");
    }
    
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch('https://oauth.battle.net/token', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });
    if (!response.ok) throw new Error('Error getting OAuth token from Blizzard');
    const data = await response.json();
    return data.access_token;
}

async function fetchAndSaveTokenPrice() {
    console.log(`\n[${new Date().toLocaleTimeString()}] Obteniendo precio de la Ficha WoW...`);
    try {
        const token = await requestNewToken();

        for (const region of ['us', 'eu']) {
            const dbRegion = region === 'us' ? 'NA' : 'EU';
            const namespace = `dynamic-classic-${region}`;
            const res = await fetch(`https://${region}.api.blizzard.com/data/wow/token/index?namespace=${namespace}&locale=en_US`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                const { error } = await supabase.from('wow_token_prices').insert({
                    region: dbRegion,
                    price: data.price,
                    last_updated_timestamp: data.last_updated_timestamp
                });
                
                if (error) {
                    console.error(`Error de Supabase para ${dbRegion}:`, error.message);
                } else {
                    const gold = Math.floor(data.price / 10000);
                    console.log(`Guardado precio de ${dbRegion}: ${new Intl.NumberFormat('es-AR').format(gold)}g`);
                }
            } else {
                console.error(`Error de API Blizzard para ${region}: ${res.status} ${res.statusText}`);
            }
        }
    } catch(e) {
        console.error('Fallo al actualizar el precio de la ficha:', e.message);
    }
}

// Start sequence
fetchAndSaveTokenPrice();

const INTERVAL_MINS = 5; // Cambiar a 30 después de probar
const INTERVAL_MS = INTERVAL_MINS * 60 * 1000;
setInterval(fetchAndSaveTokenPrice, INTERVAL_MS);
console.log(`>>> CRON INICIADO. El script buscará los precios automáticamente cada ${INTERVAL_MINS} minutos. Deja esta terminal abierta. <<<`);
