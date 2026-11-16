/** Regras puras do módulo Atendimentos & Ocorrências (vertical condomínios). */

export type StatusAtend = "pendente_resposta" | "respondida" | "em_analise" | "ocorrencias" | "em_manutencao" | "finalizado";

/** Status com cor própria (badge) e rótulo para gestão / morador. */
export const STATUS_ATEND: { value: StatusAtend; label: string; morador: string; cor: string }[] = [
  { value: "pendente_resposta", label: "Pendente de resposta", morador: "Aguardando a administração", cor: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/15 dark:text-amber-200" },
  { value: "respondida", label: "Respondida", morador: "Respondida — aguardando você", cor: "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-500/15 dark:text-sky-200" },
  { value: "em_analise", label: "Em análise", morador: "Em análise", cor: "bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-500/15 dark:text-violet-200" },
  { value: "ocorrencias", label: "Ocorrências", morador: "Registrada como ocorrência", cor: "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-500/15 dark:text-rose-200" },
  { value: "em_manutencao", label: "Em manutenção", morador: "Em manutenção", cor: "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-500/15 dark:text-orange-200" },
  { value: "finalizado", label: "Finalizado", morador: "Finalizado", cor: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-200" },
];
export const statusAtend = (v: unknown) => STATUS_ATEND.find((x) => x.value === v) ?? STATUS_ATEND[0]!;

/** Número exibido do ticket: só # e o número, mínimo 6 dígitos. */
export const numeroTicket = (n: unknown) => `#${String(Number(n) || 0).padStart(6, "0")}`;

/** Grade semanal: índice 0 = domingo; null = sem atendimento; [início, fim] em horas inteiras. */
export type Horarios = ([number, number] | null)[];
export const HORARIOS_PADRAO: Horarios = [null, [8, 17], [8, 17], [8, 17], [8, 17], [8, 17], [9, 13]];
export const DIAS_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export function normalizarHorarios(v: unknown): Horarios {
  const arr = Array.isArray(v) ? v : HORARIOS_PADRAO;
  return Array.from({ length: 7 }, (_, i) => {
    const d = arr[i];
    if (!Array.isArray(d)) return null;
    const ini = Number(d[0]); const fim = Number(d[1]);
    return Number.isFinite(ini) && Number.isFinite(fim) && fim > ini && ini >= 0 && fim <= 24 ? [ini, fim] : null;
  });
}

/**
 * Prazo do SLA somando `horas` úteis dentro da grade (horário local do navegador / Brasília).
 * Abertura fora do expediente começa a contar no próximo início.
 */
export function prazoSla(inicio: Date, horas: number, horarios: Horarios): Date {
  const grade = normalizarHorarios(horarios);
  if (!grade.some(Boolean)) return new Date(inicio.getTime() + horas * 3600_000);
  let restante = Math.max(0, horas) * 60; // minutos
  const cur = new Date(inicio.getTime());
  for (let guard = 0; guard < 3700 && restante > 0; guard++) {
    const g = grade[cur.getDay()];
    if (g) {
      const ini = new Date(cur); ini.setHours(g[0], 0, 0, 0);
      const fim = new Date(cur); fim.setHours(g[1], 0, 0, 0);
      const de = cur < ini ? ini : cur;
      if (de < fim) {
        const disp = (fim.getTime() - de.getTime()) / 60_000;
        if (disp >= restante) return new Date(de.getTime() + restante * 60_000);
        restante -= disp;
      }
    }
    cur.setDate(cur.getDate() + 1); cur.setHours(0, 0, 0, 0);
  }
  return cur;
}

/** Minutos úteis entre duas datas (para medir tempo de resposta da equipe). */
export function minutosUteis(de: Date, ate: Date, horarios: Horarios): number {
  const grade = normalizarHorarios(horarios);
  if (ate <= de) return 0;
  if (!grade.some(Boolean)) return (ate.getTime() - de.getTime()) / 60_000;
  let total = 0;
  const cur = new Date(de.getTime());
  for (let guard = 0; guard < 3700 && cur < ate; guard++) {
    const g = grade[cur.getDay()];
    if (g) {
      const ini = new Date(cur); ini.setHours(g[0], 0, 0, 0);
      const fim = new Date(cur); fim.setHours(g[1], 0, 0, 0);
      const a = Math.max(cur.getTime(), ini.getTime());
      const b = Math.min(ate.getTime(), fim.getTime());
      if (b > a) total += (b - a) / 60_000;
    }
    cur.setDate(cur.getDate() + 1); cur.setHours(0, 0, 0, 0);
  }
  return Math.round(total);
}

export type SituacaoSla = "dentro" | "proximo" | "fora" | "encerrado";
/** Semáforo: "próximo" quando restam menos de 25% do prazo. Só a gestão vê. */
export function situacaoSla(a: { status: unknown; created_at: unknown; prazo_sla: unknown }, agora = new Date()): SituacaoSla {
  if (a.status === "finalizado") return "encerrado";
  if (!a.prazo_sla) return "dentro";
  const ini = new Date(String(a.created_at)).getTime();
  const fim = new Date(String(a.prazo_sla)).getTime();
  const t = agora.getTime();
  if (t > fim) return "fora";
  return fim - t < (fim - ini) * 0.25 ? "proximo" : "dentro";
}
export const SLA_META: Record<SituacaoSla, { label: string; cor: string }> = {
  dentro: { label: "Dentro do prazo", cor: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200" },
  proximo: { label: "Próximo ao prazo", cor: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200" },
  fora: { label: "Fora do prazo", cor: "bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-200" },
  encerrado: { label: "Encerrado", cor: "bg-muted text-muted-foreground" },
};

/**
 * Índice de reputação da gestão (0–100), modelo estatístico simples:
 * 40% satisfação (média das estrelas/5), 30% cumprimento de SLA, 20% resolução, 10% agilidade da 1ª resposta (meta 4h úteis).
 * Sem avaliações, o peso da satisfação é redistribuído.
 */
export function indiceReputacao(m: { notas: number[]; noPrazo: number; comPrazo: number; finalizados: number; total: number; mediaPrimeiraRespostaMin: number | null }) {
  const sat = m.notas.length ? m.notas.reduce((x, y) => x + y, 0) / m.notas.length / 5 : null;
  const sla = m.comPrazo ? m.noPrazo / m.comPrazo : 1;
  const res = m.total ? m.finalizados / m.total : 1;
  const agil = m.mediaPrimeiraRespostaMin == null ? 1 : Math.max(0, Math.min(1, 1 - (m.mediaPrimeiraRespostaMin - 240) / (240 * 4)));
  const partes: [number | null, number][] = [[sat, 0.4], [sla, 0.3], [res, 0.2], [agil, 0.1]];
  const pesos = partes.filter(([v]) => v != null).reduce((s, [, p]) => s + p, 0);
  const valor = partes.reduce((s, [v, p]) => s + (v ?? 0) * p, 0) / (pesos || 1);
  const indice = Math.round(valor * 100);
  const faixa = indice >= 80 ? "Excelente" : indice >= 65 ? "Boa" : indice >= 50 ? "Atenção" : "Crítica";
  return { indice, faixa, satisfacao: sat, sla, resolucao: res, agilidade: agil };
}

export const formatarDuracao = (min: number | null) => {
  if (min == null || !Number.isFinite(min)) return "—";
  if (min < 60) return `${Math.round(min)} min`;
  const h = min / 60;
  return h < 24 ? `${h.toFixed(1).replace(".", ",")} h` : `${(h / 24).toFixed(1).replace(".", ",")} d`;
};

/** Texto do aviso por WhatsApp a cada interação (sem expor quem mencionou). */
export function mensagemInteracao(p: { condominio: string; numero: unknown; titulo: string; evento: string; trecho?: string }) {
  const t = (p.trecho ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
  return `*${p.condominio || "Condomínio"}* — Atendimento ${numeroTicket(p.numero)}\n${p.titulo}\n\n${p.evento}${t ? `\n\n“${t}”` : ""}\n\nAbra o app ConectCon HUB para responder.`;
}
