import type { APIRoute } from 'astro';
import { getSupabaseSSR } from '../../../utils/supabaseServer';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
    const supabase = getSupabaseSSR(cookies);
    
    // Generar la URL de OAuth de Supabase
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: new URL('/api/auth/callback', request.url).toString(),
        },
    });

    if (error) {
        console.error('Error iniciando sesion:', error);
        return redirect('/admin/login?error=oauth_failed');
    }

    // Redirigir a Google
    if (data.url) {
        return redirect(data.url);
    }

    return redirect('/admin/login');
};
