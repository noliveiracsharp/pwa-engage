/** Regras comerciais do CRM: origem do lead, motivos de perda e próxima ação. */
export const ORIGENS_LEAD = [
  "Evento", "Google Ads", "Indicação", "Meta Ads (Instagram/Facebook)", "Outro",
  "Prospecção ativa", "Site", "WhatsApp",
] as const;

export const MOTIVOS_PERDA = [
  "Desistiu do projeto", "Não respondeu (sumiu)", "Outro", "Perdeu para concorrente",
  "Preço alto", "Prazo não atendido", "Sem verba no momento",
] as const;

export const TIPOS_ACAO = [
  { value: "enviar_proposta", label: "Enviar proposta" },
  { value: "ligacao", label: "Ligação" },
  { value: "reuniao", label: "Reunião" },
  { value: "visita", label: "Visita" },
  { value: "whatsapp", label: "WhatsApp" },
] as const;

const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Situação/etapa encerrada (ganha ou perdida) não precisa de próxima ação. */
export function negocioEncerrado(situacao: unknown, etapa?: unknown): boolean {
  return /ativa|ganh|aprovad|perd|reprov|desist|cancel/.test(`${norm(situacao)} ${norm(etapa)}`);
}

export function negocioPerdido(situacao: unknown): boolean {
  return /perd|reprov|desist|cancel/.test(norm(situacao));
}

export type StatusAcao = "sem_acao" | "atrasada" | "hoje" | "agendada" | "encerrado";

/** Status da próxima ação comparando com `agora`. */
export function statusProximaAcao(quando: unknown, situacao: unknown, agora: Date = new Date()): StatusAcao {
  if (negocioEncerrado(situacao)) return "encerrado";
  const s = String(quando ?? "").trim();
  if (!s) return "sem_acao";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "sem_acao";
  if (d.getTime() < agora.getTime()) return "atrasada";
  const mesmoDia = d.getFullYear() === agora.getFullYear() && d.getMonth() === agora.getMonth() && d.getDate() === agora.getDate();
  return mesmoDia ? "hoje" : "agendada";
}

export const ROTULO_STATUS_ACAO: Record<StatusAcao, string> = {
  sem_acao: "Sem próxima ação",
  atrasada: "Ação atrasada",
  hoje: "Ação hoje",
  agendada: "Ação agendada",
  encerrado: "",
};

const n = (v: unknown) => Number(v ?? 0) || 0;

/** Probabilidade da etapa (0–100): usa a gravada; senão distribui pela posição (10% → 90%). */
export function probabilidadeEtapa(etapa: Record<string, unknown> | undefined, indice: number, total: number): number {
  const p = etapa?.["probabilidade"];
  if (p !== null && p !== undefined && p !== "") return Math.max(0, Math.min(100, n(p)));
  if (total <= 1) return 50;
  return Math.round(10 + (80 * indice) / (total - 1));
}

/** Previsão ponderada: soma valor × probabilidade das ofertas em aberto. */
export function forecastPonderado(itens: Array<{ valor: number; probabilidade: number }>): number {
  return Math.round(itens.reduce((s, i) => s + i.valor * (i.probabilidade / 100), 0) * 100) / 100;
}

/** Agrupa motivos de perda com quantidade e valor, do maior para o menor. */
export function resumoPerdas(ofertas: Array<{ motivo: string | null; valor: number }>) {
  const m = new Map<string, { motivo: string; qtd: number; valor: number }>();
  for (const o of ofertas) {
    const k = o.motivo?.trim() || "Não informado";
    const r = m.get(k) ?? { motivo: k, qtd: 0, valor: 0 };
    r.qtd += 1; r.valor += o.valor;
    m.set(k, r);
  }
  return [...m.values()].sort((a, b) => b.qtd - a.qtd || b.valor - a.valor);
}

/** % da meta atingida (0 quando sem meta). */
export function percentualMeta(realizado: number, meta: number): number {
  return meta > 0 ? Math.round((realizado / meta) * 1000) / 10 : 0;
}
