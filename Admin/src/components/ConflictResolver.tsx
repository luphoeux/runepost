import { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'sonner';

interface ConflictResolverProps {
    conflicts: { existing: any, imported: any }[];
    onComplete: () => void;
    onCancel: () => void;
}

export default function ConflictResolver({ conflicts, onComplete, onCancel }: ConflictResolverProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [saving, setSaving] = useState(false);

    const currentConflict = conflicts[currentIndex];
    
    // Si no hay más conflictos, completamos
    if (!currentConflict || currentIndex >= conflicts.length) {
        return null;
    }

    const { existing, imported } = currentConflict;
    const progressText = `Conflicto ${currentIndex + 1} de ${conflicts.length}`;

    const handleSkip = () => {
        if (currentIndex + 1 >= conflicts.length) {
            onComplete();
        } else {
            setCurrentIndex(prev => prev + 1);
        }
    };

    const handleReplace = async () => {
        setSaving(true);
        const toastId = toast.loading('Reemplazando...');
        try {
            const { error } = await supabase.from('quests').upsert(imported, { onConflict: 'id' });
            if (error) throw new Error(error.message);
            
            toast.success(`Misión #${imported.id} actualizada.`, { id: toastId });
            
            if (currentIndex + 1 >= conflicts.length) {
                onComplete();
            } else {
                setCurrentIndex(prev => prev + 1);
            }
        } catch (error: any) {
            toast.error(error.message, { id: toastId });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            isOpen={true}
            onClose={onCancel}
            title={`Resolver Misión Duplicada (ID: ${existing.id})`}
            maxWidth="4xl"
            footer={
                <>
                    <span className="text-sm text-ink-3 mr-auto font-medium">{progressText}</span>
                    <Button variant="outline" onClick={onCancel} disabled={saving}>
                        Cancelar Restantes
                    </Button>
                    <Button variant="outline" onClick={handleSkip} disabled={saving} className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700">
                        Omitir y Mantener Actual
                    </Button>
                    <Button onClick={handleReplace} disabled={saving} className="bg-accent-1 hover:bg-accent-2 text-white">
                        {saving ? 'Guardando...' : 'Reemplazar con Nueva'}
                    </Button>
                </>
            }
        >
            <div className="grid grid-cols-2 gap-6">
                {/* Lado Izquierdo: Versión Actual */}
                <div className="space-y-4">
                    <div className="px-3 py-1.5 bg-surface-2 border border-line-2 rounded-md inline-block text-xs font-bold text-ink-3 uppercase tracking-wider">
                        Versión Actual (Base de datos)
                    </div>
                    
                    <div className="space-y-3 bg-surface-2 p-4 rounded-xl border border-line-1">
                        <div>
                            <span className="text-xs text-ink-4 uppercase font-bold">Título</span>
                            <div className={`mt-0.5 text-sm ${existing.title !== imported.title ? 'text-red-600 font-semibold bg-red-50 p-1 rounded -ml-1' : 'text-ink-1'}`}>
                                {existing.title || '-'}
                            </div>
                        </div>
                        
                        <div>
                            <span className="text-xs text-ink-4 uppercase font-bold">Nivel Mínimo</span>
                            <div className={`mt-0.5 text-sm ${existing.min_level !== imported.min_level ? 'text-red-600 font-semibold bg-red-50 p-1 rounded -ml-1' : 'text-ink-1'}`}>
                                {existing.min_level || '-'}
                            </div>
                        </div>
                        
                        <div>
                            <span className="text-xs text-ink-4 uppercase font-bold">Objetivos</span>
                            <div className={`mt-0.5 text-sm ${JSON.stringify(existing.objectives) !== JSON.stringify(imported.objectives) ? 'text-red-600 bg-red-50 p-1 rounded -ml-1' : 'text-ink-1'}`}>
                                {existing.objectives && existing.objectives.length > 0 
                                    ? <ul className="list-disc pl-4 space-y-1">{existing.objectives.map((o: string, i: number) => <li key={i}>{o}</li>)}</ul> 
                                    : '-'}
                            </div>
                        </div>

                        <div>
                            <span className="text-xs text-ink-4 uppercase font-bold">Descripción</span>
                            <div className={`mt-0.5 text-sm whitespace-pre-wrap ${existing.description !== imported.description ? 'text-red-600 bg-red-50 p-1 rounded -ml-1' : 'text-ink-1'}`}>
                                {existing.description || '-'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Lado Derecho: Versión Importada */}
                <div className="space-y-4">
                    <div className="px-3 py-1.5 bg-accent-3 border border-accent-1/20 text-accent-700 rounded-md inline-block text-xs font-bold uppercase tracking-wider">
                        Versión Nueva (Importada)
                    </div>

                    <div className="space-y-3 bg-surface-1 p-4 rounded-xl border border-accent-1/30 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-1 bg-accent-1 bottom-0"></div>
                        
                        <div>
                            <span className="text-xs text-ink-4 uppercase font-bold">Título</span>
                            <div className={`mt-0.5 text-sm ${existing.title !== imported.title ? 'text-accent-700 font-semibold bg-accent-3 p-1 rounded -ml-1' : 'text-ink-1'}`}>
                                {imported.title || '-'}
                            </div>
                        </div>
                        
                        <div>
                            <span className="text-xs text-ink-4 uppercase font-bold">Nivel Mínimo</span>
                            <div className={`mt-0.5 text-sm ${existing.min_level !== imported.min_level ? 'text-accent-700 font-semibold bg-accent-3 p-1 rounded -ml-1' : 'text-ink-1'}`}>
                                {imported.min_level || '-'}
                            </div>
                        </div>
                        
                        <div>
                            <span className="text-xs text-ink-4 uppercase font-bold">Objetivos</span>
                            <div className={`mt-0.5 text-sm ${JSON.stringify(existing.objectives) !== JSON.stringify(imported.objectives) ? 'text-accent-700 bg-accent-3 p-1 rounded -ml-1' : 'text-ink-1'}`}>
                                {imported.objectives && imported.objectives.length > 0 
                                    ? <ul className="list-disc pl-4 space-y-1">{imported.objectives.map((o: string, i: number) => <li key={i}>{o}</li>)}</ul> 
                                    : '-'}
                            </div>
                        </div>

                        <div>
                            <span className="text-xs text-ink-4 uppercase font-bold">Descripción</span>
                            <div className={`mt-0.5 text-sm whitespace-pre-wrap ${existing.description !== imported.description ? 'text-accent-700 bg-accent-3 p-1 rounded -ml-1' : 'text-ink-1'}`}>
                                {imported.description || '-'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
