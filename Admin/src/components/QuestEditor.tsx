import React, { useState } from 'react';
import { toast, Toaster } from 'sonner';
import { Button } from './ui/Button.tsx';
import { Input } from './ui/Input.tsx';
import { Label } from './ui/Label.tsx';
import { Textarea } from './ui/Textarea.tsx';
import { ArrowLeft, Upload01, Plus, Trash01, SearchSm, XClose } from '@untitledui/icons';
import type { Quest } from '../types/quest-types';
import { supabase } from '../lib/supabaseClient';
import { Link } from 'react-router-dom';

export default function QuestEditor({ initialQuest }: { initialQuest: Quest }) {
    const [quest, setQuest] = useState<Quest>(initialQuest);
    const [loading, setLoading] = useState(false);
    
    // States for item search
    const [itemSearch, setItemSearch] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [newItemQuantity, setNewItemQuantity] = useState(1);
    const [newItemChoice, setNewItemChoice] = useState(false);

    // Debounced search
    React.useEffect(() => {
        if (!itemSearch.trim()) {
            setSearchResults([]);
            return;
        }
        
        const delay = setTimeout(async () => {
            setIsSearching(true);
            const { data } = await supabase
                .from('items')
                .select('id, name, quality, iconUrl')
                .ilike('name', `%${itemSearch}%`)
                .limit(10);
                
            setSearchResults(data || []);
            setIsSearching(false);
        }, 300);
        
        return () => clearTimeout(delay);
    }, [itemSearch]);

    const handleAddItem = (item: any) => {
        const newReward = {
            item_id: item.id,
            name: item.name,
            quality: item.quality?.name || 'Común',
            quantity: newItemQuantity,
            choice: newItemChoice
        };
        
        setQuest(prev => {
            const rewards = prev.reward_items ? [...prev.reward_items] : [];
            // Verificar si ya existe (para no duplicar id exacto)
            const exists = rewards.find(r => r.item_id === item.id && r.choice === newItemChoice);
            if (exists) {
                exists.quantity += newItemQuantity;
                return { ...prev, reward_items: rewards };
            }
            return { ...prev, reward_items: [...rewards, newReward] };
        });
        
        setItemSearch('');
        setSearchResults([]);
        setNewItemQuantity(1);
    };

    const handleRemoveItem = (index: number) => {
        setQuest(prev => {
            if (!prev.reward_items) return prev;
            const newRewards = [...prev.reward_items];
            newRewards.splice(index, 1);
            return { ...prev, reward_items: newRewards.length > 0 ? newRewards : undefined };
        });
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        
        let parsedValue: any = value;
        if (name === 'objectives') {
            parsedValue = (value as string).split('\n').filter(Boolean);
        } else if (type === 'number') {
            parsedValue = value === '' ? null : Number(value);
        } else if (type === 'checkbox') {
            parsedValue = (e.target as HTMLInputElement).checked;
        }

        setQuest(prev => ({ ...prev, [name]: parsedValue }));
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const { error } = await supabase
                .from('quests')
                .update(quest)
                .eq('id', quest.id);

            if (error) throw new Error(error.message);
            
            toast.success('Misión actualizada exitosamente');
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto pb-12">
            <Toaster position="top-right" theme="light" />
            
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <Link to="/quests">
                        <Button variant="outline" size="icon" className="bg-surface-1 border-line-1 text-ink-2 hover:bg-surface-2">
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                    </Link>
                    <h2 className="text-2xl font-bold text-ink-1">Editar Misión: {quest.title}</h2>
                </div>
                <Button onClick={handleSave} disabled={loading} className="gap-2 bg-accent-1 hover:bg-accent-2 text-white">
                    <Upload01 className="w-4 h-4" />
                    {loading ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
            </div>

            <div className="bg-surface-1 rounded-xl p-6 space-y-6 shadow-sm border border-line-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label htmlFor="title" className="text-ink-2 font-medium">Nombre de la Misión</Label>
                        <Input id="title" name="title" value={quest.title || ''} onChange={handleChange} required className="bg-surface-2 border-line-1 text-ink-1 focus:border-accent-1 focus:ring-accent-3" />
                    </div>
                    
                    <div className="space-y-2">
                        <Label htmlFor="category" className="text-ink-2 font-medium">Categoría (Zona/Evento)</Label>
                        <Input id="category" name="category" value={quest.category || ''} onChange={handleChange} className="bg-surface-2 border-line-1 text-ink-1 focus:border-accent-1 focus:ring-accent-3" />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="min_level" className="text-ink-2 font-medium">Nivel Mínimo</Label>
                        <Input type="number" id="min_level" name="min_level" value={quest.min_level || ''} onChange={handleChange} className="bg-surface-2 border-line-1 text-ink-1 focus:border-accent-1 focus:ring-accent-3" />
                    </div>
                    
                    <div className="space-y-2">
                        <Label htmlFor="quest_type" className="text-ink-2 font-medium">Tipo de Misión</Label>
                        <Input id="quest_type" name="quest_type" value={quest.quest_type || ''} onChange={handleChange} className="bg-surface-2 border-line-1 text-ink-1 focus:border-accent-1 focus:ring-accent-3" />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="description" className="text-ink-2 font-medium">Descripción</Label>
                    <Textarea id="description" name="description" value={quest.description || ''} onChange={handleChange} rows={5} className="bg-surface-2 border-line-1 text-ink-1 focus:border-accent-1 focus:ring-accent-3" />
                </div>
                
                <div className="space-y-2">
                    <Label htmlFor="objectives" className="text-ink-2 font-medium">Objetivos (Un objetivo por línea)</Label>
                    <Textarea id="objectives" name="objectives" value={(quest.objectives || []).join('\n')} onChange={handleChange} rows={3} className="bg-surface-2 border-line-1 text-ink-1 focus:border-accent-1 focus:ring-accent-3" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 mt-6 border-t border-line-1">
                    <div className="space-y-2">
                        <Label htmlFor="chain_name" className="text-ink-2 font-medium">Nombre de Cadena</Label>
                        <Input id="chain_name" name="chain_name" value={quest.chain_name || ''} onChange={handleChange} className="bg-surface-2 border-line-1 text-ink-1 focus:border-accent-1 focus:ring-accent-3" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="time_estimate" className="text-ink-2 font-medium">Tiempo Estimado</Label>
                        <Input type="text" id="time_estimate" name="time_estimate" value={quest.time_estimate || ''} onChange={handleChange} className="bg-surface-2 border-line-1 text-ink-1 focus:border-accent-1 focus:ring-accent-3" />
                    </div>
                </div>

                <div className="pt-6 mt-6 border-t border-line-1 space-y-4">
                    <h3 className="text-lg font-bold text-ink-1">Recompensas (Objetos)</h3>
                    
                    {/* Lista actual */}
                    {quest.reward_items && quest.reward_items.length > 0 ? (
                        <div className="space-y-2">
                            {quest.reward_items.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-surface-2 rounded-lg border border-line-1">
                                    <div>
                                        <p className="font-medium text-ink-1">{item.name}</p>
                                        <p className="text-xs text-ink-3">
                                            ID: {item.item_id} | Cantidad: {item.quantity} | {item.choice ? 'Opcional (Elegir una)' : 'Garantizada'}
                                        </p>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(idx)} className="text-ink-4 hover:text-red-500 hover:bg-red-500/10 shrink-0">
                                        <Trash01 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-ink-3 italic">Esta misión no tiene objetos de recompensa.</p>
                    )}

                    {/* Buscador para añadir */}
                    <div className="bg-surface-2 p-4 rounded-xl border border-line-1 space-y-4 mt-4">
                        <Label className="text-ink-2 font-medium">Añadir Recompensa</Label>
                        
                        <div className="flex flex-wrap gap-4 items-end">
                            <div className="flex-1 min-w-[250px] relative">
                                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                    <SearchSm className="h-4 w-4 text-ink-4" />
                                </div>
                                <Input 
                                    type="text" 
                                    placeholder="Buscar objeto en la base de datos..." 
                                    value={itemSearch}
                                    onChange={(e) => setItemSearch(e.target.value)}
                                    className="pl-9 bg-surface-1"
                                />
                                {itemSearch && (
                                    <button onClick={() => setItemSearch('')} className="absolute inset-y-0 right-3 flex items-center text-ink-4 hover:text-ink-2">
                                        <XClose className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            
                            <div className="w-24">
                                <Label className="text-xs text-ink-3 mb-1 block">Cantidad</Label>
                                <Input 
                                    type="number" 
                                    min="1" 
                                    value={newItemQuantity}
                                    onChange={(e) => setNewItemQuantity(parseInt(e.target.value) || 1)}
                                    className="bg-surface-1"
                                />
                            </div>
                            
                            <div className="flex items-center gap-2 h-10 px-2">
                                <input 
                                    type="checkbox" 
                                    id="itemChoice"
                                    checked={newItemChoice}
                                    onChange={(e) => setNewItemChoice(e.target.checked)}
                                    className="rounded border-line-1 text-accent-1 focus:ring-accent-1"
                                />
                                <Label htmlFor="itemChoice" className="text-sm text-ink-2 cursor-pointer">Opcional</Label>
                            </div>
                        </div>

                        {/* Resultados */}
                        {itemSearch.trim() && (
                            <div className="mt-2 bg-surface-1 border border-line-1 rounded-lg overflow-hidden shadow-sm max-h-60 overflow-y-auto">
                                {isSearching ? (
                                    <div className="p-4 text-center text-sm text-ink-3">Buscando...</div>
                                ) : searchResults.length > 0 ? (
                                    <div className="divide-y divide-line-1">
                                        {searchResults.map(item => (
                                            <button 
                                                key={item.id}
                                                onClick={() => handleAddItem(item)}
                                                className="w-full text-left px-4 py-2 hover:bg-surface-3 transition-colors flex items-center justify-between group"
                                            >
                                                <div className="flex items-center gap-3">
                                                    {item.iconUrl ? (
                                                        <img src={item.iconUrl} alt="" className="w-6 h-6 rounded border border-line-1" />
                                                    ) : (
                                                        <div className="w-6 h-6 rounded border border-line-1 bg-surface-2 flex items-center justify-center text-[10px] text-ink-4">?</div>
                                                    )}
                                                    <span className="text-sm font-medium text-ink-1 group-hover:text-accent-1 transition-colors">{item.name}</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className="text-xs text-ink-4">ID: {item.id}</span>
                                                    <Plus className="w-4 h-4 text-ink-4 group-hover:text-accent-1 transition-colors" />
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-4 text-center text-sm text-ink-3">No se encontraron objetos</div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
