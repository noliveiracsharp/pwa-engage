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
  convidados_email: string[];
  convidados_telefone: string[];
  convidados_nome: string | null;
  /** Colegas da equipe citados (participantes internos, nunca viram cliente). */
  equipe: string[];
  /** Pedido explícito no relato ("já manda o convite por e-mail"); null = perguntar. */
  enviar_convite: CanalConvite | null;
};
export type CanalConvite = "email" | "whatsapp";

const lista = (v: unknown, ok: (s: string) => boolean): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).map((x) => String(x ?? "").trim()).filter(ok).slice(0, 10);
const ehEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const soDigitos = (s: string) => s.replace(/\D/g, "");

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
  const equipe = lista(o["equipe"], (x) => x.length >= 2).map((x) => x.slice(0, 120));
  if ((!cliente && !equipe.length) || !resumo) return null;
  const tipo = (TIPOS_AGENTE as readonly string[]).includes(String(o["tipo"])) ? (o["tipo"] as TipoAgente) : "nota";
  const visita_em = iso(o["visita_em"]);
  return {
    cliente, tipo: visita_em ? "visita" : tipo, resumo,
    proxima_acao_tipo: txt(o["proxima_acao_tipo"], 60) || null,
    proxima_acao_em: iso(o["proxima_acao_em"]),
    visita_em,
    tecnico: txt(o["tecnico"], 120) || null,
    convidados_email: lista(o["convidados_email"], ehEmail).map((e) => e.toLowerCase()),
    convidados_telefone: lista(o["convidados_telefone"], (x) => soDigitos(x).length >= 10).map(soDigitos),
    convidados_nome: txt(o["convidados_nome"], 160) || null,
    equipe,
    enviar_convite: o["enviar_convite"] === "email" || o["enviar_convite"] === "whatsapp" ? o["enviar_convite"] : null,
  };
}

/** Prompt de extração; datas relativas ("terça às 10h") resolvidas a partir de hoje no fuso de Brasília. */
export function promptAgente(hoje: Date, nomesEquipe: string[] = []): string {
  const equipe = nomesEquipe.length ? nomesEquipe.slice(0, 200).join(", ") : "(não informada)";
  const d = hoje.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  return `Você é o assistente comercial interno. Um colaborador relata por WhatsApp algo sobre um cliente/condomínio. Agora é ${d} (America/Sao_Paulo, UTC-3).
Responda SOMENTE um JSON: {"cliente":"nome do cliente/condomínio citado, ou \"\" se for reunião só com a equipe","equipe":["nomes de colegas da equipe interna citados (ex.: \"o Marcelo vai junto\", reunião com colaborador)"],"tipo":"nota|visita|reuniao|ligacao|whatsapp|email","resumo":"resumo objetivo do que aconteceu, em português","proxima_acao_tipo":"ex.: Enviar proposta ou null","proxima_acao_em":"ISO 8601 com -03:00 ou null","visita_em":"ISO 8601 com -03:00 se uma visita técnica foi AGENDADA, senão null","tecnico":"nome do técnico da visita ou null","convidados_nome":"nomes das pessoas DO CLIENTE (não da equipe) que participarão ou null","convidados_email":["e-mails citados"],"convidados_telefone":["telefones citados, só dígitos"],"enviar_convite":"email|whatsapp se o colaborador PEDIU para enviar o convite por esse canal, senão null"}.
E-mails ditos em áudio ("gerente arroba reservadamata ponto com") devem virar gerente@reservadamata.com.
Colegas da equipe interna: ${equipe}. Quem estiver nessa lista vai em "equipe", NUNCA em "cliente" nem em convidados.
Se não houver cliente nem colega citado, responda {"cliente":"","resumo":""}. Não invente dados.`;
}

/** Resposta do colaborador ao menu do convite: 1/e-mail, 2/WhatsApp, 3/não enviar. null = não é resposta ao menu. */
export function escolhaConvite(texto: string): CanalConvite | "nao" | null {
  const t = texto.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!t || t.length > 60) return null;
  if (/^1\b|^(manda|envia|enviar|mandar)?\s*(o convite\s*)?(por|pelo|no)?\s*e-?mail\b|^e-?mail$/.test(t)) return "email";
  if (/^2\b|^(manda|envia|enviar|mandar)?\s*(o convite\s*)?(por|pelo|no)?\s*(whats|zap|wpp)/.test(t)) return "whatsapp";
  if (/^3\b|^(nao|nada|nao envia|nao precisa|depois|cancela)\b/.test(t)) return "nao";
  return null;
}

/** Texto do convite para o cliente (WhatsApp). */
export function textoConviteAgente(r: { titulo: string; inicio: string; duracao_min: number; modalidade?: string | null; local?: string | null; link: string; empresa?: string | null }): string {
  const quando = new Date(r.inicio).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return [
    `Olá! Você foi convidado(a) para a reunião *${r.titulo}*${r.empresa ? ` com ${r.empresa}` : ""}.`,
    `📅 ${quando} (${r.duracao_min} min)`,
    r.modalidade === "presencial" ? `📍 Local: ${r.local || "a definir"}` : `🔗 Entre pelo link (sem instalar nada): ${r.link}`,
  ].join("\n");
}
