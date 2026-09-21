import { useState, useEffect } from 'react';
import type { Quest } from '../types/quest-types';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { SearchSm, Edit02, Plus, BookOpen01, Upload01, Eye } from '@untitledui/icons';
import { supabase } from '../lib/supabaseClient';
import { Link } from 'react-router-dom';
import { importQuestsFromLua } from '../lib/addonParser';
import { toast, Toaster } from 'sonner';
import ConflictResolver from './ConflictResolver';
import QuestWowModal from './QuestWowModal';

export default function QuestsAdmin() {
    const [quests, setQuests] = useState<Quest[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);
    const [conflictsQueue, setConflictsQueue] = useState<{ existing: any, imported: any }[]>([]);
    const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);

    const fetchQuests = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('quests').select('*').order('id', { ascending: true });
        if (!error && data) {
            setQuests(data);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchQuests();
    }, []);

    const handleImportClick = async () => {
        setImporting(true);
        const toastId = toast.loading('Buscando misiones localmente...');
        
        try {
            const res = await fetch('/api/local-addon');
            
            // If running in production or API not found, fallback
            if (!res.ok) {
                throw new Error('La API local de Vite no está disponible. Asegurate de estar ejecutando "npm run dev".');
            }
            
            const data = await res.json();
            
            if (!data.success) {
                throw new Error(data.error);
            }

            const text = data.content;
            const result = await importQuestsFromLua(text, (msg) => {
                toast.loading(msg, { id: toastId });
            });

            // Upsert items
            let itemsSuccessMsg = '';
            if (result.newItems && result.newItems.length > 0) {
                toast.loading(`Guardando ${result.newItems.length} objetos en la base de datos...`, { id: toastId });
                const { error: itemsError } = await supabase.from('items').upsert(result.newItems, { onConflict: 'id' });
                if (itemsError) {
                    toast.error(`Error guardando objetos: ${itemsError.message}`);
                } else {
                    const sampleNames = result.newItems.map((i: any) => i.name).slice(0, 3).join(', ');
                    const more = result.newItems.length > 3 ? ` y ${result.newItems.length - 3} más` : '';
                    itemsSuccessMsg = `Objetos guardados: ${sampleNames}${more}. `;
                }
            }

            if (result.newQuests.length > 0) {
                const { error } = await supabase.from('quests').insert(result.newQuests);
                if (error) {
                    toast.error(`Error al insertar misiones: ${error.message}`, { id: toastId });
                } else {
                    toast.success(`${itemsSuccessMsg}Se insertaron ${result.newQuests.length} misiones nuevas.`, { id: toastId, duration: 6000 });
                }
            } else {
                if (itemsSuccessMsg) {
                    toast.success(itemsSuccessMsg, { id: toastId, duration: 6000 });
                } else {
                    toast.dismiss(toastId);
                }
            }

            if (result.conflicts.length > 0) {
                setConflictsQueue(result.conflicts);
            } else {
                fetchQuests();
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
        toast.success('Resolución de conflictos terminada.');
    };

    const filteredQuests = quests.filter(q => 
        q.title.toLowerCase().includes(search.toLowerCase()) || 
        q.category?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="max-w-6xl mx-auto">
            <Toaster position="top-right" theme="light" />
            {/* Header / Table Toolbar */}
            <div className="bg-surface-1 border border-line-1 rounded-t-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                <div>
                    <h2 className="text-lg font-bold text-ink-1">Misiones</h2>
                    <p className="text-sm text-ink-3 mt-0.5">{loading ? 'Cargando...' : `${filteredQuests.length} misiones encontradas`}</p>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-72">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <SearchSm className="h-4 w-4 text-ink-4" />
                        </div>
                        <Input 
                            type="text" 
                            placeholder="Buscar misión..." 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 bg-surface-1 border-line-1 text-ink-1"
                        />
                    </div>
                    <Button variant="outline" onClick={handleImportClick} disabled={importing} className="shrink-0 bg-surface-1 border-line-1 text-ink-2 hover:bg-surface-2">
                        <Upload01 className="w-4 h-4 mr-2" />
                        {importing ? 'Importando...' : 'Importar Addon (Local)'}
                    </Button>
                    <Button className="shrink-0 bg-accent-1 hover:bg-accent-2 text-white">
                        <Plus className="w-4 h-4 mr-2" />
                        Nueva Misión
                    </Button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-surface-1 border-x border-b border-line-1 rounded-b-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-ink-2">
                        <thead className="text-xs text-ink-4 uppercase bg-surface-2 border-b border-line-1 font-semibold">
                            <tr>
                                <th className="px-6 py-3">Nombre</th>
                                <th className="px-6 py-3">Nivel</th>
                                <th className="px-6 py-3">Categoría</th>
                                <th className="px-6 py-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line-1">
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-ink-3">
                                        Cargando misiones...
                                    </td>
                                </tr>
                            ) : filteredQuests.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-ink-3">
                                        No se encontraron misiones.
                                    </td>
                                </tr>
                            ) : (
                                filteredQuests.map(quest => (
                                    <tr key={quest.id} className="hover:bg-surface-3 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-surface-3 border border-line-1 flex items-center justify-center shrink-0">
                                                    <BookOpen01 className="w-4 h-4 text-ink-3" />
                                                </div>
                                                <div>
                                                    <div className="font-medium text-ink-1">{quest.title}</div>
                                                    <div className="text-xs text-ink-4 font-mono mt-0.5">ID: {quest.id}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {quest.min_level ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-surface-3 text-ink-2 border border-line-1">
                                                    Nvl {quest.min_level}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-ink-3">{quest.category || '-'}</td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => setSelectedQuest(quest)}
                                                    className="p-2 text-ink-4 hover:text-amber-500 hover:bg-amber-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    title="Ver misión"
                                                >
                                                    <Eye className="w-5 h-5" />
                                                </button>
                                                <Link to={`/quests/${quest.id}`}>
                                                    <button className="p-2 text-ink-4 hover:text-accent-1 hover:bg-accent-3 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
                                                        <Edit02 className="w-5 h-5" />
                                                    </button>
                                                </Link>
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
                <div>Mostrar: 20 por página</div>
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
