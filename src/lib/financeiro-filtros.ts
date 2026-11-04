import type { FiltroBanco } from "@/lib/crud";

/** Só títulos lançados em cartão de crédito (limite usado e gráfico de faturas). */
export const FILTRO_TITULOS_CARTAO: FiltroBanco = { key: "cartoes", apply: (q) => q.not("cartao_id", "is", null) };

/** Caixa/Controller: tudo em aberto + movimentos dos últimos 24 meses, em vez do histórico inteiro. */
export function filtroTitulosRecentes(hoje = new Date()): FiltroBanco {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() - 24, 1);
  const desde = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  return { key: `recentes|${desde}`, apply: (q) => q.or(`pago_em.is.null,pago_em.gte.${desde},vencimento.gte.${desde}`) };
}

