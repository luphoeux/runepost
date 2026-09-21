import { BrowserRouter, Routes, Route, Navigate, Outlet, NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import QuestsAdmin from './components/QuestsAdmin';
import QuestEditorWrapper from './components/QuestEditorWrapper';
import ItemsAdmin from './components/ItemsAdmin';
import TokenAdmin from './components/TokenAdmin';
import Login from './pages/Login';
import { LogOut01, Map01, BookOpen01, Package, CoinsStacked01 } from '@untitledui/icons';

function Layout() {
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
              Juego
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
                <span>Misiones</span>
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
                <span>Objetos</span>
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
                <span>Ficha WoW</span>
              </NavLink>
            </div>
          </div>
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-line-2">
          <button 
            onClick={() => supabase.auth.signOut()} 
            className="w-full flex items-center gap-2 justify-center px-4 py-2 border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors"
          >
            <LogOut01 size={16} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-surface-2 overflow-y-auto">
        <header className="h-16 bg-surface-1 border-b border-line-1 flex items-center px-6 shrink-0 shadow-sm">
          <h1 className="text-lg font-bold text-ink-1">Panel de Control</h1>
        </header>
        <div className="flex-1 p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

// Protected Route Wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-surface-2 flex items-center justify-center text-ink-1">Cargando...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/quests" replace />} />
          <Route path="quests" element={<QuestsAdmin />} />
          <Route path="quests/:id" element={<QuestEditorWrapper />} />
          <Route path="items" element={<ItemsAdmin />} />
          <Route path="token" element={<TokenAdmin />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
