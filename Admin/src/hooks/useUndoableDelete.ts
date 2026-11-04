import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';

interface UseUndoableDeleteProps<T> {
    onPerformDelete: (ids: T[]) => Promise<void>;
    onOptimisticDelete: (ids: T[]) => void;
    onRestore: (ids: T[]) => void;
    entityName?: string;
    delayMs?: number;
}

export function useUndoableDelete<T extends string | number>({
    onPerformDelete,
    onOptimisticDelete,
    onRestore,
    entityName = 'registros',
    delayMs = 4000,
}: UseUndoableDeleteProps<T>) {
    const activeDeletions = useRef<Map<string, { ids: T[]; timerId: ReturnType<typeof setTimeout> }>>(new Map());

    const handleDelete = useCallback((idsToDelete: T[]) => {
        if (idsToDelete.length === 0) return;

        // 1. Optimistic delete
        onOptimisticDelete(idsToDelete);

        // 2. Setup deletion tracking
        const deletionId = Math.random().toString(36).substring(7);

        const commitDelete = async () => {
            activeDeletions.current.delete(deletionId);
            try {
                await onPerformDelete(idsToDelete);
                // Optionally show a silent success or nothing at all
            } catch (err: any) {
                toast.error(`Error al eliminar permanentemente: ${err.message}`);
                onRestore(idsToDelete); // Restore if actual DB deletion fails
            }
        };

        const timerId = setTimeout(commitDelete, delayMs);
        activeDeletions.current.set(deletionId, { ids: idsToDelete, timerId });

        // 3. Show undo toast
        const toastId = toast(`Eliminando ${idsToDelete.length} ${entityName}...`, {
            duration: delayMs,
            action: {
                label: 'Deshacer',
                onClick: () => undoDeletion(deletionId),
            },
        });

        const undoDeletion = (id: string) => {
            const deletion = activeDeletions.current.get(id);
            if (deletion) {
                clearTimeout(deletion.timerId);
                activeDeletions.current.delete(id);
                onRestore(deletion.ids);
                toast.dismiss(toastId);
                toast.success('Acción deshecha', { duration: 2000 });
            }
        };

        // Attach toastId to deletion so Ctrl+Z can dismiss it
        activeDeletions.current.get(deletionId)!.timerId = Object.assign(timerId, { toastId });
    }, [onPerformDelete, onOptimisticDelete, onRestore, entityName, delayMs]);

    // Listen for Ctrl+Z
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                // Find the most recent deletion
                const entries = Array.from(activeDeletions.current.entries());
                if (entries.length > 0) {
                    const [id, deletion] = entries[entries.length - 1];
                    clearTimeout(deletion.timerId);
                    activeDeletions.current.delete(id);
                    onRestore(deletion.ids);
                    
                    const toastId = (deletion.timerId as any).toastId;
                    if (toastId) toast.dismiss(toastId);
                    
                    toast.success('Acción deshecha', { duration: 2000 });
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onRestore]);

    return { handleDelete };
}
