import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { SearchSm, Package, Eye, Trash01, RefreshCcw01, Edit02 } from '@untitledui/icons';
import { toast, Toaster } from 'sonner';
import WowTooltip from './WowTooltip';
import { useUndoableDelete } from '../hooks/useUndoableDelete';

interface WoWItem {
    id: number;
    name: string;
    name_en?: string;
    quality: { type: string, name: string };
    media: { id: number, url?: string };
    iconUrl?: string;
    description?: string;
    itemClass?: string;
    itemSubclass?: string;
    binding?: string;
    requiredLevel?: string;
    sellPrice?: number;
    inventoryType?: string;
    armor?: number;
    stats?: { type: string; value: number; display?: string }[];
    weapon?: { minDamage?: number; maxDamage?: number; attackSpeedMs?: number; dps?: number; damageDisplay?: string; attackSpeedDisplay?: string; dpsDisplay?: string };
    durability?: number;
    uniqueEquipped?: string;
    spells?: { spellId?: number; spellName?: string; description: string }[];
    isStackable?: boolean;
    isEquippable?: boolean;
    containerSlots?: number;
    created_at?: string;
}

export default function ItemsAdmin() {
    const { refreshGlobalCounts, optimisticUpdateCount } = useOutletContext<{ refreshGlobalCounts: () => void, optimisticUpdateCount: (key: string, delta: number) => void }>();
    const [items, setItems] = useState<WoWItem[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [hoveredItem, setHoveredItem] = useState<WoWItem | null>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [activeTab, setActiveTab] = useState<'recognized' | 'unrecognized'>('recognized');
    const [isRetrying, setIsRetrying] = useState(false);

    // Paginación
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [totalCounts, setTotalCounts] = useState({ recognized: 0, unrecognized: 0 });
    const [currentTotal, setCurrentTotal] = useState(0);
    const [loadingMore, setLoadingMore] = useState(false);
    const ITEMS_PER_PAGE = 20;

    const fetchCounts = async () => {
        const { count: rec } = await supabase.from('items').select('id', { count: 'exact', head: true }).not('iconUrl', 'is', null);
        const { count: unrec } = await supabase.from('items').select('id', { count: 'exact', head: true }).is('iconUrl', null);
        setTotalCounts({ recognized: rec || 0, unrecognized: unrec || 0 });
    };

    useEffect(() => {
        fetchCounts();
    }, []);

    const fetchItems = async (isLoadMore = false) => {
        if (!isLoadMore) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }
        
        const currentPage = isLoadMore ? page + 1 : 1;
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE - 1;

        let query = supabase.from('items').select('*', { count: 'exact' });

        if (activeTab === 'recognized') {
            query = query.not('iconUrl', 'is', null);
        } else {
            query = query.is('iconUrl', null);
        }

        if (search) {
            query = query.or(`name.ilike.%${search}%,itemClass.ilike.%${search}%`);
        }

        const { data, error, count } = await query.order('id', { ascending: true }).range(start, end);

        if (!error && data) {
            if (isLoadMore) {
                setItems(prev => [...prev, ...data]);
                setPage(currentPage);
            } else {
                setItems(data);
                setPage(1);
            }
            if (count !== null) {
                setHasMore((start + data.length) < count);
                setCurrentTotal(count);
            } else {
                setHasMore(data.length === ITEMS_PER_PAGE);
            }
        }
        
        if (!isLoadMore) {
            setLoading(false);
        } else {
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchItems();
        }, 300);
        return () => clearTimeout(timer);
    }, [search, activeTab]);

    const { handleDelete } = useUndoableDelete<number>({
        onPerformDelete: async (ids) => {
            const { error } = await supabase.from('items').delete().in('id', ids);
            if (error) throw error;
            refreshGlobalCounts();
        },
        onOptimisticDelete: (ids) => {
            setItems(prev => prev.filter(i => !ids.includes(i.id)));
            setSelectedIds([]);
            optimisticUpdateCount('items', -ids.length);
        },
        onRestore: () => {
            fetchItems();
            fetchCounts();
            refreshGlobalCounts();
        },
        entityName: 'items'
    });

    const handleRetryAPI = async () => {
        // En lugar de usar el arreglo local de items, consultamos directamente la BD para obtener todos los no reconocidos
        setIsRetrying(true);
        try {
            const { data: unrecognized } = await supabase.from('items').select('id').is('iconUrl', null);
            if (!unrecognized || unrecognized.length === 0) {
                toast.info('No unrecognized items to retry.');
                return;
            }

            let updatedCount = 0;
            const updatedItems = [];
            
            toast.loading(`Querying ${unrecognized.length} items...`);
            
            for (const item of unrecognized) {
                const res = await fetch(`/api/blizzard/item?id=${item.id}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.item) {
                        const blizz = data.item;
                        updatedItems.push({
                            id: blizz.id,
                            name: blizz.name,
                            quality: blizz.quality,
                            media: blizz.media,
                            iconUrl: blizz.iconUrl,
                            description: blizz.description,
                            itemClass: blizz.itemClass,
                            itemSubclass: blizz.itemSubclass,
                            binding: blizz.binding,
                            requiredLevel: blizz.requiredLevel
                        });
                        updatedCount++;
                    }
                }
            }

            toast.dismiss();

            if (updatedItems.length > 0) {
                const { error } = await supabase.from('items').upsert(updatedItems, { onConflict: 'id' });
                if (error) throw error;
                await fetchItems();
                await fetchCounts();
                toast.success(`${updatedCount} items updated with API data.`);
            } else {
                toast.info('The Blizzard API does not have data for these items yet.');
            }
        } catch (err) {
            console.error('Error al reintentar API:', err);
            toast.error('Ocurrió un error al consultar la API.');
        } finally {
            setIsRetrying(false);
        }
    };

    const getQualityColor = (type?: string) => {
        if (!type) return 'text-ink-1';
        const t = type.toUpperCase();
        if (t === 'POOR') return 'text-gray-400';
        if (t === 'COMMON') return 'text-ink-1';
        if (t === 'UNCOMMON') return 'text-green-600';
        if (t === 'RARE') return 'text-blue-600';
        if (t === 'EPIC') return 'text-purple-600';
        if (t === 'LEGENDARY') return 'text-orange-500';
        if (t === 'ARTIFACT') return 'text-amber-200';
        if (t === 'HEIRLOOM') return 'text-yellow-200';
        return 'text-ink-1';
    };

    return (
        <div className="w-full px-1 pb-12">
            <Toaster position="top-right" theme="light" />
            
            {/* Header / Table Toolbar */}
            <div className="bg-surface-1 border border-line-1 rounded-t-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                <div>
                    <h2 className="text-lg font-bold text-ink-1">Item Catalog</h2>
                    <p className="text-sm text-ink-3 mt-0.5">{loading ? 'Loading...' : `${currentTotal} items found`}</p>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-72">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <SearchSm className="h-4 w-4 text-ink-4" />
                        </div>
                        <Input 
                            type="text" 
                            placeholder="Search item..." 
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
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-surface-1 border-x border-line-1 px-4 pt-2">
                <div className="flex items-center justify-between border-b border-line-1">
                    <div className="flex items-center gap-6">
                        <button 
                            onClick={() => setActiveTab('recognized')} 
                            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'recognized' ? 'border-accent-1 text-accent-1' : 'border-transparent text-ink-3 hover:text-ink-2'}`}
                        >
                            Recognized ({totalCounts.recognized})
                        </button>
                        <button 
                            onClick={() => setActiveTab('unrecognized')} 
                            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'unrecognized' ? 'border-amber-500 text-amber-500' : 'border-transparent text-ink-3 hover:text-ink-2'}`}
                        >
                            Unrecognized ({totalCounts.unrecognized})
                        </button>
                    </div>
                    {activeTab === 'unrecognized' && totalCounts.unrecognized > 0 && (
                        <div className="pb-2">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={handleRetryAPI}
                                disabled={isRetrying}
                                className="bg-surface-2"
                            >
                                <RefreshCcw01 className={`w-4 h-4 mr-2 ${isRetrying ? 'animate-spin' : ''}`} />
                                {isRetrying ? 'Querying...' : 'Re-query API'}
                            </Button>
                        </div>
                    )}
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
                                        checked={items.length > 0 && selectedIds.length === items.length}
                                        onChange={(e) => setSelectedIds(e.target.checked ? items.map(i => i.id) : [])}
                                    />
                                </th>
                                <th className="px-6 py-3">Item</th>
                                <th className="px-6 py-3 w-20">ID</th>
                                <th className="px-6 py-3">Quality</th>
                                <th className="px-6 py-3">Class</th>
                                <th className="px-6 py-3">Subclass</th>
                                <th className="px-6 py-3">Req. Level</th>
                                <th className="px-6 py-3">Captured</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line-1">
                            {loading ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center text-ink-3">
                                        Loading items...
                                    </td>
                                </tr>
                            ) : items.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center text-ink-3">
                                        No items found. Try importing quests that have rewards.
                                    </td>
                                </tr>
                            ) : (
                                items.map(item => (
                                    <tr 
                                        key={item.id} 
                                        className={`transition-colors group ${selectedIds.includes(item.id) ? 'bg-accent-3/30' : 'hover:bg-surface-3'}`}
                                    >
                                        <td className="px-6 py-4 text-center">
                                            <input 
                                                type="checkbox" 
                                                className="rounded border-line-1 text-accent-1 focus:ring-accent-1"
                                                checked={selectedIds.includes(item.id)}
                                                onChange={(e) => setSelectedIds(prev => e.target.checked ? [...prev, item.id] : prev.filter(id => id !== item.id))}
                                            />
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-surface-3 border border-line-1 flex items-center justify-center shrink-0 overflow-hidden relative">
                                                    {item.iconUrl ? (
                                                        <img src={item.iconUrl} alt={item.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Package className="w-5 h-5 text-ink-3" />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className={`font-medium ${item.quality?.type ? getQualityColor(item.quality.type) : 'text-ink-1'}`}>
                                                        {item.name}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td 
                                            className="px-6 py-4 text-ink-4 font-mono cursor-help"
                                            onMouseEnter={() => setHoveredItem(item)}
                                            onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
                                            onMouseLeave={() => setHoveredItem(null)}
                                        >
                                            {item.id}
                                        </td>
                                        <td className="px-6 py-4">
                                            {item.quality?.name ? (
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-surface-2 border border-line-1 ${getQualityColor(item.quality.type)}`}>
                                                    {item.quality.name}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-ink-3">{item.itemClass || '-'}</td>
                                        <td className="px-6 py-4 text-ink-3">{item.itemSubclass || '-'}</td>
                                        <td className="px-6 py-4 text-ink-3">{item.requiredLevel || '-'}</td>
                                        <td className="px-6 py-4 text-ink-4 text-xs whitespace-nowrap">
                                            {item.created_at
                                                ? new Date(item.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                                : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    className="p-2 text-ink-4 hover:text-brand hover:bg-brand/10 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    title="Ver objeto"
                                                >
                                                    <Eye className="w-5 h-5" />
                                                </button>
                                                <button
                                                    className="p-2 text-ink-4 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    title="Editar objeto"
                                                >
                                                    <Edit02 className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete([item.id])}
                                                    className="p-2 text-ink-4 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    title="Eliminar objeto"
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
            
            {/* Pagination */}
            {!loading && (
                <div className="mt-4 flex items-center justify-between text-sm text-ink-3 px-1">
                    <div>Showing {items.length} of {currentTotal} items</div>
                    {hasMore && (
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => fetchItems(true)} 
                            disabled={loadingMore}
                            className="bg-surface-1"
                        >
                            {loadingMore ? 'Loading...' : 'Load more items'}
                        </Button>
                    )}
                </div>
            )}

            {/* WoW Tooltip */}
            <WowTooltip item={hoveredItem} x={mousePos.x} y={mousePos.y} />
        </div>
    );
}
