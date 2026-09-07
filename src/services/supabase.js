import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Check your .env file.'
  );
}

const authStorage = typeof window !== 'undefined' ? window.sessionStorage : undefined;

if (typeof window !== 'undefined') {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  window.localStorage.removeItem(`sb-${projectRef}-auth-token`);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
