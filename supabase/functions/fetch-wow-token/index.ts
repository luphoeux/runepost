// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

Deno.serve(async (req) => {
    // Verificar que solo se acepte POST
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const clientId = Deno.env.get('BLIZZARD_CLIENT_ID')!;
        const clientSecret = Deno.env.get('BLIZZARD_CLIENT_SECRET')!;

        if (!supabaseUrl || !supabaseKey || !clientId || !clientSecret) {
            throw new Error("Missing environment variables");
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Obtener Token de Blizzard
        const credentials = btoa(`${clientId}:${clientSecret}`);
        const tokenRes = await fetch('https://oauth.battle.net/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'grant_type=client_credentials',
        });
        
        if (!tokenRes.ok) throw new Error('Failed to get Blizzard token');
        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;

        const results = [];

        // 2. Consultar Token de NA y EU
        for (const region of ['us', 'eu']) {
            const dbRegion = region === 'us' ? 'NA' : 'EU';
            const namespace = `dynamic-${region}`;
            const res = await fetch(`https://${region}.api.blizzard.com/data/wow/token/index?namespace=${namespace}&locale=en_US`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (res.ok) {
                const data = await res.json();
                
                // 3. Guardar en Supabase
                const { error } = await supabase.from('wow_token_prices').insert({
                    region: dbRegion,
                    price: data.price,
                    last_updated_timestamp: data.last_updated_timestamp
                });
                
                if (error) {
                    console.error(`DB Error (${dbRegion}):`, error.message);
                    results.push({ region: dbRegion, status: 'error', error: error.message });
                } else {
                    results.push({ region: dbRegion, status: 'success', price: data.price });
                }
            } else {
                console.error(`API Error (${region}):`, res.statusText);
                results.push({ region: dbRegion, status: 'api_error' });
            }
        }

        return new Response(
            JSON.stringify({ success: true, results }),
            { headers: { "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        return new Response(
            JSON.stringify({ success: false, error: err.message }),
            { headers: { "Content-Type": "application/json" }, status: 500 }
        );
    }
});
