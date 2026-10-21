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
