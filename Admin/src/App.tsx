import { BrowserRouter, Routes, Route, Navigate, Outlet, NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

import QuestsAdmin from './components/QuestsAdmin';
import QuestEditorWrapper from './components/QuestEditorWrapper';
import ItemsAdmin from './components/ItemsAdmin';
import NpcsAdmin from './components/NpcsAdmin';
import TokenAdmin from './components/TokenAdmin';
import VendorsAdmin from './components/VendorsAdmin';
import LootAdmin from './components/LootAdmin';
import TrainersAdmin from './components/TrainersAdmin';
import RecipesAdmin from './components/RecipesAdmin';
import TaxisAdmin from './components/TaxisAdmin';
import FactionsAdmin from './components/FactionsAdmin';
import GameObjectsAdmin from './components/GameObjectsAdmin';
import AurasAdmin from './components/AurasAdmin';
import { 
  Map01, BookOpen01, Package, CoinsStacked01, Users01,
  ShoppingBag01, Gift01, GraduationHat01, Beaker01, MarkerPin01, Flag01, Cube01, Lightning01
} from '@untitledui/icons';

function Layout() {
  const [counts, setCounts] = useState<Record<string, number>>({});

  const fetchCounts = async () => {
    const tables = [
      { key: 'quests', table: 'quests' },
      { key: 'items', table: 'items' },
      { key: 'npcs', table: 'npcs' },
      { key: 'vendors', table: 'npc_vendors' },
      { key: 'loot', table: 'loot' },
      { key: 'trainers', table: 'npc_trainers' },
      { key: 'recipes', table: 'recipes' },
      { key: 'taxis', table: 'taxis' },
      { key: 'factions', table: 'factions' },
      { key: 'gameobjects', table: 'gameobjects' },
      { key: 'auras', table: 'auras' },
    ];

    const newCounts: Record<string, number> = {};
    await Promise.all(
      tables.map(async ({ key, table }) => {
        if (key === 'vendors') {
          const { data } = await supabase.from(table).select('npc_id');
          newCounts[key] = data ? new Set(data.map(d => d.npc_id)).size : 0;
        } else {
          const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
          newCounts[key] = count || 0;
        }
      })
    );
    setCounts(newCounts);
  };

  useEffect(() => {
    fetchCounts();
  }, []);

  const optimisticUpdateCount = (key: string, delta: number) => {
    setCounts(prev => ({
      ...prev,
      [key]: Math.max(0, (prev[key] || 0) + delta)
    }));
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-surface-2 text-ink-1 overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col border-r border-line-1 bg-surface-1 shrink-0 w-64 shadow-sm">
        {/* Logo Area */}
        <div className="h-16 flex items-center border-b border-line-2 shrink-0 px-5 gap-3">
          <div className="w-8 h-8 bg-accent-1 rounded-lg flex items-center justify-center shrink-0">
            <Map01 size={16} className="text-white" />
          </div>
          <div>
            <span className="font-bold text-sm text-ink-1 leading-tight block">WoW</span>
            <span className="text-xs text-ink-2 font-medium block -mt-0.5">Admin</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-4 overflow-y-auto">
          <div>
            <h3 className="text-[11px] font-bold text-ink-4 uppercase tracking-wider mb-2 px-1">
              Game
            </h3>
            <div className="flex flex-col gap-0.5">
              <NavLink
                to="/quests"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-surface-3 text-ink-1 font-bold'
                      : 'text-ink-3 hover:bg-surface-3 hover:text-ink-1'
                  }`
                }
              >
                <BookOpen01 size={18} className="shrink-0" />
                <span>Quests</span>
                {counts.quests > 0 && <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10">{counts.quests}</span>}
              </NavLink>
              
              <NavLink
                to="/items"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-surface-3 text-ink-1 font-bold'
                      : 'text-ink-3 hover:bg-surface-3 hover:text-ink-1'
                  }`
                }
              >
                <Package size={18} className="shrink-0" />
                <span>Items</span>
                {counts.items > 0 && <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10">{counts.items}</span>}
              </NavLink>

              <NavLink
                to="/npcs"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-surface-3 text-ink-1 font-bold'
                      : 'text-ink-3 hover:bg-surface-3 hover:text-ink-1'
                  }`
                }
              >
                <Users01 size={18} className="shrink-0" />
                <span>NPCs</span>
                {counts.npcs > 0 && <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10">{counts.npcs}</span>}
              </NavLink>

              <NavLink
                to="/token"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-surface-3 text-ink-1 font-bold'
                      : 'text-ink-3 hover:bg-surface-3 hover:text-ink-1'
                  }`
                }
              >
                <CoinsStacked01 size={18} className="shrink-0" />
                <span>WoW Token</span>
              </NavLink>
            </div>

            <div className="flex flex-col gap-0.5 mt-6">
              <h3 className="text-[11px] font-bold text-ink-4 uppercase tracking-wider mb-2 px-1">
                Systems
              </h3>
              
              <NavLink
                to="/vendors"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive ? 'bg-surface-3 text-ink-1 font-bold' : 'text-ink-3 hover:bg-surface-3 hover:text-ink-1'
                  }`
                }
              >
                <ShoppingBag01 size={18} className="shrink-0" />
                <span>Vendors</span>
                {counts.vendors > 0 && <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10">{counts.vendors}</span>}
              </NavLink>

              <NavLink
                to="/loot"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive ? 'bg-surface-3 text-ink-1 font-bold' : 'text-ink-3 hover:bg-surface-3 hover:text-ink-1'
                  }`
                }
              >
                <Gift01 size={18} className="shrink-0" />
                <span>Loot</span>
                {counts.loot > 0 && <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10">{counts.loot}</span>}
              </NavLink>

              <NavLink
                to="/trainers"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive ? 'bg-surface-3 text-ink-1 font-bold' : 'text-ink-3 hover:bg-surface-3 hover:text-ink-1'
                  }`
                }
              >
                <GraduationHat01 size={18} className="shrink-0" />
                <span>Trainers</span>
                {counts.trainers > 0 && <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10">{counts.trainers}</span>}
              </NavLink>

              <NavLink
                to="/recipes"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive ? 'bg-surface-3 text-ink-1 font-bold' : 'text-ink-3 hover:bg-surface-3 hover:text-ink-1'
                  }`
                }
              >
                <Beaker01 size={18} className="shrink-0" />
                <span>Recipes</span>
                {counts.recipes > 0 && <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10">{counts.recipes}</span>}
              </NavLink>
            </div>

            <div className="flex flex-col gap-0.5 mt-6">
              <h3 className="text-[11px] font-bold text-ink-4 uppercase tracking-wider mb-2 px-1">
                World & Data
              </h3>

              <NavLink
                to="/taxis"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive ? 'bg-surface-3 text-ink-1 font-bold' : 'text-ink-3 hover:bg-surface-3 hover:text-ink-1'
                  }`
                }
              >
                <MarkerPin01 size={18} className="shrink-0" />
                <span>Flight Paths</span>
                {counts.taxis > 0 && <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10">{counts.taxis}</span>}
              </NavLink>

              <NavLink
                to="/factions"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive ? 'bg-surface-3 text-ink-1 font-bold' : 'text-ink-3 hover:bg-surface-3 hover:text-ink-1'
                  }`
                }
              >
                <Flag01 size={18} className="shrink-0" />
                <span>Factions</span>
                {counts.factions > 0 && <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10">{counts.factions}</span>}
              </NavLink>

              <NavLink
                to="/gameobjects"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive ? 'bg-surface-3 text-ink-1 font-bold' : 'text-ink-3 hover:bg-surface-3 hover:text-ink-1'
                  }`
                }
              >
                <Cube01 size={18} className="shrink-0" />
                <span>Game Objects</span>
                {counts.gameobjects > 0 && <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10">{counts.gameobjects}</span>}
              </NavLink>

              <NavLink
                to="/auras"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive ? 'bg-surface-3 text-ink-1 font-bold' : 'text-ink-3 hover:bg-surface-3 hover:text-ink-1'
                  }`
                }
              >
                <Lightning01 size={18} className="shrink-0" />
                <span>Auras</span>
                {counts.auras > 0 && <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10">{counts.auras}</span>}
              </NavLink>
            </div>
          </div>
        </nav>

      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-surface-2 overflow-y-auto">
        <header className="h-16 bg-surface-1 border-b border-line-1 flex items-center justify-between px-6 shrink-0 shadow-sm">
          <h1 className="text-lg font-bold text-ink-1">Dashboard</h1>
        </header>
        <div className="flex-1 p-6">
          <Outlet context={{ refreshGlobalCounts: fetchCounts, optimisticUpdateCount }} />
        </div>
      </main>
    </div>
  );
}


export default function App() {
  return (
    <BrowserRouter basename="/admin">
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/quests" replace />} />
          <Route path="quests" element={<QuestsAdmin />} />
          <Route path="quests/:id" element={<QuestEditorWrapper />} />
          <Route path="items" element={<ItemsAdmin />} />
          <Route path="npcs" element={<NpcsAdmin />} />
          <Route path="token" element={<TokenAdmin />} />
          <Route path="vendors" element={<VendorsAdmin />} />
          <Route path="loot" element={<LootAdmin />} />
          <Route path="trainers" element={<TrainersAdmin />} />
          <Route path="recipes" element={<RecipesAdmin />} />
          <Route path="taxis" element={<TaxisAdmin />} />
          <Route path="factions" element={<FactionsAdmin />} />
          <Route path="gameobjects" element={<GameObjectsAdmin />} />
          <Route path="auras" element={<AurasAdmin />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
