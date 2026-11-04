import { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { Quest } from '../types/quest-types';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { SearchSm, Edit02, Plus, BookOpen01, Upload01, Eye, Trash01 } from '@untitledui/icons';
import { supabase } from '../lib/supabaseClient';
import { Link } from 'react-router-dom';
import { processAddonData } from '../lib/addonParser';
import { uploadQuestImage } from '../lib/questImageGenerator';
import { toast, Toaster } from 'sonner';
import ConflictResolver from './ConflictResolver';
import QuestWowModal from './QuestWowModal';
import { useUndoableDelete } from '../hooks/useUndoableDelete';

export default function QuestsAdmin() {
    const { refreshGlobalCounts, optimisticUpdateCount } = useOutletContext<{ refreshGlobalCounts: () => void, optimisticUpdateCount: (key: string, delta: number) => void }>();
    const [quests, setQuests] = useState<Quest[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);
    const [conflictsQueue, setConflictsQueue] = useState<{ existing: any, imported: any }[]>([]);
    const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    
    const [autoSync, setAutoSync] = useState(false);
    const lastMtimeRef = useRef(0);

    const { handleDelete } = useUndoableDelete<number>({
        onPerformDelete: async (ids) => {
            const { error } = await supabase.from('quests').delete().in('id', ids);
            if (error) throw error;
            refreshGlobalCounts();
        },
        onOptimisticDelete: (ids) => {
            setQuests(prev => prev.filter(q => !ids.includes(q.id)));
            setSelectedIds([]);
            optimisticUpdateCount('quests', -ids.length);
        },
        onRestore: () => {
            fetchQuests();
            refreshGlobalCounts();
        },
        entityName: 'quests'
    });

    const fetchQuests = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('quests').select('*').order('created_at', { ascending: true });
        if (!error && data) {
            setQuests(data);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchQuests();
    }, []);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (autoSync && !importing && conflictsQueue.length === 0) {
            interval = setInterval(async () => {
                try {
                    const res = await fetch('/api/local-addon');
                    if (res.ok) {
                        const data = await res.json();
                        if (data.success && data.mtime) {
                            if (lastMtimeRef.current === 0) {
                                // Initial read just to set baseline
                                lastMtimeRef.current = data.mtime;
                            } else if (data.mtime > lastMtimeRef.current) {
                                // File changed! Trigger import
                                lastMtimeRef.current = data.mtime;
                                handleImportClick(data);
                            }
                        }
                    }
                } catch (e) {
                    console.error('AutoSync error:', e);
                }
            }, 5000);
        }
        return () => clearInterval(interval);
    }, [autoSync, importing, conflictsQueue]);

    const handleImportClick = async (prefetchedData?: any) => {
        setImporting(true);
        const toastId = toast.loading('Searching for quests locally...');
        
        try {
            let data = prefetchedData;
            
            if (!data) {
                const res = await fetch('/api/local-addon');
                
                // If running in production or API not found, fallback
                if (!res.ok) {
                    throw new Error('The local Vite API is not available. Make sure you are running "npm run dev".');
                }
                
                data = await res.json();
            }
            
            if (!data.success) {
                throw new Error(data.error);
            }
            
            if (data.mtime) {
                lastMtimeRef.current = data.mtime;
            }

            const text = data.content;
            const result = await processAddonData(text, (msg) => {
                toast.loading(msg, { id: toastId });
            });

            // Upsert items
            let itemsSuccessMsg = '';
            if (result.newItems && result.newItems.length > 0) {
                toast.loading(`Saving ${result.newItems.length} items to the database...`, { id: toastId });
                const { error: itemsError } = await supabase.from('items').upsert(result.newItems, { onConflict: 'id' });
                if (itemsError) {
                    toast.error(`Error saving items: ${itemsError.message}`);
                } else {
                    const sampleNames = result.newItems.map((i: any) => i.name).slice(0, 3).join(', ');
                    const more = result.newItems.length > 3 ? ` y ${result.newItems.length - 3} más` : '';
                    itemsSuccessMsg = `Items saved: ${sampleNames}${more}. `;
                }
            }

            // Upsert npcs
            let npcsSuccessMsg = '';
            if (result.newNpcs && result.newNpcs.length > 0) {
                toast.loading(`Saving ${result.newNpcs.length} NPCs to the database...`, { id: toastId });
                const { error: npcsError } = await supabase.from('npcs').upsert(result.newNpcs, { onConflict: 'npc_id', ignoreDuplicates: false });
                if (npcsError) {
                    toast.error(`Error saving NPCs: ${npcsError.message}`);
                } else {
                    npcsSuccessMsg = `${result.newNpcs.length} NPCs saved. `;
                }
            }

            // Upsert vendors
            let vendorsSuccessMsg = '';
            if (result.newVendors && result.newVendors.length > 0) {
                toast.loading(`Saving ${result.newVendors.length} vendors to the database...`, { id: toastId });
                const { error: vendorsError } = await supabase.from('npc_vendors').upsert(result.newVendors, { onConflict: 'npc_id,item_id', ignoreDuplicates: false });
                if (vendorsError) {
                    toast.error(`Error saving Vendors: ${vendorsError.message}`);
                } else {
                    vendorsSuccessMsg = `${result.newVendors.length} Vendors saved. `;
                }
            }

            if (result.newQuests.length > 0) {
                toast.loading(`Generating images for ${result.newQuests.length} new quests...`, { id: toastId });
                for (let i = 0; i < result.newQuests.length; i++) {
                    const q = result.newQuests[i];
                    try {
                        const url = await uploadQuestImage(q);
                        if (url) q.image_url = url;
                    } catch (e) { console.error('Failed to generate image for', q.id, e); }
                }
                toast.loading(`Inserting ${result.newQuests.length} new quests to database...`, { id: toastId });
                const { error } = await supabase.from('quests').insert(result.newQuests);
                if (error) {
                    toast.error(`Error inserting quests: ${error.message}`, { id: toastId });
                } else {
                    toast.success(`${itemsSuccessMsg}${npcsSuccessMsg}${vendorsSuccessMsg}${result.newQuests.length} new quests inserted.`, { id: toastId, duration: 6000 });
                }
            } else {
                if (itemsSuccessMsg || npcsSuccessMsg || vendorsSuccessMsg) {
                    toast.success(`${itemsSuccessMsg}${npcsSuccessMsg}${vendorsSuccessMsg}`, { id: toastId, duration: 6000 });
                } else {
                    toast.dismiss(toastId);
                }
            }

            if (result.conflicts.length > 0) {
                setConflictsQueue(result.conflicts);
            } else {
                fetchQuests();
                refreshGlobalCounts();
            }
        } catch (error: any) {
            toast.error(`Error: ${error.message}`, { id: toastId });
            setImporting(false);
        } finally {
            if (conflictsQueue.length === 0) {
                setImporting(false);
            }
        }
    };

    const handleConflictsResolved = () => {
        setConflictsQueue([]);
        setImporting(false);
        fetchQuests();
        refreshGlobalCounts();
        toast.success('Conflict resolution complete.');
    };

    const filteredQuests = quests.filter(q => 
        q.title.toLowerCase().includes(search.toLowerCase()) || 
        q.category?.toLowerCase().includes(search.toLowerCase())
    );

    // Sync quests function removed as we are now exclusively using English

    return (
        <div className="w-full px-1 pb-12">
            <Toaster position="top-right" theme="light" />
            {/* Header / Table Toolbar */}
            <div className="bg-surface-1 border border-line-1 rounded-t-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                <div>
                    <h2 className="text-lg font-bold text-ink-1">Quests</h2>
                    <p className="text-sm text-ink-3 mt-0.5">{loading ? 'Loading...' : `${filteredQuests.length} quests found`}</p>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-72">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <SearchSm className="h-4 w-4 text-ink-4" />
                        </div>
                        <Input 
                            type="text" 
                            placeholder="Search quest..." 
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
                    
                    <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-ink-2 bg-surface-1 border border-line-1 px-3 py-2 rounded-lg hover:bg-surface-2 transition-colors">
                        <input 
                            type="checkbox" 
                            checked={autoSync} 
                            onChange={(e) => setAutoSync(e.target.checked)} 
                            className="w-4 h-4 rounded text-brand focus:ring-brand border-line-2 cursor-pointer" 
                        />
                        <span className={autoSync ? 'text-brand font-bold' : ''}>
                            {autoSync ? 'Auto-Sync Active' : 'Auto-Sync'}
                        </span>
                    </label>



                    <Button variant="outline" onClick={() => handleImportClick()} disabled={importing || autoSync} className="shrink-0 bg-surface-1 border-line-1 text-ink-2 hover:bg-surface-2">
                        <Upload01 className="w-4 h-4 mr-2" />
                        {importing ? 'Importing...' : 'Import Data'}
                    </Button>
                    <Button className="shrink-0 bg-accent-1 hover:bg-accent-2 text-white">
                        <Plus className="w-4 h-4 mr-2" />
                        New Quest
                    </Button>
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
                                        checked={filteredQuests.length > 0 && selectedIds.length === filteredQuests.length}
                                        onChange={(e) => setSelectedIds(e.target.checked ? filteredQuests.map(q => q.id) : [])}
                                    />
                                </th>
                                <th className="px-6 py-3">Name</th>
                                <th className="px-6 py-3 w-20">ID</th>
                                <th className="px-6 py-3">Level</th>
                                <th className="px-6 py-3">Category</th>
                                <th className="px-6 py-3">Captured</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line-1">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-ink-3">
                                        Loading quests...
                                    </td>
                                </tr>
                            ) : filteredQuests.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-ink-3">
                                        No quests found.
                                    </td>
                                </tr>
                            ) : (
                                filteredQuests.map(quest => (
                                    <tr key={quest.id} className={`transition-colors group ${selectedIds.includes(quest.id) ? 'bg-accent-3/30' : 'hover:bg-surface-3'}`}>
                                        <td className="px-6 py-4 text-center">
                                            <input 
                                                type="checkbox" 
                                                className="rounded border-line-1 text-accent-1 focus:ring-accent-1"
                                                checked={selectedIds.includes(quest.id)}
                                                onChange={(e) => setSelectedIds(prev => e.target.checked ? [...prev, quest.id] : prev.filter(id => id !== quest.id))}
                                            />
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-surface-3 border border-line-1 flex items-center justify-center shrink-0">
                                                    <BookOpen01 className="w-4 h-4 text-ink-3" />
                                                </div>
                                                <div>
                                                    <div className="font-medium text-ink-1">
                                                        {quest.title}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-ink-4 font-mono">{quest.id}</td>
                                        <td className="px-6 py-4">
                                            {quest.min_level ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-surface-3 text-ink-2 border border-line-1">
                                                    Lvl {quest.min_level}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-ink-3">{quest.category || '-'}</td>
                                        <td className="px-6 py-4 text-ink-4 text-xs whitespace-nowrap">
                                            {quest.created_at
                                                ? new Date(quest.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                                : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => setSelectedQuest(quest)}
                                                    className="p-2 text-ink-4 hover:text-amber-500 hover:bg-amber-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                     title="View quest"
                                                >
                                                    <Eye className="w-5 h-5" />
                                                </button>
                                                <Link to={`/quests/${quest.id}`}>
                                                    <button className="p-2 text-ink-4 hover:text-accent-1 hover:bg-accent-3 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
                                                        <Edit02 className="w-5 h-5" />
                                                    </button>
                                                </Link>
                                                <button
                                                    onClick={() => handleDelete([quest.id])}
                                                    className="p-2 text-ink-4 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    title="Delete quest"
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
            
            {/* Pagination Placeholder */}
            <div className="mt-4 flex items-center justify-between text-sm text-ink-3 px-1">
                <div>Show: 20 per page</div>
                <div>1-{filteredQuests.length} de {filteredQuests.length}</div>
            </div>

            {/* Conflict Resolver Modal */}
            {conflictsQueue.length > 0 && (
                <ConflictResolver 
                    conflicts={conflictsQueue} 
                    onComplete={handleConflictsResolved}
                    onCancel={handleConflictsResolved}
                />
            )}

            {/* Quest Preview Modal */}
            <QuestWowModal quest={selectedQuest} onClose={() => setSelectedQuest(null)} />
        </div>
    );
}

