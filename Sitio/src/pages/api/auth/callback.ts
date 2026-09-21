import type { APIRoute } from 'astro';
import { getSupabaseSSR } from '../../../utils/supabaseServer';

export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/admin';

  if (code) {
    const supabase = getSupabaseSSR(cookies);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirect(next);
    }
    console.error('Error in auth callback:', error.message);
  }

  // Si algo falla, volver al login
  return redirect('/admin/login?error=auth_failed');
};
