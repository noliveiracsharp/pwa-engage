import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { PNG } from "pngjs";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";

/** Centraliza a imagem num quadrado transparente e redimensiona (bilinear), pois o instalador do PWA só aceita ícones 1:1 no tamanho declarado. */
function quadrado(buf: Buffer, alvo: number): Buffer {
  const src = PNG.sync.read(buf);
  const lado = Math.max(src.width, src.height);
  const sq = new PNG({ width: lado, height: lado });
  const p = sq.data as unknown as number[];
  sq.data.fill(0);
  PNG.bitblt(src, sq, 0, 0, src.width, src.height, Math.floor((lado - src.width) / 2), Math.floor((lado - src.height) / 2));
  if (lado === alvo) return PNG.sync.write(sq);
  const dst = new PNG({ width: alvo, height: alvo });
  const r = (lado - 1) / (alvo - 1 || 1);
  for (let y = 0; y < alvo; y++) {
    const sy = y * r, y0 = Math.floor(sy), y1 = Math.min(y0 + 1, lado - 1), dy = sy - y0;
    for (let x = 0; x < alvo; x++) {
      const sx = x * r, x0 = Math.floor(sx), x1 = Math.min(x0 + 1, lado - 1), dx = sx - x0;
      const d = (y * alvo + x) * 4;
      const a = (y0 * lado + x0) * 4, b = (y0 * lado + x1) * 4, c = (y1 * lado + x0) * 4, e = (y1 * lado + x1) * 4;
      for (let k = 0; k < 4; k++) {
        const t = (p[a + k] ?? 0) * (1 - dx) + (p[b + k] ?? 0) * dx;
        const u = (p[c + k] ?? 0) * (1 - dx) + (p[e + k] ?? 0) * dx;
        dst.data[d + k] = Math.round(t * (1 - dy) + u * dy);
      }
    }
  }
  return PNG.sync.write(dst);
}

/** Entrega o ícone da empresa pela mesma origem, quadrado e no tamanho pedido (?dim=192|512). */
export const Route = createFileRoute("/api/public/icone")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const s = (url.searchParams.get("s") ?? "").toLowerCase();
        const dim = url.searchParams.get("dim") === "192" ? 192 : 512;
        const fallback = () => Response.redirect(new URL(`/icon-${dim}.png?v=2`, url.origin).toString(), 302);
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
          const bruto = Buffer.from(await r.arrayBuffer());
          let corpo: Buffer = bruto;
          let ct = tipo;
          try {
            corpo = quadrado(bruto, dim);
            ct = "image/png";
          } catch {
            // não-PNG (ex.: webp): entrega como veio
          }
          return new Response(new Uint8Array(corpo), {
            headers: { "Content-Type": ct, "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" },
          });
        } catch {
          return fallback();
        }
      },
    },
  },
});
