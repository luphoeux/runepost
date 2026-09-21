import React, { useState } from 'react';
import { toast, Toaster } from 'sonner';
import { Button } from './ui/Button.tsx';
import { Input } from './ui/Input.tsx';
import { Label } from './ui/Label.tsx';
import { Textarea } from './ui/Textarea.tsx';
import { ArrowLeft, Upload01 } from '@untitledui/icons';
import type { Quest } from '../types/quest-types';
import { supabase } from '../lib/supabaseClient';
import { Link } from 'react-router-dom';

export default function QuestEditor({ initialQuest }: { initialQuest: Quest }) {
    const [quest, setQuest] = useState<Quest>(initialQuest);
    const [loading, setLoading] = useState(false);

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
            </div>
        </div>
    );
}
