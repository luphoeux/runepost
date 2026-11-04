import { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'sonner';
import { uploadQuestImage } from '../lib/questImageGenerator';

interface ConflictResolverProps {
    conflicts: { existing: any, imported: any }[];
    onComplete: () => void;
    onCancel: () => void;
}

export default function ConflictResolver({ conflicts, onComplete, onCancel }: ConflictResolverProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [saving, setSaving] = useState(false);

    const currentConflict = conflicts[currentIndex];
    
    // Si no hay mas conflictos, completamos
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
        const toastId = toast.loading('Generando imagen de mision...');
        try {
            const url = await uploadQuestImage(imported);
            if (url) imported.image_url = url;
            
            toast.loading('Reemplazando en base de datos...', { id: toastId });
            const { error } = await supabase.from('quests').upsert(imported, { onConflict: 'id' });
            if (error) throw new Error(error.message);
            
            toast.success(`Quest #${imported.id} updated.`, { id: toastId });
            
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
            title={`Resolve Duplicate Quest (ID: ${existing.id})`}
            maxWidth="4xl"
            footer={
                <>
                    <span className="text-sm text-ink-3 mr-auto font-medium">{progressText}</span>
                    <Button variant="outline" onClick={onCancel} disabled={saving}>
                        Cancel Remaining
                    </Button>
                    <Button variant="outline" onClick={handleSkip} disabled={saving} className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700">
                        Skip & Keep Current
                    </Button>
                    <Button onClick={handleReplace} disabled={saving} className="bg-accent-1 hover:bg-accent-2 text-white">
                        {saving ? 'Saving...' : 'Replace with New'}
                    </Button>
                </>
            }
        >
            <div className="grid grid-cols-2 gap-6">
                {/* Lado Izquierdo: Version Actual */}
                <div className="space-y-4">
                    <div className="px-3 py-1.5 bg-surface-2 border border-line-2 rounded-md inline-block text-xs font-bold text-ink-3 uppercase tracking-wider">
                        Current Version (Database)
                    </div>
                    
                    <div className="space-y-3 bg-surface-2 p-4 rounded-xl border border-line-1">
                        <div>
                            <span className="text-xs text-ink-4 uppercase font-bold">Title</span>
                            <div className={`mt-0.5 text-sm ${existing.title !== imported.title ? 'text-red-600 font-semibold bg-red-50 p-1 rounded -ml-1' : 'text-ink-1'}`}>
                                {existing.title || '-'}
                            </div>
                        </div>
                        
                        <div>
                            <span className="text-xs text-ink-4 uppercase font-bold">Min Level</span>
                            <div className={`mt-0.5 text-sm ${existing.min_level !== imported.min_level ? 'text-red-600 font-semibold bg-red-50 p-1 rounded -ml-1' : 'text-ink-1'}`}>
                                {existing.min_level || '-'}
                            </div>
                        </div>
                        
                        <div>
                            <span className="text-xs text-ink-4 uppercase font-bold">Objectives</span>
                            <div className={`mt-0.5 text-sm ${JSON.stringify(existing.objectives) !== JSON.stringify(imported.objectives) ? 'text-red-600 bg-red-50 p-1 rounded -ml-1' : 'text-ink-1'}`}>
                                {existing.objectives && existing.objectives.length > 0 
                                    ? <ul className="list-disc pl-4 space-y-1">{existing.objectives.map((o: string, i: number) => <li key={i}>{o}</li>)}</ul> 
                                    : '-'}
                            </div>
                        </div>

                        <div>
                            <span className="text-xs text-ink-4 uppercase font-bold">Description</span>
                            <div className={`mt-0.5 text-sm whitespace-pre-wrap ${existing.description !== imported.description ? 'text-red-600 bg-red-50 p-1 rounded -ml-1' : 'text-ink-1'}`}>
                                {existing.description || '-'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Lado Derecho: Version Importada */}
                <div className="space-y-4">
                    <div className="px-3 py-1.5 bg-accent-3 border border-accent-1/20 text-accent-700 rounded-md inline-block text-xs font-bold uppercase tracking-wider">
                        New Version (Imported)
                    </div>

                    <div className="space-y-3 bg-surface-1 p-4 rounded-xl border border-accent-1/30 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-1 bg-accent-1 bottom-0"></div>
                        
                        <div>
                            <span className="text-xs text-ink-4 uppercase font-bold">Title</span>
                            <div className={`mt-0.5 text-sm ${existing.title !== imported.title ? 'text-accent-700 font-semibold bg-accent-3 p-1 rounded -ml-1' : 'text-ink-1'}`}>
                                {imported.title || '-'}
                            </div>
                        </div>
                        
                        <div>
                            <span className="text-xs text-ink-4 uppercase font-bold">Min Level</span>
                            <div className={`mt-0.5 text-sm ${existing.min_level !== imported.min_level ? 'text-accent-700 font-semibold bg-accent-3 p-1 rounded -ml-1' : 'text-ink-1'}`}>
                                {imported.min_level || '-'}
                            </div>
                        </div>
                        
                        <div>
                            <span className="text-xs text-ink-4 uppercase font-bold">Objectives</span>
                            <div className={`mt-0.5 text-sm ${JSON.stringify(existing.objectives) !== JSON.stringify(imported.objectives) ? 'text-accent-700 bg-accent-3 p-1 rounded -ml-1' : 'text-ink-1'}`}>
                                {imported.objectives && imported.objectives.length > 0 
                                    ? <ul className="list-disc pl-4 space-y-1">{imported.objectives.map((o: string, i: number) => <li key={i}>{o}</li>)}</ul> 
                                    : '-'}
                            </div>
                        </div>

                        <div>
                            <span className="text-xs text-ink-4 uppercase font-bold">Description</span>
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

