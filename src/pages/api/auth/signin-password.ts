import type { APIRoute } from 'astro';
import { getSupabaseSSR } from '../../../utils/supabaseServer.ts';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
    const text = await request.text();
    console.log('[DEBUG LOGIN] Body raw:', text);
    
    const params = new URLSearchParams(text);
    const email = params.get('email')?.toString().trim();
    const password = params.get('password')?.toString();

    console.log('[DEBUG LOGIN] parsed email:', email, 'password length:', password?.length);

    if (!email || !password) {
        console.log('[DEBUG LOGIN] Faltan campos');
        return new Response(null, { status: 302, headers: { Location: '/admin/login?error=invalid_credentials' } });
    }

    const supabase = getSupabaseSSR(cookies);
    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        console.error('[DEBUG LOGIN] Error de Supabase:', error.message);
        return new Response(null, { status: 302, headers: { Location: `/admin/login?error=invalid_credentials&msg=${encodeURIComponent(error.message)}` } });
    }

    console.log('[DEBUG LOGIN] Login exitoso para:', email);
    return new Response(null, { status: 302, headers: { Location: '/admin/quests' } });
};
