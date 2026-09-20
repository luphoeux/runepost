import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

export function getSupabaseSSR(cookies: AstroCookies) {
    const url = (import.meta as any).env?.SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
    const key = (import.meta as any).env?.SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';

    return createServerClient(url, key, {
        cookies: {
            get(key: string) {
                return cookies.get(key)?.value;
            },
            set(key: string, value: string, options: CookieOptions) {
                cookies.set(key, value, options);
            },
            remove(key: string, options: CookieOptions) {
                cookies.delete(key, options);
            },
        },
    });
}
