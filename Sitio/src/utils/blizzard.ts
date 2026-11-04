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
        const envPaths = [
            path.join(process.cwd(), '.env'),
            path.join(process.cwd(), '../Sitio', '.env')
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

    const data = (await response.json()) as any;
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
    // --- Identificacion ---
    id: number;
    name: string;
    quality: { type: string; name: string };
    media: { id: number; url?: string };
    iconUrl?: string;

    // --- Nivel y precios ---
    itemLevel?: number;        // Nivel de objeto
    requiredLevelValue?: number; // Nivel requerido numerico (de root)
    purchasePrice?: number;    // Precio de compra en cobre
    sellPrice?: number;        // Precio de venta en cobre
    maxCount?: number;         // Max en inventario (0 = sin limite)
    purchaseQuantity?: number;
    isEquippable?: boolean;
    isStackable?: boolean;

    // --- Clasificacion ---
    itemClass?: string;
    itemSubclass?: string;
    inventoryType?: string;    // Slot: "Una mano", "Cabeza", "No equipable", etc.
    inventoryTypeRaw?: string; // type key: "WEAPON", "HEAD", "NON_EQUIP", etc.

    // --- Tooltip: datos de preview_item ---
    binding?: string;           // "Se liga al recogerlo" / "Se liga al equiparlo"
    bindingType?: string;       // "ON_ACQUIRE" / "ON_EQUIP"
    uniqueEquipped?: string;    // Texto "Unico" si aplica
    description?: string;       // Flavor text o descripcion de uso (primer spell)
    spells?: { spellId?: number; spellName?: string; description: string }[];

    // --- Estadisticas de combate ---
    armor?: number;
    stats?: { type: string; typeRaw?: string; value: number; display?: string }[];

    // --- Arma ---
    weapon?: {
        minDamage?: number;
        maxDamage?: number;
        damageClass?: string;   // "PHYSICAL", "MAGIC"
        damageDisplay?: string; // "1 - 2 p. de dano"
        attackSpeedMs?: number; // velocidad en ms (ej: 2600)
        attackSpeedDisplay?: string;
        dps?: number;
        dpsDisplay?: string;
    };

    // --- Durabilidad ---
    durability?: number;

    // --- Requisitos ---
    requiredLevel?: string;     // Display string: "Necesitas ser de nivel X"
    requiredClasses?: string[]; // Clases permitidas
    requiredRaces?: string[];   // Razas permitidas

    // --- Extras ---
    containerSlots?: number;    // Para bolsas
    set?: { id: number; name: string; items?: number[] };
    appearances?: number[];     // IDs de apariencia para transmog
}

export interface WoWQuestData {
    id: number;
    title: string;
}

export interface WoWCreatureData {
    id: number;
    name: string;
}

interface CacheEntry<T> {
    savedAt: string;
    data: T;
}

interface CacheFile {
    version: number;
    updatedAt: string;
    items: Record<string, CacheEntry<WoWItemData>>;
    quests: Record<string, CacheEntry<WoWQuestData>>;
    creatures: Record<string, CacheEntry<WoWCreatureData>>;
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
    storeCache = { version: CACHE_VERSION, updatedAt: new Date().toISOString(), items: {}, quests: {}, creatures: {}, tokenPrices: {} };
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
    store.quests = Object.fromEntries(Object.entries(store.quests || {}).filter(([, e]) => isEntryValid(e, ITEM_TTL_MS)));
    store.creatures = Object.fromEntries(Object.entries(store.creatures || {}).filter(([, e]) => isEntryValid(e, ITEM_TTL_MS)));
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
export async function getWoWItem(itemId: number, locale: string = 'en_US'): Promise<WoWItemData | null> {
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

        const d = (await itemRes.json()) as any;

        let iconUrl = '';
        if (d.media?.key?.href) {
            const mediaRes = await apiFetchWithAuth(`${d.media.key.href}&locale=${locale}`);
            if (mediaRes.ok) {
                const mediaData = (await mediaRes.json()) as any;
                const iconAsset = mediaData.assets?.find((a: { key: string }) => a.key === 'icon');
                if (iconAsset) iconUrl = iconAsset.value;
            }
        }

        const p = d.preview_item ?? {};

        // Spells (efectos de uso, descripcion de uso)
        const spells: WoWItemData['spells'] = (p.spells ?? [])
            .map((s: any) => ({
                spellId: s.spell?.id,
                spellName: s.spell?.name,
                description: s.description,
            }))
            .filter((s: any) => s.description);

        // Descripcion: flavor text de preview_item.description, o primer spell
        const description: string | undefined =
            p.description ?? (spells && spells.length > 0 ? spells[0].description : undefined);

        // Stats
        const stats = (p.stats ?? []).map((s: any) => ({
            type: s.type?.name ?? s.type ?? String(s.type),
            typeRaw: s.type?.type,
            value: s.value,
            display: s.display?.display_string,
        }));

        // Arma
        let weapon: WoWItemData['weapon'] | undefined;
        if (p.weapon) {
            weapon = {
                minDamage: p.weapon.damage?.min_value,
                maxDamage: p.weapon.damage?.max_value,
                damageClass: p.weapon.damage?.damage_class?.type,
                damageDisplay: p.weapon.damage?.display_string,
                attackSpeedMs: p.weapon.attack_speed?.value,
                attackSpeedDisplay: p.weapon.attack_speed?.display_string,
                dps: p.weapon.dps?.value,
                dpsDisplay: p.weapon.dps?.display_string,
            };
        }

        // Set
        let set: WoWItemData['set'] | undefined;
        if (p.set) {
            set = {
                id: p.set.item_set?.id,
                name: p.set.item_set?.name,
                items: (p.set.items ?? []).map((i: any) => i.id),
            };
        }

        const result: WoWItemData = {
            // Identificacion
            id: d.id,
            name: d.name,
            quality: { type: d.quality.type, name: d.quality.name },
            media: { id: d.media.id },
            iconUrl,

            // Nivel y precios (del root)
            itemLevel: d.level,
            requiredLevelValue: d.required_level,
            purchasePrice: d.purchase_price,
            sellPrice: p.sell_price?.value ?? d.sell_price,
            maxCount: d.max_count,
            purchaseQuantity: d.purchase_quantity,
            isEquippable: d.is_equippable,
            isStackable: d.is_stackable,

            // Clasificacion
            itemClass: d.item_class?.name,
            itemSubclass: d.item_subclass?.name,
            inventoryType: d.inventory_type?.name,
            inventoryTypeRaw: d.inventory_type?.type,

            // Tooltip (preview_item)
            binding: p.binding?.name,
            bindingType: p.binding?.type,
            uniqueEquipped: p.unique_equipped,
            description,
            spells: spells && spells.length > 0 ? spells : undefined,

            // Combate
            armor: p.armor?.value,
            stats: stats.length > 0 ? stats : undefined,
            weapon,

            // Durabilidad
            durability: p.durability?.value,

            // Requisitos
            requiredLevel: p.requirements?.level?.display_string,
            requiredClasses: (p.requirements?.playable_classes?.links ?? []).map((c: any) => c.name),
            requiredRaces: (p.requirements?.playable_races?.links ?? []).map((r: any) => r.name),

            // Extras
            containerSlots: p.container_slots?.value,
            set,
            appearances: (d.appearances ?? []).map((a: any) => a.id),
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
 * Busca un objeto por nombre en la API de Blizzard y devuelve sus datos completos si lo encuentra.
 */
export async function searchWoWItemByName(name: string, locale: string = 'en_US'): Promise<WoWItemData | null> {
    try {
        const namespace = 'static-us';
        const searchRes = await apiFetchWithAuth(
            `https://us.api.blizzard.com/data/wow/search/item?namespace=${namespace}&name.${locale}=${encodeURIComponent(name)}&orderby=id&_pageSize=1`
        );

        if (!searchRes.ok) {
            console.error(`[blizzard] Error buscando objeto "${name}": ${searchRes.status} ${searchRes.statusText}`);
            return null;
        }

        const searchData = (await searchRes.json()) as any;
        
        if (searchData.results && searchData.results.length > 0) {
            const itemId = searchData.results[0].data.id;
            return await getWoWItem(itemId, locale);
        }

        return null;
    } catch (error) {
        console.error(`[blizzard] Error buscando objeto por nombre "${name}":`, error);
        return null;
    }
}

/**
 * Obtiene el precio actual del Token de WoW para una región ('us' | 'eu').
 * La caché se guarda por región durante 24 horas en el JSON persistente.
 */
export async function getWoWTokenPrice(region: string = 'us'): Promise<{ price: number, last_updated_timestamp: number } | null> {
    // Bypass local JSON cache because we want fresh DB records every 30m

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

        const data = (await response.json()) as any;
        return {
            price: data.price,
            last_updated_timestamp: data.last_updated_timestamp
        };
    } catch (error) {
        console.error('[blizzard] Error consultando la API de Blizzard:', error);
        return null;
    }
}

export async function getWoWQuest(questId: number, locale: string = 'en_US'): Promise<WoWQuestData | null> {
    const store = loadStore();
    const cacheKey = `${questId}_${locale}`;
    
    if (store.quests[cacheKey] && isEntryValid(store.quests[cacheKey], ITEM_TTL_MS)) {
        return store.quests[cacheKey].data;
    }

    try {
        const namespace = `static-us`;
        const response = await apiFetchWithAuth(
            `https://us.api.blizzard.com/data/wow/quest/${questId}?namespace=${namespace}&locale=${locale}`
        );

        if (!response.ok) {
            console.error(`[blizzard] Error al obtener misión ${questId}: ${response.status}`);
            return null;
        }

        const data = (await response.json()) as any;
        const questData: WoWQuestData = {
            id: data.id,
            title: data.title
        };

        writeEntry(store.quests, cacheKey, questData);
        saveStore();
        return questData;
    } catch (error) {
        console.error(`[blizzard] Error consultando misión ${questId}:`, error);
        return null;
    }
}

export async function getWoWCreature(creatureId: number, locale: string = 'en_US'): Promise<WoWCreatureData | null> {
    const store = loadStore();
    const cacheKey = `${creatureId}_${locale}`;
    
    if (store.creatures[cacheKey] && isEntryValid(store.creatures[cacheKey], ITEM_TTL_MS)) {
        return store.creatures[cacheKey].data;
    }

    try {
        const namespace = `static-us`;
        const response = await apiFetchWithAuth(
            `https://us.api.blizzard.com/data/wow/creature/${creatureId}?namespace=${namespace}&locale=${locale}`
        );

        if (!response.ok) {
            console.error(`[blizzard] Error al obtener criatura ${creatureId}: ${response.status}`);
            return null;
        }

        const data = (await response.json()) as any;
        const creatureData: WoWCreatureData = {
            id: data.id,
            name: data.name
        };

        writeEntry(store.creatures, cacheKey, creatureData);
        saveStore();
        return creatureData;
    } catch (error) {
        console.error(`[blizzard] Error consultando criatura ${creatureId}:`, error);
        return null;
    }
}
