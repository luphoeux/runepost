import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
// @ts-ignore
import { searchWoWItemByName, getWoWTokenPrice, getWoWItem, getWoWQuest, getWoWCreature } from '../Sitio/src/utils/blizzard.ts'

const ASTRO_DEV_URL = process.env.ASTRO_DEV_URL ?? 'http://localhost:4321'

/**
 * En desarrollo el panel vive en /admin y el resto de las rutas
 * se resuelven contra el sitio Astro para tener un unico origen.
 */
function astroSiteProxyPlugin() {
  return {
    name: 'astro-site-proxy',
    configureServer(server: any) {
      const target = new URL(ASTRO_DEV_URL)

      server.middlewares.use((req: any, res: any, next: any) => {
        const url: string = req.url ?? '/'
        const pathname = url.split('?')[0]

        const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/')
        const isApiRoute = pathname === '/api' || pathname.startsWith('/api/')
        const isViteRoute =
          pathname.startsWith('/@') ||
          pathname.startsWith('/node_modules/') ||
          pathname.startsWith('/src/') ||
          pathname.startsWith('/__')

        if (pathname === '/admin') {
          res.statusCode = 301
          res.setHeader('Location', '/admin/')
          res.end()
          return
        }

        if (isAdminRoute || isApiRoute || isViteRoute) {
          return next()
        }

        const proxyReq = http.request(
          {
            hostname: target.hostname,
            port: target.port || 80,
            path: url,
            method: req.method,
            headers: { ...req.headers, host: target.host },
          },
          (proxyRes: any) => {
            res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers)
            proxyRes.pipe(res)
          }
        )

        proxyReq.on('error', () => {
          res.statusCode = 502
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(
            `<h1>Sitio no disponible</h1><p>Inicia el sitio Astro en <code>${ASTRO_DEV_URL}</code> para ver las paginas publicas.</p>`
          )
        })

        req.pipe(proxyReq)
      })
    },
  }
}

function getCandidateWowAccountDirs(): string[] {
  const customPath = process.env.WOW_PATH;
  const baseCandidates = customPath
    ? [customPath]
    : [
        'E:\\World of Warcraft',
        'C:\\Program Files (x86)\\World of Warcraft',
        'C:\\World of Warcraft',
        'D:\\World of Warcraft',
      ];

  // Prioridad 1: The War Within: Forever (_forever_), Prioridad 2: Retail (_retail_)
  const flavors = ['_forever_', '_retail_', '_classic_beta_', '_ptr_', '_xptr_'];
  const accountDirs: string[] = [];

  for (const base of baseCandidates) {
    for (const flavor of flavors) {
      const candidate = path.join(base, flavor, 'WTF', 'Account');
      if (fs.existsSync(candidate) && !accountDirs.includes(candidate)) {
        accountDirs.push(candidate);
      }
    }
    const directAccount = path.join(base, 'WTF', 'Account');
    if (fs.existsSync(directAccount) && !accountDirs.includes(directAccount)) {
      accountDirs.push(directAccount);
    }
  }

  return accountDirs;
}

function findLatestSavedVariables(filename: string = 'QuestScraper.lua'): { file: string; mtime: number } | null {
  const accountDirs = getCandidateWowAccountDirs();
  let foundFile: string | null = null;
  let newestTime = 0;

  for (const accountDir of accountDirs) {
    try {
      const accounts = fs.readdirSync(accountDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const account of accounts) {
        const candidate = path.join(accountDir, account, 'SavedVariables', filename);
        if (fs.existsSync(candidate)) {
          const stat = fs.statSync(candidate);
          if (stat.mtimeMs > newestTime) {
            newestTime = stat.mtimeMs;
            foundFile = candidate;
          }
        }
      }

      const sharedCandidate = path.join(accountDir, 'SavedVariables', filename);
      if (fs.existsSync(sharedCandidate)) {
        const stat = fs.statSync(sharedCandidate);
        if (stat.mtimeMs > newestTime) {
          newestTime = stat.mtimeMs;
          foundFile = sharedCandidate;
        }
      }
    } catch {
      // Ignorar errores de permisos en rutas no accesibles
    }
  }

  return foundFile ? { file: foundFile, mtime: newestTime } : null;
}

function wowLocalAddonPlugin() {
  return {
    name: 'wow-local-addon',
    configureServer(server: any) {
      server.middlewares.use('/api/local-addon', (_req: any, res: any) => {
        const SAVED_VAR_FILENAME = 'QuestScraper.lua';
        
        try {
          const latest = findLatestSavedVariables(SAVED_VAR_FILENAME);
          if (!latest) {
            const dirs = getCandidateWowAccountDirs();
            if (dirs.length === 0) {
              throw new Error('No se encontró la carpeta WTF/Account en las instalaciones detectadas de World of Warcraft.');
            }
            throw new Error(`No se encontró ${SAVED_VAR_FILENAME}. Asegurate de haber entrado al juego con el addon activado y haber ejecutado /reload o salido del personaje.`);
          }

          const content = fs.readFileSync(latest.file, 'utf-8');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, content, mtime: latest.mtime, filePath: latest.file }));
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

      // Blizzard Quest wrapper
      server.middlewares.use('/api/blizzard/quest', async (req: any, res: any) => {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const idStr = url.searchParams.get('id');
          if (!idStr) throw new Error('Falta el parámetro "id"');
          const data = await getWoWQuest(parseInt(idStr, 10));
          res.setHeader('Content-Type', 'application/json');
          if (data) {
            res.end(JSON.stringify({ success: true, data }));
          } else {
            res.end(JSON.stringify({ success: false, error: 'No encontrado' }));
          }
        } catch (error: any) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      });

      // Blizzard Creature wrapper
      server.middlewares.use('/api/blizzard/creature', async (req: any, res: any) => {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const idStr = url.searchParams.get('id');
          if (!idStr) throw new Error('Falta el parámetro "id"');
          const data = await getWoWCreature(parseInt(idStr, 10));
          res.setHeader('Content-Type', 'application/json');
          if (data) {
            res.end(JSON.stringify({ success: true, data }));
          } else {
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
  base: '/admin/',
  plugins: [react(), tailwindcss(), wowLocalAddonPlugin(), astroSiteProxyPlugin()],
})
