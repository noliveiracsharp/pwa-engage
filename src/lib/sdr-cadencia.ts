/** Regras puras da abordagem automática do SDR (sequência e-mail + WhatsApp). */
export type Canal = "email" | "whatsapp";
export type Passo = { dia: number; canal: Canal; assunto?: string; texto: string };
export type LeadCadencia = {
  status?: unknown; cadencia_ativa?: unknown; cadencia_passo?: unknown; cadencia_proxima?: unknown;
  email?: unknown; whatsapp?: unknown; telefone?: unknown;
};

export const PASSOS_PADRAO: Passo[] = [
  { dia: 0, canal: "email", assunto: "{{empresa}}, uma ideia para a segurança de vocês",
    texto: "Olá, equipe da {{empresa}}!\n\nSou da {{minha_empresa}} e atendemos empresas de {{segmento}} em {{cidade}} com monitoramento, câmeras e controle de acesso.\n\nPosso enviar uma proposta sem compromisso? Basta responder este e-mail." },
  { dia: 1, canal: "whatsapp",
    texto: "Olá! Aqui é da {{minha_empresa}}. Ontem enviei um e-mail para a {{empresa}} sobre segurança eletrônica. Posso te mandar uma proposta rápida?" },
  { dia: 4, canal: "whatsapp",
    texto: "Oi! Passando só para não deixar sem retorno: se fizer sentido para a {{empresa}}, faço uma visita técnica gratuita. Posso agendar?" },
];

/** Situações em que a sequência para automaticamente. */
export const STATUS_ENCERRA = new Set(["qualificado", "convertido", "descartado"]);

const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export function preencherTexto(t: string, v: { empresa?: unknown; segmento?: unknown; cidade?: unknown; minha_empresa?: unknown }) {
  return t.replace(/\{\{\s*(empresa|segmento|cidade|minha_empresa)\s*\}\}/g, (_, k: keyof typeof v) => String(v[k] ?? "").trim());
}

/** Seg a sex, 8h às 18h (horário de Brasília). */
export function horarioComercial(d: Date): boolean {
  const sp = new Date(d.getTime() - 3 * 3600000);
  const dia = sp.getUTCDay(), h = sp.getUTCHours();
  return dia >= 1 && dia <= 5 && h >= 8 && h < 18;
}

export function temCanal(lead: LeadCadencia, canal: Canal) {
  return canal === "email" ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(lead.email ?? "").trim()) : dig(lead.whatsapp || lead.telefone).length >= 10;
}

/** Passo que vence hoje para o lead, ou null. `hoje` = AAAA-MM-DD. */
export function passoDevido(lead: LeadCadencia, passos: Passo[], hoje: string): { indice: number; passo: Passo } | null {
  if (lead.cadencia_ativa !== true || STATUS_ENCERRA.has(String(lead.status ?? ""))) return null;
  const indice = Number(lead.cadencia_passo ?? 0) || 0;
  const passo = passos[indice];
  if (!passo) return null;
  const prox = String(lead.cadencia_proxima ?? "").slice(0, 10);
  if (prox && prox > hoje) return null;
  return { indice, passo };
}

/** Data do próximo passo (diferença de dias entre os passos) ou null quando a sequência termina. */
export function proximaData(passos: Passo[], indice: number, hoje: string): string | null {
  const atual = passos[indice], prox = passos[indice + 1];
  if (!atual || !prox) return null;
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(1, prox.dia - atual.dia));
  return d.toISOString().slice(0, 10);
}
