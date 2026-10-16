import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";

/** Entrega o favicon da empresa pela mesma origem do app, para o instalador do PWA aceitar o ícone. */
export const Route = createFileRoute("/api/public/icone")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const s = (url.searchParams.get("s") ?? "").toLowerCase();
        const fallback = () => Response.redirect(new URL("/icon-512.png?v=2", url.origin).toString(), 302);
        if (!/^[a-z0-9-]{1,50}$/.test(s)) return fallback();
        try {
          const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
          const { data } = await (sb.rpc as any)("empresa_marca_publica", { p_slug: s });
          const m = Array.isArray(data) ? data[0] : data;
          const src = m?.favicon || m?.logo;
          if (!src || !/^https:\/\//.test(src)) return fallback();
          const r = await fetch(src);
          const tipo = r.headers.get("content-type") ?? "";
          if (!r.ok || !tipo.startsWith("image/")) return fallback();
          return new Response(await r.arrayBuffer(), {
            headers: { "Content-Type": tipo, "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" },
          });
        } catch {
          return fallback();
        }
      },
    },
  },
});
