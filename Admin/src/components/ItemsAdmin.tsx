import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Input } from './ui/Input';
import { SearchSm, Package } from '@untitledui/icons';

interface WoWItem {
    id: number;
    name: string;
    quality: { type: string, name: string };
    media: { id: number, url?: string };
    iconUrl?: string;
    description?: string;
    itemClass?: string;
    itemSubclass?: string;
    binding?: string;
    requiredLevel?: string;
}

export default function ItemsAdmin() {
    const [items, setItems] = useState<WoWItem[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchItems() {
            setLoading(true);
            const { data, error } = await supabase.from('items').select('*').order('id', { ascending: true });
            if (!error && data) {
                setItems(data);
            }
            setLoading(false);
        }
        fetchItems();
    }, []);

    const filteredItems = items.filter(item => 
        item.name.toLowerCase().includes(search.toLowerCase()) || 
        item.itemClass?.toLowerCase().includes(search.toLowerCase())
    );

    const getQualityColor = (type: string) => {
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
        <div className="max-w-6xl mx-auto">
            {/* Header / Table Toolbar */}
            <div className="bg-surface-1 border border-line-1 rounded-t-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                <div>
                    <h2 className="text-lg font-bold text-ink-1">Catálogo de Objetos</h2>
                    <p className="text-sm text-ink-3 mt-0.5">{loading ? 'Cargando...' : `${filteredItems.length} objetos encontrados`}</p>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-72">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <SearchSm className="h-4 w-4 text-ink-4" />
                        </div>
                        <Input 
                            type="text" 
                            placeholder="Buscar objeto..." 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 bg-surface-1 border-line-1 text-ink-1"
                        />
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-surface-1 border-x border-b border-line-1 rounded-b-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-ink-2">
                        <thead className="text-xs text-ink-4 uppercase bg-surface-2 border-b border-line-1 font-semibold">
                            <tr>
                                <th className="px-6 py-3">Objeto</th>
                                <th className="px-6 py-3">Calidad</th>
                                <th className="px-6 py-3">Clase</th>
                                <th className="px-6 py-3">Subclase</th>
                                <th className="px-6 py-3">Nivel Req.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line-1">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-ink-3">
                                        Cargando objetos...
                                    </td>
                                </tr>
                            ) : filteredItems.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-ink-3">
                                        No se encontraron objetos. Intenta importar misiones que tengan recompensas.
                                    </td>
                                </tr>
                            ) : (
                                filteredItems.map(item => (
                                    <tr key={item.id} className="hover:bg-surface-3 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-surface-3 border border-line-1 flex items-center justify-center shrink-0 overflow-hidden relative">
                                                    {item.iconUrl ? (
                                                        <img src={item.iconUrl} alt={item.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Package className="w-5 h-5 text-ink-3" />
                                                    )}
                                                    {/* Fake item border color based on quality could go here */}
                                                </div>
                                                <div>
                                                    <div className={`font-medium ${item.quality?.type ? getQualityColor(item.quality.type) : 'text-ink-1'}`}>
                                                        {item.name}
                                                    </div>
                                                    <div className="text-xs text-ink-4 font-mono mt-0.5">ID: {item.id}</div>
                                                </div>
                                            </div>
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
                <div>1-{filteredItems.length} de {filteredItems.length}</div>
            </div>
        </div>
    );
}
