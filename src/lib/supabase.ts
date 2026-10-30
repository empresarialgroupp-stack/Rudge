// Conta Rudge: Supabase Auth do projeto "rudge", a mesma conta do Rudge Music.
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://btpbarqvsglqzpcpezvz.supabase.co';
/** Chave publicável (pode ficar no app; o acesso aos dados é controlado por RLS). */
export const SUPABASE_KEY = 'sb_publishable_dIg91iW6N6hpiZrE_ROmXA_trqjM6tV';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  // implicit: o link do e-mail volta com a sessão no endereço (#access_token=…), o que funciona
  // mesmo quando o link abre em outro navegador do aparelho
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'rudge:auth', detectSessionInUrl: true, flowType: 'implicit' },
});

/** Endereço do Rudge Music (app separado, mesma conta). */
export const RUDGE_MUSIC_URL = 'https://musicapple.vercel.app';
