// Sincroniza los datos de la API de Blizzard hacia .blizzard-cache.json
// Escanea los posts en busca de <WoWItem id="N" /> y precarga todos los objetos faltantes,
// además de refrescar el precio del WoW Token para US y EU.
// Uso: npm run wow:sync
import fs from 'node:fs';
import path from 'node:path';
import { getWoWItem, getWoWTokenPrice } from '../src/utils/blizzard.ts';

const CONTENT_DIR = path.join(process.cwd(), 'src', 'content', 'blog');

function walkFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkFiles(fullPath));
        } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
            results.push(fullPath);
        }
    }
    return results;
}

function collectItemIds(): number[] {
    const ids = new Set<number>();
    const itemPattern = /<WoWItem\b[^>]*\bid=["'](\d+)["']/g;
    for (const file of walkFiles(CONTENT_DIR)) {
        const content = fs.readFileSync(file, 'utf-8');
        for (const match of content.matchAll(itemPattern)) {
            ids.add(Number(match[1]));
        }
    }
    return [...ids];
}

async function main(): Promise<void> {
    const itemIds = collectItemIds();
    console.log(
        `[wow:sync] Objetos referenciados en posts (${itemIds.length}): ${itemIds.join(', ') || 'ninguno'}`,
    );

    let ok = 0;
    let failed = 0;
    for (const itemId of itemIds) {
        const item = await getWoWItem(itemId, 'es_MX');
        if (item) {
            ok += 1;
            console.log(`  [OK] ${item.id} - ${item.name} (${item.quality.name})`);
        } else {
            failed += 1;
            console.error(`  [FALLO] ${itemId}: no se pudo obtener de la API`);
        }
    }
    console.log(`[wow:sync] Objetos: ${ok} sincronizados, ${failed} con errores.`);

    for (const region of ['us', 'eu']) {
        const priceCopper = await getWoWTokenPrice(region);
        if (priceCopper !== null) {
            const gold = Math.floor(priceCopper / 10000);
            console.log(`  [OK] WoW Token ${region.toUpperCase()}: ${gold.toLocaleString('es-ES')} g`);
        } else {
            console.error(`  [FALLO] WoW Token ${region.toUpperCase()}: no disponible`);
        }
    }

    console.log('[wow:sync] Caché actualizada en .blizzard-cache.json');
}

main().catch((error) => {
    console.error('[wow:sync] Error fatal:', error);
    process.exitCode = 1;
});
