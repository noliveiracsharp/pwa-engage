import type { Row } from "@/lib/row";
import { num } from "@/lib/orcamentos";

/** Monthly sums come from the scoped RPC; billing gaps do not prove contract cancellation. */
export function recorrenciaRecebiveis(mensais: Row[], ate: string) {
  const mes = ate.slice(0, 7);
  const atuais = mensais.filter((r) => String(r["mes"] ?? "").slice(0, 7) === mes);
  const mrr = Math.round(atuais.reduce((s, r) => s + num(r["valor_mensal"]), 0) * 100) / 100;
  const clientes = new Set(atuais.filter((r) => num(r["valor_mensal"]) > 0).map((r) => String(r["cliente_id"]))).size;
  const ticket = clientes ? Math.round(mrr / clientes * 100) / 100 : 0;
  return { mrr, arr: Math.round(mrr * 12 * 100) / 100, clientes, ticket, churn: null, ltv: Math.round(ticket * 60 * 100) / 100 };
}