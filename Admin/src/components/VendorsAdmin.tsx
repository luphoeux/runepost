import { useEffect, useState, Fragment } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { SearchSm, ShoppingBag01, Eye, Edit02, Trash01, ChevronDown, ChevronRight } from '@untitledui/icons';
import { useUndoableDelete } from '../hooks/useUndoableDelete';

function GoldCoin() {
    return <img src="https://wow.zamimg.com/images/icons/money-gold.gif" alt="Oro" style={{ display: 'inline-block', width: '13px', height: '13px', verticalAlign: 'middle', marginLeft: '2px', marginRight: '4px' }} />;
}
function SilverCoin() {
    return <img src="https://wow.zamimg.com/images/icons/money-silver.gif" alt="Plata" style={{ display: 'inline-block', width: '13px', height: '13px', verticalAlign: 'middle', marginLeft: '2px', marginRight: '4px' }} />;
}
function CopperCoin() {
    return <img src="https://wow.zamimg.com/images/icons/money-copper.gif" alt="Cobre" style={{ display: 'inline-block', width: '13px', height: '13px', verticalAlign: 'middle', marginLeft: '2px' }} />;
}

export default function VendorsAdmin() {
    const { refreshGlobalCounts, optimisticUpdateCount } = useOutletContext<{ refreshGlobalCounts: () => void, optimisticUpdateCount: (key: string, delta: number) => void }>();
    const [vendors, setVendors] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [expanded, setExpanded] = useState<number[]>([]);

    useEffect(() => {
        fetchVendors();
    }, []);

    const fetchVendors = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('npc_vendors')
                .select(`
                    npc_id,
                    item_id,
                    price,
                    quantity_sold,
                    stock,
                    extended_cost,
                    npcs ( name ),
                    items ( id, name, iconUrl, quality, buy_price )
                `);

            if (error) throw error;
            
            // Agrupar por npc_id
            const grouped = new Map<number, any>();
            (data || []).forEach(row => {
                if (!grouped.has(row.npc_id)) {
                    grouped.set(row.npc_id, {
                        npc_id: row.npc_id,
                        npc_name: (Array.isArray(row.npcs) ? row.npcs[0]?.name : (row.npcs as any)?.name) || `ID: ${row.npc_id}`,
                        items_sold: []
                    });
                }
                grouped.get(row.npc_id).items_sold.push(row);
            });
            
            setVendors(Array.from(grouped.values()));
        } catch (err: any) {
            console.error('Error fetching vendors:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const { handleDelete } = useUndoableDelete<number>({
        onPerformDelete: async (ids) => {
            const { error } = await supabase.from('npc_vendors').delete().in('npc_id', ids);
            if (error) throw error;
            refreshGlobalCounts();
        },
        onOptimisticDelete: (ids) => {
            setVendors(prev => prev.filter(v => !ids.includes(v.npc_id)));
            optimisticUpdateCount('vendors', -ids.length);
        },
        onRestore: () => {
            fetchVendors();
            refreshGlobalCounts();
        },
        entityName: 'vendors'
    });

    const filteredVendors = vendors.filter(v => 
        v.npc_name.toLowerCase().includes(search.toLowerCase()) || 
        v.items_sold.some((item: any) => item.items?.name?.toLowerCase().includes(search.toLowerCase()))
    );

    const toggleExpand = (npcId: number) => {
        setExpanded(prev => prev.includes(npcId) ? prev.filter(id => id !== npcId) : [...prev, npcId]);
    };

    return (
        <div className="bg-surface-1 rounded-xl shadow-sm border border-line-1 flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-line-1 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-ink-1">Vendors</h2>
                    <p className="text-ink-3 text-sm mt-1">{filteredVendors.length} vendors found</p>
                </div>
                
                <div className="relative">
                    <SearchSm className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" size={20} />
                    <input
                        type="text"
                        placeholder="Search by NPC or Item..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-10 pr-4 py-2 bg-surface-2 border border-line-2 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand w-full md:w-64 text-ink-1"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-surface-2 sticky top-0 z-10">
                        <tr>
                            <th className="px-4 py-3 w-10"></th>
                            <th className="px-6 py-3 font-semibold text-ink-3">VENDOR (NPC)</th>
                            <th className="px-6 py-3 font-semibold text-ink-3">ITEMS FOR SALE</th>
                            <th className="px-6 py-3 font-semibold text-ink-3 text-right">ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line-1">
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-ink-3">
                                    Loading data...
                                </td>
                            </tr>
                        ) : filteredVendors.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center">
                                    <ShoppingBag01 className="mx-auto text-ink-3 mb-3" size={32} />
                                    <p className="text-ink-2 font-medium">No data found.</p>
                                    <p className="text-ink-3 text-sm mt-1">Open the game and visit vendors to populate the database.</p>
                                </td>
                            </tr>
                        ) : (
                            filteredVendors.map((v) => (
                                <Fragment key={v.npc_id}>
                                    <tr 
                                        className="hover:bg-surface-2/50 transition-colors cursor-pointer group"
                                        onClick={() => toggleExpand(v.npc_id)}
                                    >
                                        <td className="px-4 py-3 text-center">
                                            {expanded.includes(v.npc_id) ? (
                                                <ChevronDown className="w-5 h-5 text-ink-3 mx-auto" />
                                            ) : (
                                                <ChevronRight className="w-5 h-5 text-ink-3 mx-auto" />
                                            )}
                                        </td>
                                        <td className="px-6 py-3 font-medium text-ink-1">
                                            {v.npc_name}
                                        </td>
                                        <td className="px-6 py-3 text-ink-3">
                                            {v.items_sold.length} item{v.items_sold.length !== 1 && 's'}
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); /* action */ }}
                                                    className="p-2 text-ink-4 hover:text-brand hover:bg-brand/10 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    title="Ver NPC"
                                                >
                                                    <Eye className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); /* action */ }}
                                                    className="p-2 text-ink-4 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    title="Editar NPC"
                                                >
                                                    <Edit02 className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDelete([v.npc_id]); }}
                                                    className="p-2 text-ink-4 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    title="Eliminar NPC"
                                                >
                                                    <Trash01 className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    {expanded.includes(v.npc_id) && (
                                        <tr>
                                            <td colSpan={4} className="p-0 bg-surface-2/30 border-b border-line-1">
                                                <div className="pl-14 pr-6 py-4">
                                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                                        <thead className="text-xs text-ink-3 uppercase border-b border-line-2">
                                                            <tr>
                                                                <th className="pb-2 font-medium">ITEM</th>
                                                                <th className="pb-2 font-medium">PRICE / COST</th>
                                                                <th className="pb-2 font-medium">STOCK</th>
                                                                <th className="pb-2 font-medium text-right">ACTIONS</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-line-2">
                                                            {v.items_sold.map((item: any, idx: number) => (
                                                                <tr key={idx} className="hover:bg-surface-1/50 transition-colors group/item">
                                                                    <td className="py-2">
                                                                        <div className="flex items-center gap-2">
                                                                            {item.items?.iconUrl && (
                                                                                <img src={item.items.iconUrl} alt="Icon" className="w-6 h-6 rounded border border-line-2" />
                                                                            )}
                                                                            <span className="font-medium text-ink-2">
                                                                                {item.items?.name || `ID: ${item.item_id}`}
                                                                            </span>
                                                                            <span className="text-xs text-ink-3 bg-surface-3 px-1.5 py-0.5 rounded ml-2">
                                                                                x{item.quantity_sold || 1}
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="py-2 text-ink-2">
                                                                        {(() => {
                                                                            const p = item.price || (item.items && item.items.buy_price);
                                                                            if (p) {
                                                                                return (
                                                                                    <span className="flex items-center">
                                                                                        {p >= 10000 && <><span className="text-yellow-500 font-medium">{Math.floor(p / 10000)}</span><GoldCoin /></>}
                                                                                        {(p % 10000) >= 100 && <><span className="text-gray-400 font-medium">{Math.floor((p % 10000) / 100)}</span><SilverCoin /></>}
                                                                                        {(p % 100) > 0 && <><span className="text-[#c87533] font-medium">{(p % 100)}</span><CopperCoin /></>}
                                                                                    </span>
                                                                                );
                                                                            } else if (item.extended_cost) {
                                                                                return <span>Alternate Currency (Cost: {item.extended_cost})</span>;
                                                                            } else {
                                                                                return <span className="text-ink-3">Free</span>;
                                                                            }
                                                                        })()}
                                                                    </td>
                                                                    <td className="py-2 text-ink-3">
                                                                        {item.stock ? item.stock : 'Unlimited'}
                                                                    </td>
                                                                    <td className="py-2 text-right">
                                                                        <div className="flex items-center justify-end gap-1">
                                                                            <button
                                                                                className="p-1.5 text-ink-4 hover:text-brand hover:bg-brand/10 rounded-md transition-colors opacity-0 group-hover/item:opacity-100 focus:opacity-100"
                                                                                title="Ver objeto"
                                                                            >
                                                                                <Eye className="w-4 h-4" />
                                                                            </button>
                                                                            <button
                                                                                className="p-1.5 text-ink-4 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover/item:opacity-100 focus:opacity-100"
                                                                                title="Eliminar objeto del vendedor"
                                                                            >
                                                                                <Trash01 className="w-4 h-4" />
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
