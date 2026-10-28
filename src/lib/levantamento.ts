/** Regras puras do Levantamento Técnico da OS (Manutenção → aprovação do gestor → Cotação). */

export type StatusLevantamento = "rascunho" | "aguardando_aprovacao" | "aprovado" | "reprovado" | "cotacao_gerada";
export type ItemLevantamento = { item_id: string; quantidade: number; observacao?: string | null };
export type EventoLevantamento = { em: string; usuario: string; acao: "enviado" | "aprovado" | "reprovado" | "cotacao"; obs?: string | null };

export const STATUS_LEVANTAMENTO: Record<StatusLevantamento, { label: string; cls: string }> = {
  rascunho: { label: "Em levantamento", cls: "bg-muted text-muted-foreground" },
  aguardando_aprovacao: { label: "Aguardando aprovação do gestor", cls: "bg-warning/15 text-warning" },
  aprovado: { label: "Aprovado — liberado para cotação", cls: "bg-success/15 text-success" },
  reprovado: { label: "Devolvido pelo gestor", cls: "bg-destructive/15 text-destructive" },
  cotacao_gerada: { label: "Cotação gerada", cls: "bg-primary/15 text-primary" },
};

/** Prazos do fluxo de compras em dias úteis. */
export const SLA_DIAS_UTEIS = { levantamento: 1, aprovacao: 1, cotacao: 3, aprovacaoCotacao: 1 } as const;

export function statusLevantamento(v: unknown): StatusLevantamento {
  return (Object.keys(STATUS_LEVANTAMENTO) as StatusLevantamento[]).includes(v as StatusLevantamento) ? (v as StatusLevantamento) : "rascunho";
}

/** Soma N dias úteis (seg–sex) a uma data. */
export function somarDiasUteis(inicio: Date, dias: number): Date {
  const d = new Date(inicio);
  let n = 0;
  while (n < dias) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) n++;
  }
  return d;
}

/** Situação do prazo: "ok", "vencendo" (último dia) ou "atrasado". */
export function situacaoPrazo(inicio: Date, dias: number, agora = new Date()): "ok" | "vencendo" | "atrasado" {
  const limite = somarDiasUteis(inicio, dias);
  if (agora > limite) return "atrasado";
  return limite.getTime() - agora.getTime() <= 24 * 3600 * 1000 ? "vencendo" : "ok";
}

/** Ações permitidas por status. Reprovar exige observação do gestor. */
export function podeEnviar(s: StatusLevantamento, itens: ItemLevantamento[]): string | null {
  if (s !== "rascunho" && s !== "reprovado") return "O levantamento já foi enviado.";
  if (!itens.some((i) => i.item_id && i.quantidade > 0)) return "Inclua ao menos um item com quantidade.";
  return null;
}
export function podeDecidir(s: StatusLevantamento, decisao: "aprovado" | "reprovado", obs: string): string | null {
  if (s !== "aguardando_aprovacao") return "Não há levantamento aguardando aprovação.";
  if (decisao === "reprovado" && !obs.trim()) return "Informe a observação para devolver ao técnico.";
  return null;
}
export const podeGerarCotacao = (s: StatusLevantamento) => s === "aprovado";
