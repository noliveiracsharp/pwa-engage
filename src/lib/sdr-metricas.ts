/** KPIs do funil do SDR a partir da fila (sdr_leads). */
export type LeadMetrica = { status?: unknown; ultimo_contato_em?: unknown; respondeu_em?: unknown };

export function metricasSdr(leads: LeadMetrica[]) {
  const total = leads.length;
  const st = (s: string) => leads.filter((l) => String(l.status ?? "") === s).length;
  const contatados = leads.filter((l) => !!l.ultimo_contato_em || ["contatado", "qualificado", "convertido"].includes(String(l.status ?? ""))).length;
  const responderam = leads.filter((l) => !!l.respondeu_em).length;
  const qualificados = st("qualificado") + st("convertido");
  const convertidos = st("convertido");
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  return { total, contatados, responderam, qualificados, convertidos,
    taxaResposta: pct(responderam, contatados), taxaConversao: pct(convertidos, contatados) };
}
