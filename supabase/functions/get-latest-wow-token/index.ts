// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    // Manejar preflight request (CORS) para llamadas desde navegadores
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!; 
        
        const supabase = createClient(supabaseUrl, supabaseKey);

        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        const isoTwoDaysAgo = twoDaysAgo.toISOString();

        // Obtener todos los registros de los últimos 2 días, ordenados cronológicamente
        const { data, error } = await supabase
            .from('wow_token_prices')
            .select('price, created_at, region')
            .gte('created_at', isoTwoDaysAgo)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Agrupar por región para facilitar el uso en el cliente
        const naData = data.filter(d => d.region === 'NA').map(d => ({ price: d.price, updated_at: d.created_at }));
        const euData = data.filter(d => d.region === 'EU').map(d => ({ price: d.price, updated_at: d.created_at }));

        return new Response(
            JSON.stringify({
                success: true,
                data: {
                    NA: naData,
                    EU: euData
                }
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        return new Response(
            JSON.stringify({ success: false, error: err.message }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
    }
});
