import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Row } from "@/lib/row";
import { parametrosItens, type FiltrosItens } from "@/lib/itens-pesquisa";

type ResultadoItens = { rows: Row[]; total: number };

export async function consultarItens(empresaId: string | null, filtros: FiltrosItens, pagina: number, tamanho: number, ordem: string, direcao: string, signal?: AbortSignal): Promise<ResultadoItens> {
  let query = supabase.rpc("fn_itens_lista" as never, { ...parametrosItens(filtros, pagina, tamanho, ordem, direcao), p_empresa_id: empresaId } as never);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw new Error(error.message.includes("fn_itens_lista") ? "Execute o script de Produtos e Serviços no banco para habilitar esta pesquisa." : error.message);
  const resultado = data as unknown as ResultadoItens | null;
  return { rows: resultado?.rows ?? [], total: Number(resultado?.total ?? 0) };
}

export function useItensLista(filtros: FiltrosItens, pagina: number, tamanho: number, ordem: string, direcao: string, enabled: boolean, completo = false) {
  const { empresa, loading, usuario, isMaster } = useAuth();
  const empresaId = String(empresa?.["id"] ?? usuario?.["empresa_id"] ?? "") || null;
  return useQuery({
    queryKey: ["table", "itens", "rpc", empresaId, filtros, pagina, tamanho, ordem, direcao, completo],
    enabled: enabled && !loading && !!usuario && (isMaster || !!empresaId),
    retry: false,
    queryFn: async ({ signal }): Promise<ResultadoItens> => {
      if (!completo) return consultarItens(empresaId, filtros, pagina, tamanho, ordem, direcao, signal);
      const rows: Row[] = [];
      let total = 0;
      for (let page = 1; ; page++) {
        const lote = await consultarItens(empresaId, filtros, page, 1000, ordem, direcao, signal);
        rows.push(...lote.rows);
        total = lote.total;
        if (lote.rows.length < 1000 || rows.length >= total) break;
      }
      return { rows, total };
    },
  });
}