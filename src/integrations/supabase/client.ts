import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://kvzxnubbdsbfqzcrrwmg.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_AJMNIa9nwgbaiTE2vIevXw_iprqvDu_";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
