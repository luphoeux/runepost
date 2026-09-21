import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Button } from './ui/Button';
import { RefreshCcw01, CoinsStacked01 } from '@untitledui/icons';
import { toast, Toaster } from 'sonner';

interface TokenPrice {
    id: number;
    region: 'NA' | 'EU';
    price: number;
    last_updated_timestamp: number;
    created_at: string;
}

export default function TokenAdmin() {
    const [pricesNA, setPricesNA] = useState<TokenPrice[]>([]);
    const [pricesEU, setPricesEU] = useState<TokenPrice[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchPrices = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('wow_token_prices')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (!error && data) {
            setPricesNA(data.filter(p => p.region === 'NA'));
            setPricesEU(data.filter(p => p.region === 'EU'));
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
        setRefreshing(true);
        const toastId = toast.loading(`Obteniendo precio de ${dbRegion}...`);
        
        try {
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

            toast.success(`Precio de ${dbRegion} actualizado correctamente`, { id: toastId });
            fetchPrices();
        } catch (error: any) {
            toast.error(`Error: ${error.message}`, { id: toastId });
        } finally {
            setRefreshing(false);
        }
    };

    const handleUpdateBoth = async () => {
        await handleUpdate('us', 'NA');
        await handleUpdate('eu', 'EU');
    };

    const renderTable = (prices: TokenPrice[], title: string, regionCode: 'us' | 'eu', dbRegion: 'NA' | 'EU') => (
        <div className="flex-1 bg-surface-1 border border-line-1 rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-line-1 flex items-center justify-between bg-surface-2">
                <div className="flex items-center gap-2">
                    <CoinsStacked01 className="w-5 h-5 text-amber-500" />
                    <h3 className="font-bold text-ink-1">Ficha WoW - {title}</h3>
                </div>
                <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleUpdate(regionCode, dbRegion)}
                    disabled={refreshing}
                >
                    <RefreshCcw01 className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                    Actualizar
                </Button>
            </div>
            
            <div className="overflow-y-auto max-h-[500px]">
                <table className="w-full text-sm text-left text-ink-2">
                    <thead className="text-xs text-ink-4 uppercase bg-surface-1 border-b border-line-1 sticky top-0">
                        <tr>
                            <th className="px-6 py-3">Fecha de Registro</th>
                            <th className="px-6 py-3 text-right">Precio (Oro)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line-1">
                        {loading ? (
                            <tr>
                                <td colSpan={2} className="px-6 py-8 text-center text-ink-3">Cargando...</td>
                            </tr>
                        ) : prices.length === 0 ? (
                            <tr>
                                <td colSpan={2} className="px-6 py-8 text-center text-ink-3">Sin registros</td>
                            </tr>
                        ) : (
                            prices.map(p => (
                                <tr key={p.id} className="hover:bg-surface-3 transition-colors">
                                    <td className="px-6 py-3 font-medium">
                                        {new Date(p.created_at).toLocaleString('es-AR')}
                                    </td>
                                    <td className="px-6 py-3 text-right font-bold text-amber-500">
                                        {formatGold(p.price)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <Toaster position="top-right" theme="light" />
            
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-ink-1">Historial de Ficha WoW</h2>
                    <p className="text-ink-3 mt-1">Monitoreo de precios de los tokens en oro para gráficas y analíticas.</p>
                </div>
                <Button className="bg-accent-1 text-white hover:bg-accent-2" onClick={handleUpdateBoth} disabled={refreshing}>
                    <RefreshCcw01 className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                    Actualizar Ambas Regiones
                </Button>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                {renderTable(pricesNA, 'Norteamérica (NA)', 'us', 'NA')}
                {renderTable(pricesEU, 'Europa (EU)', 'eu', 'EU')}
            </div>
        </div>
    );
}
