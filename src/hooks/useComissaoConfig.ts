import { useMemo } from "react";
import { useTableRows, rowId } from "@/lib/crud";
import { num } from "@/lib/orcamentos";
import type { Natureza } from "@/lib/orcamentos";
import { PARAMETROS_PADRAO, type BaseComissao, type Papel, type ParametroNatureza } from "@/lib/comissoes";

/** Parâmetros e papéis de comissão da empresa ativa (com padrões quando não configurado). */
export function useComissaoConfig() {
  const paramsQ = useTableRows("comissao_parametros");
  const papeisQ = useTableRows("comissao_papeis", true, "ordem");

  const parametros = useMemo(() => {
    const out: Record<Natureza, ParametroNatureza> = { ...PARAMETROS_PADRAO };
    for (const r of paramsQ.data ?? []) {
      const nat = String(r["natureza"]) as Natureza;
      if (!(nat in out)) continue;
      out[nat] = {
        natureza: nat,
        imposto_pct: num(r["imposto_pct"]),
        outros_custos_pct: num(r["outros_custos_pct"]),
        base: (r["base"] === "bruto" ? "bruto" : "liquido") as BaseComissao,
      };
    }
    return out;
  }, [paramsQ.data]);

  const papeis: Papel[] = useMemo(
    () =>
      (papeisQ.data ?? []).map((r) => ({
        id: String(rowId(r)),
        nome: String(r["nome"] ?? ""),
        ordem: num(r["ordem"]),
        ativo: r["ativo"] !== false,
        pct: { produto: num(r["pct_produto"]), servico: num(r["pct_servico"]), recorrente: num(r["pct_recorrente"]) },
      })),
    [papeisQ.data],
  );

  return {
    parametros,
    papeis,
    paramRows: paramsQ.data ?? [],
    papelRows: papeisQ.data ?? [],
    disponivel: !paramsQ.isError && !papeisQ.isError,
    loading: paramsQ.isLoading || papeisQ.isLoading,
  };
}
