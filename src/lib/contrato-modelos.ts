import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ModelosContrato, SecaoContrato } from "@/lib/propostas";

const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => any };

/** Textos do contrato da Oferta personalizados pela empresa (vazio = padrão do sistema). */
export function useModelosContrato(empresaId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["contratos_modelos", empresaId ?? ""],
    enabled: enabled && !!empresaId,
    staleTime: 60_000,
    queryFn: async (): Promise<ModelosContrato> => {
      const { data, error } = await db.from("contratos_modelos").select("secao,conteudo").eq("empresa_id", empresaId);
      if (error) return {}; // tabela ainda não criada: usa o padrão
      const out: ModelosContrato = {};
      for (const r of (data ?? []) as Array<{ secao: SecaoContrato; conteudo: string | null }>) {
        if (r.conteudo?.trim()) out[r.secao] = r.conteudo;
      }
      return out;
    },
  });
}

export async function salvarModeloContrato(empresaId: string, secao: SecaoContrato, conteudo: string | null) {
  if (!conteudo?.trim()) {
    const { error } = await db.from("contratos_modelos").delete().eq("empresa_id", empresaId).eq("secao", secao);
    if (error) throw error;
    return;
  }
  const { error } = await db
    .from("contratos_modelos")
    .upsert({ empresa_id: empresaId, secao, conteudo, updated_at: new Date().toISOString() }, { onConflict: "empresa_id,secao" });
  if (error) throw error;
}

/** Link público da minuta: modelos via função segura pelo token. */
export async function modelosContratoPublico(token: string): Promise<ModelosContrato> {
  const { data, error } = await db.rpc("obter_contrato_modelos_publico", { _token: token });
  if (error || !data || typeof data !== "object") return {};
  return data as ModelosContrato;
}
