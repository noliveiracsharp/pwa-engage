import { createServerFn } from "@tanstack/react-start";
import { exigirLogin } from "@/lib/auth-guard";
import { z } from "zod";

import { lerComprovanteUrl, type LeituraComprovante } from "@/lib/comprovante-ocr.server";
export type { LeituraComprovante };

/** Lê cupom fiscal / recibo (imagem ou PDF por URL pública) e devolve os campos para pré-preencher a despesa. */
export const lerComprovante = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d) => z.object({ url: z.string().url().max(2000), pdf: z.boolean().optional(), token: z.string().max(5000).optional() }).parse(d))
  .handler(async ({ data }): Promise<LeituraComprovante> => {
    // 1º chave própria da empresa (Empresas → Inteligência Artificial); depois IA da plataforma.
    let ia: { origem?: string; provedor?: string; chave?: string; modelo?: string | null } | null = null;
    if (data.token) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/client");
        const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${data.token}` } },
        });
        const { data: auth } = await db.rpc("ia_autorizar" as never, { _recurso: "controller" } as never);
        ia = auth as unknown as typeof ia;
      } catch (e) { console.error("ia_autorizar comprovante", e); }
    }
    return lerComprovanteUrl(data.url, !!data.pdf, ia);
  });
