import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";

const PADRAO = {
  name: "Atende.ai",
  short_name: "Atende.ai",
  description: "Suporte e atendimento multicanal multiempresa",
  start_url: "/dashboard",
  display: "standalone",
  background_color: "#0b1220",
  theme_color: "#1f6fe0",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  ],
};

const resposta = (m: unknown) =>
  new Response(JSON.stringify(m), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-cache" },
  });

/** Manifesto do app instalável com nome e ícone da empresa (só dados visuais públicos). */
export const Route = createFileRoute("/api/public/manifest")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async ({ request }) => {
        const s = (new URL(request.url).searchParams.get("s") ?? "").toLowerCase();
        if (!/^[a-z0-9-]{1,50}$/.test(s)) return resposta(PADRAO);
        try {
          const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
          const { data } = await (sb.rpc as any)("empresa_marca_publica", { p_slug: s });
          const m = Array.isArray(data) ? data[0] : data;
          if (!m) return resposta(PADRAO);
          const nome = String(m.titulo || m.nome || PADRAO.name);
          const icone = m.favicon || m.logo;
          const cor = /^#[0-9a-f]{6}$/i.test(m.cor_primaria_claro ?? "") ? m.cor_primaria_claro : PADRAO.theme_color;
          return resposta({
            ...PADRAO,
            id: `/?empresa=${s}`,
            name: nome,
            short_name: nome.slice(0, 24),
            start_url: `/dashboard?e=${s}`,
            theme_color: cor,
            icons: icone
              ? [
                  { src: `/api/public/icone?s=${s}`, sizes: "192x192", type: "image/png", purpose: "any" },
                  { src: `/api/public/icone?s=${s}`, sizes: "512x512", type: "image/png", purpose: "any" },
                  { src: `/api/public/icone?s=${s}`, sizes: "any", type: "image/png", purpose: "any" },
                ]
              : PADRAO.icons,
          });
        } catch {
          return resposta(PADRAO);
        }
      },
    },
  },
});
