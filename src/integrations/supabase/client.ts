import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://kvzxnubbdsbfqzcrrwmg.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_AJMNIa9nwgbaiTE2vIevXw_iprqvDu_";

// Captura antes de o SDK consumir/remover os parâmetros de recuperação.
export const INITIAL_AUTH_URL = typeof window !== "undefined" ? window.location.href : "";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

/**
 * Ephemeral auth client that never persists or broadcasts a session.
 * Used to create auth users (signUp) without touching the current session.
 */
export function createEphemeralAuthClient() {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `atendeai-ephemeral-${crypto.randomUUID()}`,
      storage: undefined,
    },
  });
}
