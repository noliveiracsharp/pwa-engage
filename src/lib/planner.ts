/** Planner pessoal: regras puras de agenda e indicadores de performance. */

export type Prioridade = "alta" | "media" | "baixa";
export type PlannerItem = {
  id: string;
  origem: "tarefa" | "projeto";
  titulo: string;
  prioridade: Prioridade;
  estimativaMin: number | null;
  /** Dia em que o usuário planejou executar (null = backlog). */
  planejada: string | null;
  /** Prazo combinado. */
  entrega: string | null;
  status: "aberta" | "aguardando" | "recusada" | "concluida";
  concluidoEm: string | null;
  remarcacoes: number;
  /** Quantidade de comentários na linha do tempo. */
  comentarios?: number;
  /** Quem criou/solicitou (tarefa direta). */
  criadoPor?: string | null;
  /** Responsável pela execução. */
  responsavel?: string | null;
  /** Nome do projeto de origem (tarefa de projeto). */
  projetoNome?: string | null;
};

export const PRIORIDADES: { v: Prioridade; label: string; peso: number }[] = [
  { v: "alta", label: "Alta", peso: 0 },
  { v: "media", label: "Média", peso: 1 },
  { v: "baixa", label: "Baixa", peso: 2 },
];

export function normalizarPrioridade(v: unknown): Prioridade {
  const s = String(v ?? "").toLowerCase();
  if (s === "alta" || s === "urgente") return "alta";
  if (s === "baixa") return "baixa";
  return "media";
}

/** Dia efetivo do item no quadro: planejamento; senão o prazo. */
export const diaDoItem = (i: PlannerItem) => i.planejada ?? i.entrega;

export function ordenar(itens: PlannerItem[]) {
  const peso = (p: Prioridade) => PRIORIDADES.find((x) => x.v === p)!.peso;
  return [...itens].sort((a, b) => Number(a.status === "concluida") - Number(b.status === "concluida") || peso(a.prioridade) - peso(b.prioridade) || a.titulo.localeCompare(b.titulo, "pt-BR"));
}

/** Ao mudar o dia planejado, conta remarcação somente se já havia um dia definido e ele mudou. */
export function novasRemarcacoes(atual: number, de: string | null, para: string | null) {
  return de && de !== para ? atual + 1 : atual;
}

/** Segunda-feira da semana de uma data ISO. */
export function inicioSemana(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function somarDias(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export type Performance = {
  planejadas: number;
  concluidas: number;
  noPrazo: number;
  comPrazo: number;
  remarcacoes: number;
  /** Quantidade de comentários na linha do tempo. */
  comentarios?: number;
  minutosConcluidos: number;
  aderencia: number;
  pontualidade: number;
  score: number;
  classificacao: "Excelente" | "Bom" | "Atenção";
};

/** Indicadores do período [desde, ate] considerando os itens aceitos (não recusados/aguardando). */
export function calcularPerformance(itens: PlannerItem[], desde: string, ate: string): Performance {
  const dentro = itens.filter((i) => {
    const d = diaDoItem(i);
    return i.status !== "recusada" && i.status !== "aguardando" && !!d && d >= desde && d <= ate;
  });
  const concl = dentro.filter((i) => i.status === "concluida");
  const comPrazo = concl.filter((i) => i.entrega);
  const noPrazo = comPrazo.filter((i) => (i.concluidoEm ?? "").slice(0, 10) <= i.entrega!);
  const remarc = dentro.reduce((s, i) => s + i.remarcacoes, 0);
  const aderencia = dentro.length ? (concl.length / dentro.length) * 100 : 0;
  const pontualidade = comPrazo.length ? (noPrazo.length / comPrazo.length) * 100 : concl.length ? 100 : 0;
  const mediaRemarc = dentro.length ? remarc / dentro.length : 0;
  const disciplina = Math.max(0, 100 - mediaRemarc * 50);
  const score = dentro.length ? Math.round(aderencia * 0.5 + pontualidade * 0.35 + disciplina * 0.15) : 0;
  return {
    planejadas: dentro.length,
    concluidas: concl.length,
    noPrazo: noPrazo.length,
    comPrazo: comPrazo.length,
    remarcacoes: remarc,
    minutosConcluidos: concl.reduce((s, i) => s + (i.estimativaMin ?? 0), 0),
    aderencia: Math.round(aderencia),
    pontualidade: Math.round(pontualidade),
    score,
    classificacao: score >= 90 ? "Excelente" : score >= 75 ? "Bom" : "Atenção",
  };
}

export const horas = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, "0") : ""}` : `${min}min`);

/** Linha do tempo da tarefa: comentários do usuário e marcos automáticos. */
export type EventoTarefa = { id: string; tipo: "comentario" | "sistema"; autor_id: string; texto: string; em: string };

export function lerEventos(v: unknown): EventoTarefa[] {
  if (!Array.isArray(v)) return [];
  return (v as EventoTarefa[]).filter((e) => e && typeof e.texto === "string" && typeof e.em === "string");
}

/** Acrescenta um evento e devolve a lista em ordem cronológica. Texto vazio não entra. */
export function adicionarEvento(lista: unknown, ev: Omit<EventoTarefa, "id">): EventoTarefa[] {
  const atual = lerEventos(lista);
  const texto = ev.texto.trim();
  if (!texto) return atual;
  const novo = { ...ev, texto, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  return [...atual, novo].sort((a, b) => a.em.localeCompare(b.em));
}

export const textoRemarcacao = (de: string | null, para: string | null) => {
  const f = (s: string | null) => (s ? s.split("-").reverse().join("/") : "Backlog");
  return `Planejamento alterado de ${f(de)} para ${f(para)}.`;
};
