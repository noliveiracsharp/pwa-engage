import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

/** Envia o token da sessão do navegador e valida no servidor: sem login válido, a função recusa (401). */
export const exigirLogin = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  })
  .server(async ({ next }) => {
    const auth = getRequestHeader("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) throw new Response("Unauthorized", { status: 401 });
    const { createClient } = await import("@supabase/supabase-js");
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/client");
    const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) throw new Response("Unauthorized", { status: 401 });
    return next({ context: { userId: data.user.id } });
  });
