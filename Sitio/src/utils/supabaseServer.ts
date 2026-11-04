import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

export function getSupabaseSSR(cookies: AstroCookies, cookieHeader: string = '') {
    const url = (import.meta as any).env?.SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
    const key = (import.meta as any).env?.SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';

    return createServerClient(url, key, {
        cookies: {
            getAll() {
                return parseCookieHeader(cookieHeader).map(({ name, value }) => ({
                    name,
                    value: value ?? '',
                }));
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value, options }) => {
                    cookies.set(name, value, options);
                });
            },
        },
    });
}
