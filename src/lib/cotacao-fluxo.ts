/** Regras puras do fluxo de status das Cotações de Compras (lista, quadro e alçada). */
import type { SituacaoAprovacao } from "@/lib/aprovacao-compras";

/** Etapas definidas pelo sistema (alçada/pedidos) — não podem ser escolhidas arrastando. */
export const ETAPAS_AUTOMATICAS = ["aguardando_aprovacao", "aprovado", "pedido_gerado"] as const;

/** Status finais: a cotação não é mais movida automaticamente. */
const FINAIS = new Set(["cancelado", "reprovado", "pedido_gerado"]);

/**
 * Status que a cotação deve ter depois de receber preços.
 * - Sem preço: mantém o status atual (Pendente / Em cotação).
 * - Abaixo do valor mínimo da alçada (dispensada) ou já aprovada: Aprovado.
 * - Acima do valor mínimo: Aguardando aprovação.
 * - Rejeitada por aprovador: Reprovado.
 */
export function statusPelaAlcada(
  atual: string,
  o: { temPreco: boolean; situacao: SituacaoAprovacao; temPedido: boolean },
): string {
  if (FINAIS.has(atual)) return atual;
  if (o.temPedido) return "pedido_gerado";
  if (!o.temPreco) return atual;
  if (o.situacao === "dispensada" || o.situacao === "aprovada") return "aprovado";
  if (o.situacao === "rejeitada") return "reprovado";
  return "aguardando_aprovacao";
}

/** Movimento manual no quadro: devolve mensagem de bloqueio ou null se permitido. */
export function bloqueioMovimento(de: string, para: string): string | null {
  if (de === para) return null;
  if ((ETAPAS_AUTOMATICAS as readonly string[]).includes(para))
    return "Essa etapa é definida automaticamente: pela alçada de aprovação ou ao gerar os pedidos de compra.";
  if (de === "pedido_gerado") return "Cotação com pedido gerado não pode voltar de etapa.";
  return null;
}
