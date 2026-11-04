import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { SearchSm, Users01, Trash01, Eye, Edit02, RefreshCcw01 } from '@untitledui/icons';
import { toast, Toaster } from 'sonner';
import { useUndoableDelete } from '../hooks/useUndoableDelete';

interface NPC {
    id: number;
    npc_id: number;
    name: string;
    name_en?: string;
    title?: string;
    level?: number;
    classification?: string;
    creature_type?: string;
    reaction?: string;
    zone?: string;
    area?: string;
    seen_at?: string;
}

export default function NpcsAdmin() {
    const { refreshGlobalCounts, optimisticUpdateCount } = useOutletContext<{ refreshGlobalCounts: () => void, optimisticUpdateCount: (key: string, delta: number) => void }>();
    const [npcs, setNpcs] = useState<NPC[]>([]);
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState('all');
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [syncing, setSyncing] = useState(false);

    const fetchNpcs = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('npcs').select('*').order('name', { ascending: true });
        if (!error && data) {
            setNpcs(data);
        }
        setLoading(false);
    };

    const { handleDelete } = useUndoableDelete<number>({
        onPerformDelete: async (ids) => {
            const { error } = await supabase.from('npcs').delete().in('id', ids);
            if (error) throw error;
            refreshGlobalCounts();
        },
        onOptimisticDelete: (ids) => {
            setNpcs(prev => prev.filter(n => !ids.includes(n.id)));
            setSelectedIds([]);
            optimisticUpdateCount('npcs', -ids.length);
        },
        onRestore: () => {
            fetchNpcs();
            refreshGlobalCounts();
        },
        entityName: 'NPCs'
    });

    useEffect(() => {
        fetchNpcs();
    }, []);

    const filteredNpcs = npcs.filter(npc => {
        const matchesSearch = 
            npc.name.toLowerCase().includes(search.toLowerCase()) || 
            npc.title?.toLowerCase().includes(search.toLowerCase()) ||
            npc.zone?.toLowerCase().includes(search.toLowerCase());
        
        if (!matchesSearch) return false;
        if (activeTab === 'friendly') return npc.reaction === 'friendly';
        if (activeTab === 'hostile')  return npc.reaction === 'hostile';
        if (activeTab === 'neutral')  return npc.reaction === 'neutral';
        return true;
    });

    const getReactionColor = (reaction?: string) => {
        if (reaction === 'friendly') return 'text-green-500';
        if (reaction === 'hostile') return 'text-red-500';
        if (reaction === 'neutral') return 'text-yellow-500';
        return 'text-ink-3';
    };

    const handleSyncNpcs = async () => {
        const npcsToSync = npcs.filter(n => n.name === n.name_en || !n.name_en);
        if (npcsToSync.length === 0) {
            toast.info('No NPCs pending translation.');
            return;
        }

        setSyncing(true);
        const toastId = toast.loading(`Translating ${npcsToSync.length} NPCs...`);
        let updatedCount = 0;

        try {
            const updatedNpcs = [];
            for (const npc of npcsToSync) {
                const res = await fetch(`/api/blizzard/creature?id=${npc.npc_id}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.data) {
                        updatedNpcs.push({
                            id: npc.id,
                            name: data.data.name
                        });
                        updatedCount++;
                    }
                }
            }

            if (updatedNpcs.length > 0) {
                const { error } = await supabase.from('npcs').upsert(updatedNpcs, { onConflict: 'id' });
                if (error) throw error;
                toast.success(`${updatedCount} NPCs translated successfully.`, { id: toastId });
                fetchNpcs();
            } else {
                toast.dismiss(toastId);
                toast.info('No new translations found.');
            }
        } catch (error: any) {
            toast.error(`Sync error: ${error.message}`, { id: toastId });
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="w-full px-1 pb-12">
            <Toaster position="top-right" theme="light" />
            {/* Header / Table Toolbar */}
            <div className="bg-surface-1 border border-line-1 rounded-t-xl px-4 pt-4 flex flex-col gap-4 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-bold text-ink-1">NPC Directory</h2>
                        <p className="text-sm text-ink-3 mt-0.5">{loading ? 'Loading...' : `${filteredNpcs.length} NPCs found`}</p>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-1 md:w-72">
                            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                <SearchSm className="h-4 w-4 text-ink-4" />
                            </div>
                            <Input 
                                type="text" 
                                placeholder="Search NPC by name or zone..." 
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 bg-surface-1 border-line-1 text-ink-1"
                            />
                        </div>
                        {selectedIds.length > 0 && (
                            <Button 
                                variant="outline" 
                                onClick={() => handleDelete(selectedIds)} 
                                className="shrink-0 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                            >
                                <Trash01 className="w-4 h-4 mr-2" />
                                Eliminar ({selectedIds.length})
                            </Button>
                        )}
                        <Button 
                            variant="outline" 
                            onClick={handleSyncNpcs} 
                            disabled={syncing} 
                            className="shrink-0 bg-surface-1 border-line-1 text-ink-2 hover:bg-surface-2"
                        >
                            <RefreshCcw01 className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                            {syncing ? 'Translating...' : 'Translate'}
                        </Button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-6 border-b border-line-1 w-full">
                    <button 
                        onClick={() => setActiveTab('all')} 
                        className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'all' ? 'border-accent-1 text-ink-1' : 'border-transparent text-ink-3 hover:text-ink-2'}`}
                    >
                        All ({npcs.length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('friendly')} 
                        className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'friendly' ? 'border-green-500 text-green-500' : 'border-transparent text-ink-3 hover:text-ink-2'}`}
                    >
                        Friendly ({npcs.filter(n => n.reaction === 'friendly').length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('neutral')} 
                        className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'neutral' ? 'border-yellow-500 text-yellow-500' : 'border-transparent text-ink-3 hover:text-ink-2'}`}
                    >
                        Neutral ({npcs.filter(n => n.reaction === 'neutral').length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('hostile')} 
                        className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'hostile' ? 'border-red-500 text-red-500' : 'border-transparent text-ink-3 hover:text-ink-2'}`}
                    >
                        Hostile ({npcs.filter(n => n.reaction === 'hostile').length})
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-surface-1 border-x border-b border-line-1 rounded-b-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-ink-2">
                        <thead className="text-xs text-ink-4 uppercase bg-surface-2 border-b border-line-1 font-semibold">
                            <tr>
                                <th className="px-6 py-3 w-12 text-center">
                                    <input 
                                        type="checkbox" 
                                        className="rounded border-line-1 text-accent-1 focus:ring-accent-1"
                                        checked={filteredNpcs.length > 0 && selectedIds.length === filteredNpcs.length}
                                        onChange={(e) => setSelectedIds(e.target.checked ? filteredNpcs.map(n => n.id) : [])}
                                    />
                                </th>
                                <th className="px-6 py-3">Name</th>
                                <th className="px-6 py-3 w-20">ID</th>
                                <th className="px-6 py-3">Level</th>
                                <th className="px-6 py-3">Type</th>
                                <th className="px-6 py-3">Zone</th>
                                <th className="px-6 py-3">Captured</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line-1">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-ink-3">
                                        Loading NPCs...
                                    </td>
                                </tr>
                            ) : filteredNpcs.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-ink-3">
                                        No NPCs found. Interact with them in-game with the addon active.
                                    </td>
                                </tr>
                            ) : (
                                filteredNpcs.map(npc => (
                                    <tr key={npc.id} className={`transition-colors group ${selectedIds.includes(npc.id) ? 'bg-accent-3/30' : 'hover:bg-surface-3'}`}>
                                        <td className="px-6 py-4 text-center">
                                            <input 
                                                type="checkbox" 
                                                className="rounded border-line-1 text-accent-1 focus:ring-accent-1"
                                                checked={selectedIds.includes(npc.id)}
                                                onChange={(e) => setSelectedIds(prev => e.target.checked ? [...prev, npc.id] : prev.filter(id => id !== npc.id))}
                                            />
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-surface-3 border border-line-1 flex items-center justify-center shrink-0 overflow-hidden relative">
                                                    <Users01 className="w-5 h-5 text-ink-3" />
                                                </div>
                                                <div>
                                                    <div className="font-medium text-ink-1">
                                                        {npc.name}
                                                    </div>
                                                    {npc.title && (
                                                        <div className="text-xs text-ink-3 mt-0.5">&lt;{npc.title}&gt;</div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-ink-4 font-mono">{npc.npc_id}</td>
                                        <td className="px-6 py-4 text-ink-3">
                                            {npc.level && npc.level > 0 ? npc.level : '?'}
                                            {npc.classification && npc.classification !== 'normal' && (
                                                <span className="ml-1 text-xs px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700">
                                                    {npc.classification}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-ink-3">{npc.creature_type || '-'}</td>
                                        <td className="px-6 py-4">
                                            <span className={`capitalize font-medium ${getReactionColor(npc.reaction)}`}>
                                                {npc.reaction || '-'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-ink-3">
                                            <div>{npc.zone || '-'}</div>
                                            {npc.area && npc.area !== npc.zone && (
                                                <div className="text-xs text-ink-4">{npc.area}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-ink-4 text-xs whitespace-nowrap">
                                            {npc.seen_at
                                                ? new Date(npc.seen_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                                : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    className="p-2 text-ink-4 hover:text-brand hover:bg-brand/10 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    title="Ver NPC"
                                                >
                                                    <Eye className="w-5 h-5" />
                                                </button>
                                                <button
                                                    className="p-2 text-ink-4 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    title="Editar NPC"
                                                >
                                                    <Edit02 className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete([npc.id])}
                                                    className="p-2 text-ink-4 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    title="Eliminar NPC"
                                                >
                                                    <Trash01 className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
