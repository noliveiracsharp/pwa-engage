import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";

// Pixel de leitura dos avisos por e-mail. Só grava a primeira abertura; nunca devolve dados.
const GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/aviso-lido/$id")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = String(params.id).replace(/\.gif$/i, "");
        if (UUID.test(id)) {
          try {
            const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } });
            await sb.rpc("cond_aviso_registrar_leitura" as never, { p_envio: id, p_canal: "email" } as never);
          } catch { /* pixel nunca falha para o leitor */ }
        }
        return new Response(GIF, { headers: { "content-type": "image/gif", "cache-control": "no-store, max-age=0" } });
      },
    },
  },
});
