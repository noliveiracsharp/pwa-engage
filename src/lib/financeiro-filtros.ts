import type { FiltroBanco } from "@/lib/crud";

/** Só títulos lançados em cartão de crédito (limite usado e gráfico de faturas). */
export const FILTRO_TITULOS_CARTAO: FiltroBanco = { key: "cartoes", apply: (q) => q.not("cartao_id", "is", null) };

const mesesAtras = (n: number, hoje = new Date()) => {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

/** Títulos ainda não quitados (qualquer data). Sem "or" para não conflitar com o filtro de empresa. */
export const FILTRO_EM_ABERTO: FiltroBanco = { key: "abertos", apply: (q) => q.neq("status", "pago") };

/** Títulos pagos a partir de `meses` meses atrás. */
export function filtroPagosDesde(meses = 24): FiltroBanco {
  const desde = mesesAtras(meses);
  return { key: `pagos|${desde}`, apply: (q) => q.eq("status", "pago").gte("pago_em", desde) };
}

/** Fluxo de caixa: previstos por vencimento no período. */
export function filtroVencimentoEntre(de: string, ate: string): FiltroBanco {
  return { key: `venc|${de}|${ate}`, apply: (q) => { let x = q.neq("status", "pago"); if (de) x = x.gte("vencimento", de); if (ate) x = x.lte("vencimento", ate); return x; } };
}

/** Fluxo de caixa: realizados por data de pagamento no período. */
export function filtroPagoEntre(de: string, ate: string): FiltroBanco {
  return { key: `pago|${de}|${ate}`, apply: (q) => { let x = q.eq("status", "pago"); if (de) x = x.gte("pago_em", de); if (ate) x = x.lte("pago_em", `${ate}T23:59:59`); return x; } };
}

/** Junta listas sem repetir o mesmo título. */
export function unirTitulos<T extends Record<string, unknown>>(...listas: T[][]): T[] {
  const m = new Map<string, T>();
  for (const l of listas) for (const t of l) m.set(String(t["id"]), t);
  return [...m.values()];
}
