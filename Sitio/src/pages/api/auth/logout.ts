import type { APIRoute } from 'astro';
import { getSupabaseSSR } from '../../../utils/supabaseServer';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
    const supabase = getSupabaseSSR(cookies);
    await supabase.auth.signOut();
    return redirect('/admin/login');
};
