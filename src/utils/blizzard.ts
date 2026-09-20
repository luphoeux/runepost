// Cliente de la API de Blizzard: token OAuth, reintentos con backoff y caché JSON persistente.
// Funciona tanto en Vite/Astro (import.meta.env) como en Node puro para scripts CLI (scripts/wow-sync.ts).
import fs from 'node:fs';
import path from 'node:path';

const CACHE_FILE = path.join(process.cwd(), '.blizzard-cache.json');
const CACHE_VERSION = 3;

// TTLs por tipo de dato
const ITEM_TTL_MS = 30 * 24 * 60 * 60 * 1000; // Datos estáticos de objetos: 30 días
const TOKEN_PRICE_TTL_MS = 24 * 60 * 60 * 1000; // Precio del Token: 24 horas

// Token de acceso
const TOKEN_MARGIN_SECONDS = 300; // Renovar 5 minutos antes de la expiración real

// Reintentos
const MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 400;
const RETRY_MAX_DELAY_MS = 8000;

/* ---------- Entorno ---------- */

let cachedCredentials: { clientId: string; clientSecret: string } | null = null;

function loadEnvValue(key: string): string | undefined {
    const viteEnv = (import.meta as any).env;
    if (viteEnv && typeof viteEnv[key] === 'string' && viteEnv[key]) {
        return viteEnv[key];
    }
    if (process.env[key]) return process.env[key];
    try {
        const envFile = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf-8');
        const line = envFile.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
        if (line) {
            const value = line.slice(key.length + 1).trim();
            if (value) return value;
        }
    } catch {
        // Sin archivo .env: se resolverá con el resto de fuentes
    }
    return undefined;
}

function ensureCredentials(): { clientId: string; clientSecret: string } {
    if (!cachedCredentials) {
        cachedCredentials = {
            clientId: loadEnvValue('BLIZZARD_CLIENT_ID') ?? '',
            clientSecret: loadEnvValue('BLIZZARD_CLIENT_SECRET') ?? '',
        };
    }
    if (!cachedCredentials.clientId || !cachedCredentials.clientSecret) {
        throw new Error('Faltan BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET en el entorno (.env).');
    }
    return cachedCredentials;
}

/* ---------- Utilidades de red ---------- */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function backoffDelay(attempt: number): number {
    const exponential = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** attempt);
    return exponential + Math.random() * exponential * 0.25; // Jitter para evitar ráfagas sincronizadas
}

/**
 * fetch con reintentos: errores de red, HTTP 429 (rate limit) y 5xx.
 * Respeta la cabecera Retry-After cuando existe.
 */
async function fetchWithRetry(url: string, init: RequestInit = {}, retries: number = MAX_RETRIES): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const response = await fetch(url, init);
            if (response.status === 429 || response.status >= 500) {
                if (attempt === retries) return response;
                const retryAfter = Number(response.headers.get('retry-after')) * 1000;
                const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : backoffDelay(attempt);
                await sleep(delay);
                continue;
            }
            return response;
        } catch (error) {
            if (attempt === retries) throw error;
            lastError = error;
            await sleep(backoffDelay(attempt));
        }
    }
    throw lastError;
}

/* ---------- Token de acceso OAuth 2.0 (Client Credentials) ---------- */

let cachedToken: string | null = null;
let tokenExpirationTime = 0;
let tokenRequestInFlight: Promise<string> | null = null;

async function requestNewToken(): Promise<string> {
    const { clientId, clientSecret } = ensureCredentials();
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetchWithRetry('https://oauth.battle.net/token', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
        throw new Error(`Error al obtener token de Blizzard: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    cachedToken = data.access_token;
    tokenExpirationTime = Date.now() + (data.expires_in - TOKEN_MARGIN_SECONDS) * 1000;
    return cachedToken as string;
}

/**
 * Devuelve un token válido, renovándolo si expiró.
 * Las peticiones concurrentes comparten la misma solicitud de token.
 */
export async function getBlizzardAccessToken(): Promise<string> {
    if (cachedToken && Date.now() < tokenExpirationTime) {
        return cachedToken;
    }
    if (tokenRequestInFlight) {
        return tokenRequestInFlight;
    }
    tokenRequestInFlight = requestNewToken().finally(() => {
        tokenRequestInFlight = null;
    });
    return tokenRequestInFlight;
}

/**
 * fetch autenticado con Bearer token.
 * Si la API responde 401 (token inválido/revocado), se renueva el token y se reintenta una vez.
 */
async function apiFetchWithAuth(url: string, init: RequestInit = {}): Promise<Response> {
    const withToken = (token: string) =>
        fetchWithRetry(url, {
            ...init,
            headers: { ...init.headers, Authorization: `Bearer ${token}` },
        });

    const first = await withToken(await getBlizzardAccessToken());
    if (first.status === 401) {
        cachedToken = null;
        tokenExpirationTime = 0;
        return withToken(await getBlizzardAccessToken());
    }
    return first;
}

/* ---------- Almacén JSON persistente (.blizzard-cache.json) ---------- */

export interface WoWItemData {
    id: number;
    name: string;
    quality: {
        type: string;
        name: string;
    };
    media: {
        id: number;
        url?: string;
    };
    iconUrl?: string;
    description?: string;
    itemClass?: string;
    itemSubclass?: string;
    binding?: string;
    requiredLevel?: string;
}

interface CacheEntry<T> {
    savedAt: string;
    data: T;
}

interface CacheFile {
    version: number;
    updatedAt: string;
    items: Record<string, CacheEntry<WoWItemData>>;
    tokenPrices: Record<string, CacheEntry<number>>;
}

let storeCache: CacheFile | null = null;

function loadStore(): CacheFile {
    if (storeCache) return storeCache;
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')) as CacheFile;
            if (parsed && parsed.version === CACHE_VERSION) {
                storeCache = parsed;
                return parsed;
            }
            console.warn('[blizzard] Caché con formato o versión distinta; se reconstruirá.');
        }
    } catch (error) {
        console.error('[blizzard] Error leyendo caché; se reconstruirá:', error);
    }
    storeCache = { version: CACHE_VERSION, updatedAt: new Date().toISOString(), items: {}, tokenPrices: {} };
    return storeCache;
}

function isEntryValid<T>(entry: CacheEntry<T>, ttlMs: number): boolean {
    return Date.now() - Date.parse(entry.savedAt) < ttlMs;
}

function readEntry<T>(map: Record<string, CacheEntry<T>>, key: string, ttlMs: number): T | undefined {
    const entry = map[key];
    if (!entry || !isEntryValid(entry, ttlMs)) return undefined;
    return entry.data;
}

function writeEntry<T>(map: Record<string, CacheEntry<T>>, key: string, data: T): void {
    map[key] = { savedAt: new Date().toISOString(), data };
}

/**
 * Escritura atómica (temp + rename) y poda de entradas expiradas para mantener el JSON limpio.
 */
function saveStore(): void {
    const store = loadStore();
    store.items = Object.fromEntries(Object.entries(store.items).filter(([, e]) => isEntryValid(e, ITEM_TTL_MS)));
    store.tokenPrices = Object.fromEntries(
        Object.entries(store.tokenPrices).filter(([, e]) => isEntryValid(e, TOKEN_PRICE_TTL_MS)),
    );
    store.updatedAt = new Date().toISOString();

    const tmpFile = `${CACHE_FILE}.tmp`;
    try {
        fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), 'utf-8');
        fs.renameSync(tmpFile, CACHE_FILE);
    } catch (error) {
        console.error('[blizzard] Error guardando caché:', error);
        try {
            fs.rmSync(tmpFile, { force: true });
        } catch {
            // ignorar
        }
    }
}

/* ---------- Datos de WoW ---------- */

/**
 * Obtiene la información de un objeto de WoW.
 * Lee de la caché JSON si es válida; si no, consulta la API y persiste el resultado.
 */
export async function getWoWItem(itemId: number, locale: string = 'es_MX'): Promise<WoWItemData | null> {
    const cacheKey = `${itemId}-${locale}`;
    const store = loadStore();
    const cached = readEntry(store.items, cacheKey, ITEM_TTL_MS);
    if (cached) return cached;

    try {
        const namespace = 'static-us';
        const itemRes = await apiFetchWithAuth(
            `https://us.api.blizzard.com/data/wow/item/${itemId}?namespace=${namespace}&locale=${locale}`,
        );

        if (itemRes.status === 404) {
            console.warn(`[blizzard] El objeto ${itemId} no existe (404).`);
            return null;
        }
        if (!itemRes.ok) {
            console.error(`[blizzard] Error al obtener objeto ${itemId}: ${itemRes.status} ${itemRes.statusText}`);
            return null;
        }

        const itemData = await itemRes.json();

        let iconUrl = '';
        if (itemData.media?.key?.href) {
            const mediaRes = await apiFetchWithAuth(`${itemData.media.key.href}&locale=${locale}`);
            if (mediaRes.ok) {
                const mediaData = await mediaRes.json();
                const iconAsset = mediaData.assets?.find((a: { key: string }) => a.key === 'icon');
                if (iconAsset) iconUrl = iconAsset.value;
            }
        }

        const previewItem = itemData.preview_item?.item ?? itemData;
        const result: WoWItemData = {
            id: itemData.id,
            name: itemData.name,
            quality: {
                type: itemData.quality.type,
                name: itemData.quality.name,
            },
            media: {
                id: itemData.media.id,
            },
            iconUrl,
            description: itemData.description,
            itemClass: itemData.item_class?.name,
            itemSubclass: itemData.item_subclass?.name,
            binding: previewItem.binding?.name,
            requiredLevel: previewItem.requirements?.level?.display_string,
        };

        writeEntry(store.items, cacheKey, result);
        saveStore();
        return result;
    } catch (error) {
        console.error(`[blizzard] Error consultando objeto ${itemId}:`, error);
        return null;
    }
}

/**
 * Obtiene el precio actual del Token de WoW para una región ('us' | 'eu').
 * La caché se guarda por región durante 24 horas en el JSON persistente.
 */
export async function getWoWTokenPrice(region: string = 'us'): Promise<number | null> {
    const store = loadStore();
    const cached = readEntry(store.tokenPrices, region, TOKEN_PRICE_TTL_MS);
    if (cached !== undefined) return cached;

    try {
        const namespace = `dynamic-${region}`;
        const response = await apiFetchWithAuth(
            `https://${region}.api.blizzard.com/data/wow/token/index?namespace=${namespace}&locale=en_US`,
        );

        if (!response.ok) {
            console.error(
                `[blizzard] Error al obtener precio del token (${region}): ${response.status} ${response.statusText}`,
            );
            return null;
        }

        const data = await response.json();
        writeEntry(store.tokenPrices, region, data.price);
        saveStore();
        return data.price; // El precio viene en cobre (copper)
    } catch (error) {
        console.error('[blizzard] Error consultando la API de Blizzard:', error);
        return null;
    }
}
