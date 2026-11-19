/** Motor puro de regras de reserva de espaços (Espaços & Reservas). Sem I/O — testado em cond-reservas.test.ts. */

export type PeriodoCota = "pendente" | "diaria" | "semanal" | "mensal" | "semestral" | "anual" | "dias";
export type ModoConcorrencia = "habilitar" | "mesma_unidade" | "todas_unidades";

export type RegrasEspaco = {
  id: string;
  ativo?: boolean;
  inativo_inicio?: string | null;
  inativo_fim?: string | null;
  dias_min: number;
  dias_max: number;
  max_por_unidade?: number | null;
  max_mesmo_dia?: number | null;
  periodo_cota: PeriodoCota;
  periodo_cota_dias?: number | null;
  horas_entre: number;
  hora_inicio: string; // "HH:MM"
  hora_fim: string;
  simultaneas: number;
  bloqueio_antes_h: number;
  bloqueio_depois_h: number;
  horarios_bloqueados: string[]; // "dia-HH" (0=dom)
  bloquear_inadimplentes?: boolean;
};

export type Reserva = { id?: string; espaco_id: string; unidade_id: string | null; inicio: Date; fim: Date; status: string };
export type BloqueioUnidade = { unidade_id: string; data_inicio?: string | null; data_fim?: string | null };
export type Concorrencia = { espaco_id: string; outro_espaco_id: string; modo: ModoConcorrencia };

export const ATIVAS = new Set(["pendente", "aprovada"]);
export const CAMPOS_ESTRUTURAIS = ["hora_inicio", "hora_fim", "periodo_qtd", "periodo_unidade", "horarios_seguidos", "simultaneas", "intervalo_min", "bloqueio_antes_h", "bloqueio_depois_h"] as const;

const H = 3600_000;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const diaZero = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const minutos = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return (h ?? 0) * 60 + (m ?? 0); };
export const chaveHora = (dia: number, hora: number) => `${dia}-${String(hora).padStart(2, "0")}`;

/** Há reservas ativas futuras → campos amarelos ficam travados. */
export function estruturaTravada(espacoId: string, reservas: Reserva[], agora: Date): boolean {
  return reservas.some((r) => r.espaco_id === espacoId && ATIVAS.has(r.status) && r.fim > agora);
}

/** Data máxima permitida para agendar (hoje + dias_max). */
export function dataMaxima(e: Pick<RegrasEspaco, "dias_max">, agora: Date): Date {
  const d = diaZero(agora); d.setDate(d.getDate() + e.dias_max); return d;
}

function inicioJanelaCota(e: RegrasEspaco, ref: Date): Date | null {
  const d = diaZero(ref);
  switch (e.periodo_cota) {
    case "diaria": return d;
    case "semanal": d.setDate(d.getDate() - d.getDay()); return d;
    case "mensal": return new Date(d.getFullYear(), d.getMonth(), 1);
    case "semestral": return new Date(d.getFullYear(), d.getMonth() < 6 ? 0 : 6, 1);
    case "anual": return new Date(d.getFullYear(), 0, 1);
    case "dias": d.setDate(d.getDate() - Math.max(1, e.periodo_cota_dias ?? 1) + 1); return d;
    default: return null;
  }
}

export type Contexto = {
  agora: Date;
  reservas: Reserva[];            // todas as reservas do condomínio
  datasBloqueadas: string[];      // "YYYY-MM-DD" deste espaço
  unidadesBloqueadas: BloqueioUnidade[]; // deste espaço
  concorrencias: Concorrencia[];  // regras deste espaço
  inadimplente?: boolean;
  gestao?: boolean;               // gestão ignora antecedência mínima
};

/** Valida uma nova reserva. Retorna lista de motivos (vazia = permitida). */
export function validarReserva(e: RegrasEspaco, nova: Omit<Reserva, "status">, c: Contexto): string[] {
  const erros: string[] = [];
  const { inicio, fim } = nova;
  if (e.ativo === false) erros.push("Espaço inativo.");
  if (e.inativo_inicio && e.inativo_fim && inicio < new Date(e.inativo_fim) && fim > new Date(e.inativo_inicio)) erros.push("Espaço indisponível neste período.");
  if (fim <= inicio) erros.push("Horário final deve ser depois do inicial.");
  if (inicio < c.agora) erros.push("Não é possível agendar no passado.");

  const dias = Math.round((diaZero(inicio).getTime() - diaZero(c.agora).getTime()) / (24 * H));
  if (!c.gestao && dias < e.dias_min) erros.push(`Agende com pelo menos ${e.dias_min} dia(s) de antecedência.`);
  if (dias > e.dias_max) erros.push(`Agende com no máximo ${e.dias_max} dia(s) de antecedência.`);

  const mi = inicio.getHours() * 60 + inicio.getMinutes();
  const mf = ymd(fim) === ymd(inicio) ? fim.getHours() * 60 + fim.getMinutes() : 24 * 60;
  if (mi < minutos(e.hora_inicio) || mf > minutos(e.hora_fim)) erros.push(`Funcionamento das ${e.hora_inicio} às ${e.hora_fim}.`);

  if (c.datasBloqueadas.includes(ymd(inicio))) erros.push("Data bloqueada (feriado/comemorativa).");
  const bloq = new Set(e.horarios_bloqueados);
  for (let t = new Date(inicio); t < fim; t = new Date(t.getTime() + H)) {
    if (bloq.has(chaveHora(t.getDay(), t.getHours()))) { erros.push("Horário bloqueado pela administração."); break; }
  }

  if (nova.unidade_id) {
    const hoje = ymd(inicio);
    const ub = c.unidadesBloqueadas.find((b) => b.unidade_id === nova.unidade_id
      && (!b.data_inicio || b.data_inicio <= hoje) && (!b.data_fim || b.data_fim >= hoje));
    if (ub) erros.push("Unidade bloqueada para este espaço.");
    if (e.bloquear_inadimplentes && c.inadimplente) erros.push("Unidade com pendência financeira.");
  }

  const ativas = c.reservas.filter((r) => ATIVAS.has(r.status) && (!nova.id || r.id !== nova.id));
  const doEspaco = ativas.filter((r) => r.espaco_id === e.id);
  const folgaA = (e.bloqueio_antes_h + e.horas_entre) * H;
  const folgaD = (e.bloqueio_depois_h + e.horas_entre) * H;
  const choques = doEspaco.filter((r) => inicio.getTime() < r.fim.getTime() + folgaD && fim.getTime() > r.inicio.getTime() - folgaA);
  if (choques.length >= Math.max(1, e.simultaneas)) erros.push("Horário indisponível (ocupado ou em intervalo de bloqueio).");

  const mesmoDia = doEspaco.filter((r) => ymd(r.inicio) === ymd(inicio));
  if (e.max_mesmo_dia && mesmoDia.length >= e.max_mesmo_dia) erros.push("Limite de reservas no dia atingido.");

  if (nova.unidade_id && e.max_por_unidade) {
    const daUnidade = doEspaco.filter((r) => r.unidade_id === nova.unidade_id);
    const janela = inicioJanelaCota(e, inicio);
    const conta = janela
      ? daUnidade.filter((r) => r.inicio >= janela && r.inicio <= fim).length
      : daUnidade.filter((r) => r.fim > c.agora).length; // pendente = reservas em aberto
    if (conta >= e.max_por_unidade) erros.push(`Limite de ${e.max_por_unidade} reserva(s) por unidade atingido.`);
  }

  for (const cc of c.concorrencias) {
    if (cc.espaco_id !== e.id || cc.modo === "habilitar") continue;
    const conflito = ativas.some((r) => r.espaco_id === cc.outro_espaco_id && ymd(r.inicio) === ymd(inicio)
      && (cc.modo === "todas_unidades" || r.unidade_id === nova.unidade_id));
    if (conflito) { erros.push(cc.modo === "todas_unidades" ? "Outro espaço vinculado já está reservado neste dia." : "Sua unidade já reservou um espaço vinculado neste dia."); break; }
  }
  return erros;
}

/** Ao habilitar reservas conjuntas, os espaços devem ter as mesmas regras de funcionamento. */
export function regrasCompativeis(a: RegrasEspaco, b: RegrasEspaco): boolean {
  return a.hora_inicio === b.hora_inicio && a.hora_fim === b.hora_fim && a.dias_min === b.dias_min && a.dias_max === b.dias_max;
}
