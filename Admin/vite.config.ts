import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
// @ts-ignore
import { searchWoWItemByName, getWoWTokenPrice, getWoWItem } from '../Sitio/src/utils/blizzard.ts'

function wowLocalAddonPlugin() {
  return {
    name: 'wow-local-addon',
    configureServer(server: any) {
      server.middlewares.use('/api/local-addon', (_req: any, res: any) => {
        const WOW_BASE = 'E:\\World of Warcraft\\_classic_beta_\\WTF\\Account';
        const SAVED_VAR_FILENAME = 'QuestScraper.lua';
        
        try {
          if (!fs.existsSync(WOW_BASE)) {
            throw new Error(`No se encontró la carpeta WTF/Account en: ${WOW_BASE}`);
          }
          const accounts = fs.readdirSync(WOW_BASE, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name);

          let foundFile = null;
          for (const account of accounts) {
            const candidate = path.join(WOW_BASE, account, 'SavedVariables', SAVED_VAR_FILENAME);
            if (fs.existsSync(candidate)) {
              foundFile = candidate;
              break;
            }
          }

          if (!foundFile) {
            throw new Error(`No se encontró ${SAVED_VAR_FILENAME}. Asegurate de haber entrado al juego con el addon activado.`);
          }

          const content = fs.readFileSync(foundFile, 'utf-8');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, content }));
        } catch (error: any) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });

      // Blizzard Search API wrapper
      server.middlewares.use('/api/blizzard/search-item', async (req: any, res: any) => {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const name = url.searchParams.get('name');
          
          if (!name) {
            throw new Error('Falta el parámetro "name"');
          }

          const itemData = await searchWoWItemByName(name);
          
          if (itemData) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, item: itemData }));
          } else {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'No encontrado' }));
          }
        } catch (error: any) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });

      // Blizzard Item by ID wrapper
      server.middlewares.use('/api/blizzard/item', async (req: any, res: any) => {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const idStr = url.searchParams.get('id');
          
          if (!idStr) {
            throw new Error('Falta el parámetro "id"');
          }
          const id = parseInt(idStr, 10);
          const itemData = await getWoWItem(id);
          
          if (itemData) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, item: itemData }));
          } else {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'No encontrado' }));
          }
        } catch (error: any) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });

      // Blizzard Token API wrapper
      server.middlewares.use('/api/blizzard/token', async (req: any, res: any) => {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const region = url.searchParams.get('region') || 'us';
          
          const tokenData = await getWoWTokenPrice(region as 'us' | 'eu');
          
          if (tokenData) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, data: tokenData }));
          } else {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'No se pudo obtener el precio' }));
          }
        } catch (error: any) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), wowLocalAddonPlugin()],
})
