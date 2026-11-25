/** Regras puras do Agente CRM no WhatsApp (instância interna): normaliza o que a IA extraiu. */
export const TIPOS_AGENTE = ["nota", "visita", "reuniao", "ligacao", "whatsapp", "email"] as const;
export type TipoAgente = (typeof TIPOS_AGENTE)[number];

export type AcaoAgente = {
  cliente: string;
  tipo: TipoAgente;
  resumo: string;
  proxima_acao_tipo: string | null;
  proxima_acao_em: string | null;
  visita_em: string | null;
  tecnico: string | null;
};

const iso = (v: unknown): string | null => {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Extrai o JSON da resposta da IA (aceita bloco ```json```) e valida os campos. null = não entendeu. */
export function lerAcaoAgente(resposta: string): AcaoAgente | null {
  const m = resposta.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o: Record<string, unknown>;
  try { o = JSON.parse(m[0]) as Record<string, unknown>; } catch { return null; }
  const cliente = txt(o["cliente"], 160);
  const resumo = txt(o["resumo"], 4000);
  if (!cliente || !resumo) return null;
  const tipo = (TIPOS_AGENTE as readonly string[]).includes(String(o["tipo"])) ? (o["tipo"] as TipoAgente) : "nota";
  const visita_em = iso(o["visita_em"]);
  return {
    cliente, tipo: visita_em ? "visita" : tipo, resumo,
    proxima_acao_tipo: txt(o["proxima_acao_tipo"], 60) || null,
    proxima_acao_em: iso(o["proxima_acao_em"]),
    visita_em,
    tecnico: txt(o["tecnico"], 120) || null,
  };
}

/** Prompt de extração; datas relativas ("terça às 10h") resolvidas a partir de hoje no fuso de Brasília. */
export function promptAgente(hoje: Date): string {
  const d = hoje.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  return `Você é o assistente comercial interno. Um colaborador relata por WhatsApp algo sobre um cliente/condomínio. Agora é ${d} (America/Sao_Paulo, UTC-3).
Responda SOMENTE um JSON: {"cliente":"nome do cliente/condomínio citado","tipo":"nota|visita|reuniao|ligacao|whatsapp|email","resumo":"resumo objetivo do que aconteceu, em português","proxima_acao_tipo":"ex.: Enviar proposta ou null","proxima_acao_em":"ISO 8601 com -03:00 ou null","visita_em":"ISO 8601 com -03:00 se uma visita técnica foi AGENDADA, senão null","tecnico":"nome do técnico da visita ou null"}.
Se não houver cliente citado, responda {"cliente":"","resumo":""}. Não invente dados.`;
}
