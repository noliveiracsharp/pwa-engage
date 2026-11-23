import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";
import { useAuth } from "@/hooks/useAuth";
import { empresaDaConsulta } from "@/lib/financeiro-contexto";

export type FinanceiroRpc = "fn_financeiro_fluxo_caixa" | "fn_financeiro_controller" | "fn_financeiro_titulos_periodo" | "fn_financeiro_titulos_itens_periodo" | "fn_financeiro_titulos_ofertas";

/** Chama uma procedure financeira (SECURITY DEFINER) em lotes de 1000 linhas, na empresa em contexto. */
export function useFinanceiroRpc(fn: FinanceiroRpc, args: Record<string, unknown>, enabled = true) {
  const { isMaster, empresa, usuario, loading, escopoFinanceiro } = useAuth();
  const own = usuario ? String(pick(usuario, ["empresa_id", "id_empresa", "empresaid"]) ?? "") : "";
  const ctx = empresaDaConsulta(escopoFinanceiro, isMaster, empresa ? String(empresa["id"] ?? "") : "", own);
  return useQuery({
    queryKey: ["rpc", fn, ctx, args],
    enabled: enabled && !loading && !!usuario,
    queryFn: async (): Promise<Row[]> => {
      const out: Row[] = [];
      for (let de = 0; ; de += 1000) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.rpc as any)(fn, { ...args, p_empresa_id: ctx || null }).range(de, de + 999);
        if (error) throw new Error(error.message);
        const lote = (data ?? []) as Row[];
        out.push(...lote);
        if (lote.length < 1000) return out;
      }
    },
  });
}
