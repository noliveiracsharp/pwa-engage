/** Regras puras do Estoque & Insumos da vertical condomínios. */
export const CATEGORIAS_ESTOQUE = [
  { value: "limpeza", label: "Limpeza & higiene" },
  { value: "eletrica", label: "Elétrica & iluminação" },
  { value: "hidraulica", label: "Hidráulica & bombas" },
  { value: "piscina", label: "Piscina" },
  { value: "portaria", label: "Portaria & segurança" },
  { value: "epi", label: "EPIs" },
  { value: "jardinagem", label: "Jardinagem" },
  { value: "escritorio", label: "Escritório" },
  { value: "outros", label: "Outros" },
];

export const UNIDADES_ESTOQUE = ["un", "cx", "pct", "rolo", "kg", "g", "l", "ml", "m", "par", "galão"];

export type TipoMovCond = { value: string; label: string; origem: boolean; destino: boolean };
export const TIPOS_MOV_COND: TipoMovCond[] = [
  { value: "entrada_compra", label: "Entrada por compra", origem: false, destino: true },
  { value: "entrada_avulsa", label: "Entrada avulsa / doação", origem: false, destino: true },
  { value: "devolucao", label: "Devolução ao estoque", origem: false, destino: true },
  { value: "ajuste_entrada", label: "Ajuste de inventário (+)", origem: false, destino: true },
  { value: "saida_avulsa", label: "Saída para consumo", origem: true, destino: false },
  { value: "saida_os", label: "Usado em ordem de serviço", origem: true, destino: false },
  { value: "perda", label: "Perda / avaria / vencido", origem: true, destino: false },
  { value: "ajuste_saida", label: "Ajuste de inventário (−)", origem: true, destino: false },
  { value: "transferencia", label: "Transferência entre locais", origem: true, destino: true },
];
export const tipoMovCond = (v: unknown) => TIPOS_MOV_COND.find((t) => t.value === String(v ?? ""));

export type SituacaoEstoque = "normal" | "atencao" | "abaixo" | "zerado";
export const SITUACAO_ESTOQUE: Record<SituacaoEstoque, { label: string; cls: string }> = {
  normal: { label: "Normal", cls: "bg-success/15 text-success" },
  atencao: { label: "Atenção", cls: "bg-warning/20 text-warning-foreground" },
  abaixo: { label: "Abaixo do mínimo", cls: "bg-destructive/15 text-destructive" },
  zerado: { label: "Zerado", cls: "bg-destructive text-destructive-foreground" },
};

/** Zerado ≤ 0; abaixo < mínimo; atenção até 20% acima do mínimo. */
export function situacaoEstoque(saldo: number, minimo: number): SituacaoEstoque {
  if (saldo <= 0) return "zerado";
  if (minimo > 0 && saldo < minimo) return "abaixo";
  if (minimo > 0 && saldo <= minimo * 1.2) return "atencao";
  return "normal";
}

type Mov = { item_id: unknown; local_origem_id?: unknown; local_destino_id?: unknown; quantidade: unknown };
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** Saldo de um item em um local (ou em todos, sem local). */
export function saldoItem(movs: Mov[], itemId: string, localId?: string) {
  let t = 0;
  for (const m of movs) {
    if (String(m.item_id) !== itemId) continue;
    const q = n(m.quantidade);
    if (m.local_destino_id && (!localId || String(m.local_destino_id) === localId)) t += q;
    if (m.local_origem_id && (!localId || String(m.local_origem_id) === localId)) t -= q;
  }
  return Math.round(t * 1000) / 1000;
}

/** Valida um lançamento antes de gravar; devolve a mensagem de erro ou null. */
export function validarMovimento(p: { tipo: string; quantidade: number; origem?: string; destino?: string; saldoOrigem: number }): string | null {
  const t = tipoMovCond(p.tipo);
  if (!t) return "Escolha o tipo de movimentação.";
  if (!(p.quantidade > 0)) return "Informe uma quantidade maior que zero.";
  if (t.origem && !p.origem) return "Escolha o local de onde o item sai.";
  if (t.destino && !p.destino) return "Escolha o local para onde o item vai.";
  if (t.origem && t.destino && p.origem === p.destino) return "Origem e destino precisam ser diferentes.";
  if (t.origem && p.quantidade > p.saldoOrigem) return `Saldo insuficiente no local (disponível: ${p.saldoOrigem}).`;
  return null;
}

/** Custo dos materiais: soma quantidade × custo das saídas (devoluções à OS abatem). */
export function custoMateriais(movs: { tipo: unknown; quantidade: unknown; custo_unitario?: unknown }[]) {
  const total = movs.reduce((t, m) => {
    const v = n(m.quantidade) * n(m.custo_unitario);
    return m.tipo === "devolucao" ? t - v : tipoMovCond(m.tipo)?.origem && !tipoMovCond(m.tipo)?.destino ? t + v : t;
  }, 0);
  return Math.round(total * 100) / 100;
}
