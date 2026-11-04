import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Button } from './ui/Button';
import { RefreshCcw01, CoinsStacked01, Trash01, Eye, Edit02 } from '@untitledui/icons';
import { toast, Toaster } from 'sonner';
import { useUndoableDelete } from '../hooks/useUndoableDelete';

interface TokenPrice {
    id: number;
    region: 'NA' | 'EU';
    price: number;
    last_updated_timestamp: number;
    created_at: string;
}

interface GroupedPrice {
    timeGroup: string;
    dateObj: Date;
    naPrice?: TokenPrice;
    euPrice?: TokenPrice;
}

export default function TokenAdmin() {
    const [prices, setPrices] = useState<TokenPrice[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

    const groupedPrices = useMemo(() => {
        const groups: { [key: string]: GroupedPrice } = {};
        
        // Ordenar por fecha para que el grouping sea consecuente
        const sorted = [...prices].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        sorted.forEach(p => {
            const d = new Date(p.created_at);
            // Agrupar por minuto (para unir NA y EU creados en el mismo cron job)
            const timeGroup = d.toISOString().substring(0, 16); 
            
            if (!groups[timeGroup]) {
                groups[timeGroup] = { timeGroup, dateObj: d };
            }
            if (p.region === 'NA') groups[timeGroup].naPrice = p;
            if (p.region === 'EU') groups[timeGroup].euPrice = p;
        });

        return Object.values(groups).sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
    }, [prices]);

    const { handleDelete } = useUndoableDelete<number>({
        onPerformDelete: async (ids) => {
            const { error } = await supabase.from('wow_token_prices').delete().in('id', ids);
            if (error) throw error;
        },
        onOptimisticDelete: (ids) => {
            setPrices(prev => prev.filter(p => !ids.includes(p.id)));
            setSelectedGroups([]);
        },
        onRestore: () => {
            fetchPrices();
        },
        entityName: 'token records'
    });

    const fetchPrices = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('wow_token_prices')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);

        if (!error && data) {
            setPrices(data);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchPrices();
    }, []);

    const formatGold = (copper: number) => {
        const gold = Math.floor(copper / 10000);
        return new Intl.NumberFormat('es-AR').format(gold) + 'g';
    };

    const handleUpdate = async (regionCode: 'us' | 'eu', dbRegion: 'NA' | 'EU') => {
        const res = await fetch(`/api/blizzard/token?region=${regionCode}`);
        if (!res.ok) throw new Error('API local no disponible');
        
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        // Guardar en Supabase
        const { error } = await supabase.from('wow_token_prices').insert({
            region: dbRegion,
            price: data.data.price,
            last_updated_timestamp: data.data.last_updated_timestamp
        });

        if (error) throw error;
    };

    const handleUpdateBoth = async () => {
        setRefreshing(true);
        const toastId = toast.loading(`Fetching prices from Blizzard...`);
        try {
            await handleUpdate('us', 'NA');
            await handleUpdate('eu', 'EU');
            toast.success(`Prices updated successfully`, { id: toastId });
            fetchPrices();
        } catch (error: any) {
            toast.error(`Error: ${error.message}`, { id: toastId });
        } finally {
            setRefreshing(false);
        }
    };

    const handleDeleteGroups = (groups: string[]) => {
        const idsToDelete: number[] = [];
        groups.forEach(g => {
            const match = groupedPrices.find(gp => gp.timeGroup === g);
            if (match) {
                if (match.naPrice) idsToDelete.push(match.naPrice.id);
                if (match.euPrice) idsToDelete.push(match.euPrice.id);
            }
        });
        if (idsToDelete.length > 0) {
            handleDelete(idsToDelete);
        }
    };

    const latestNA = prices.find(p => p.region === 'NA');
    const latestEU = prices.find(p => p.region === 'EU');

    return (
        <div className="w-full space-y-8 pb-12 px-1">
            <Toaster position="top-right" theme="light" />
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-ink-1">WoW Token History</h2>
                    <p className="text-ink-3 mt-1">Token gold price monitoring for charts and analytics.</p>
                </div>
                <Button className="bg-accent-1 text-white hover:bg-accent-2 shrink-0" onClick={handleUpdateBoth} disabled={refreshing}>
                    <RefreshCcw01 className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                    Update Both Regions
                </Button>
            </div>

            {/* Tarjetas Generales */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-surface-1 border border-line-1 rounded-xl p-6 flex flex-col gap-2 shadow-sm">
                    <div className="flex items-center gap-2 text-ink-3">
                        <CoinsStacked01 className="w-5 h-5 text-ink-2" />
                        <h3 className="font-medium text-sm">Current Price - North America (NA)</h3>
                    </div>
                    <div className="text-3xl font-bold text-ink-1">
                        {latestNA ? formatGold(latestNA.price) : '---'}
                    </div>
                    <div className="text-xs text-ink-4">
                        Updated: {latestNA ? new Date(latestNA.created_at).toLocaleString('en-US') : '-'}
                    </div>
                </div>
                
                <div className="bg-surface-1 border border-line-1 rounded-xl p-6 flex flex-col gap-2 shadow-sm">
                    <div className="flex items-center gap-2 text-ink-3">
                        <CoinsStacked01 className="w-5 h-5 text-ink-2" />
                        <h3 className="font-medium text-sm">Current Price - Europe (EU)</h3>
                    </div>
                    <div className="text-3xl font-bold text-ink-1">
                        {latestEU ? formatGold(latestEU.price) : '---'}
                    </div>
                    <div className="text-xs text-ink-4">
                        Updated: {latestEU ? new Date(latestEU.created_at).toLocaleString('en-US') : '-'}
                    </div>
                </div>
            </div>

            {/* Tabla Combinada */}
            <div className="bg-surface-1 border border-line-1 rounded-xl shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 border-b border-line-1 flex items-center justify-between bg-surface-2">
                    <div className="flex items-center gap-2">
                        <h3 className="font-bold text-ink-1">Record History</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedGroups.length > 0 && (
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleDeleteGroups(selectedGroups)} 
                                className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                            >
                                <Trash01 className="w-4 h-4 mr-2" />
                                Eliminar ({selectedGroups.length})
                            </Button>
                        )}
                    </div>
                </div>
                
                <div className="overflow-y-auto max-h-[600px]">
                    <table className="w-full text-sm text-left text-ink-2">
                        <thead className="text-xs text-ink-4 uppercase bg-surface-1 border-b border-line-1 sticky top-0">
                            <tr>
                                <th className="px-6 py-3 w-12 text-center">
                                    <input 
                                        type="checkbox" 
                                        className="rounded border-line-1 text-accent-1 focus:ring-accent-1"
                                        checked={groupedPrices.length > 0 && selectedGroups.length === groupedPrices.length}
                                        onChange={(e) => setSelectedGroups(e.target.checked ? groupedPrices.map(g => g.timeGroup) : [])}
                                    />
                                </th>
                                <th className="px-6 py-3">Record Date</th>
                                <th className="px-6 py-3 text-right">North America (NA)</th>
                                <th className="px-6 py-3 text-right">Europe (EU)</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line-1">
                            {loading ? (
                                <tr><td colSpan={5} className="px-6 py-8 text-center text-ink-3">Loading...</td></tr>
                            ) : groupedPrices.length === 0 ? (
                                <tr><td colSpan={5} className="px-6 py-8 text-center text-ink-3">No records</td></tr>
                            ) : (
                                groupedPrices.map(g => (
                                    <tr key={g.timeGroup} className={`transition-colors group ${selectedGroups.includes(g.timeGroup) ? 'bg-accent-3/30' : 'hover:bg-surface-3'}`}>
                                        <td className="px-6 py-3 text-center">
                                            <input 
                                                type="checkbox" 
                                                className="rounded border-line-1 text-accent-1 focus:ring-accent-1"
                                                checked={selectedGroups.includes(g.timeGroup)}
                                                onChange={(e) => setSelectedGroups(prev => e.target.checked ? [...prev, g.timeGroup] : prev.filter(id => id !== g.timeGroup))}
                                            />
                                        </td>
                                        <td className="px-6 py-3 font-medium">
                                            {g.dateObj.toLocaleString('en-US')}
                                        </td>
                                        <td className="px-6 py-3 text-right font-bold text-ink-1">
                                            {g.naPrice ? formatGold(g.naPrice.price) : '-'}
                                        </td>
                                        <td className="px-6 py-3 text-right font-bold text-ink-1">
                                            {g.euPrice ? formatGold(g.euPrice.price) : '-'}
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    className="p-2 text-ink-4 hover:text-brand hover:bg-brand/10 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    title="Ver registro"
                                                >
                                                    <Eye className="w-5 h-5" />
                                                </button>
                                                <button
                                                    className="p-2 text-ink-4 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    title="Editar registro"
                                                >
                                                    <Edit02 className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteGroups([g.timeGroup])}
                                                    className="p-2 text-ink-4 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    title="Eliminar registro"
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
