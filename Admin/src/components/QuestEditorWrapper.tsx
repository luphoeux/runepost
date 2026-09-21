import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import type { Quest } from '../types/quest-types';
import QuestEditor from './QuestEditor';

export default function QuestEditorWrapper() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quest, setQuest] = useState<Quest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchQuest() {
      if (!id) return;
      
      const { data, error } = await supabase
        .from('quests')
        .select('*')
        .eq('id', id)
        .single();
        
      if (error || !data) {
        navigate('/quests');
      } else {
        setQuest(data);
      }
      setLoading(false);
    }
    
    fetchQuest();
  }, [id, navigate]);

  if (loading) return <div className="text-white text-center py-10">Cargando misión...</div>;
  if (!quest) return null;

  return <QuestEditor initialQuest={quest} />;
}
