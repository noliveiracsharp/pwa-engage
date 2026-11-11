/** Link público de agendamento (estilo Calendly): regras puras, usadas na tela e espelhadas no banco. */
export type Janela = { inicio: string; fim: string };
export type ConfigAgendamento = {
  ativo: boolean;
  slug: string;
  titulo: string;
  descricao: string;
  duracao_min: number;
  intervalo_min: number;
  antecedencia_h: number;
  horizonte_dias: number;
  modalidade: "online" | "presencial";
  local: string;
  /** Chave = dia da semana (0 domingo … 6 sábado). */
  janelas: Record<string, Janela[]>;
};
export type Ocupado = { inicio: string; fim: string };

export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
/** Horário de Brasília (sem horário de verão desde 2019). */
export const FUSO = "-03:00";

export const CONFIG_PADRAO: ConfigAgendamento = {
  ativo: false, slug: "", titulo: "Reunião", descricao: "", duracao_min: 30, intervalo_min: 0,
  antecedencia_h: 2, horizonte_dias: 30, modalidade: "online", local: "",
  janelas: { "1": [{ inicio: "09:00", fim: "12:00" }, { inicio: "14:00", fim: "17:00" }], "2": [{ inicio: "09:00", fim: "12:00" }, { inicio: "14:00", fim: "17:00" }], "3": [{ inicio: "09:00", fim: "12:00" }, { inicio: "14:00", fim: "17:00" }], "4": [{ inicio: "09:00", fim: "12:00" }, { inicio: "14:00", fim: "17:00" }], "5": [{ inicio: "09:00", fim: "12:00" }, { inicio: "14:00", fim: "17:00" }] },
};

export function slugAgenda(nome: string) {
  return nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

const min = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return (h ?? 0) * 60 + (m ?? 0); };
const diaSemana = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const instante = (iso: string, minutos: number) =>
  new Date(`${iso}T${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}:00${FUSO}`);

/** Valida as janelas: início antes do fim e sem sobreposição no mesmo dia. Retorna mensagem de erro ou null. */
export function validarJanelas(j: Record<string, Janela[]>): string | null {
  for (const [d, lista] of Object.entries(j)) {
    const ord = [...lista].sort((a, b) => min(a.inicio) - min(b.inicio));
    for (let i = 0; i < ord.length; i++) {
      if (min(ord[i]!.inicio) >= min(ord[i]!.fim)) return `${DIAS_SEMANA[Number(d)]}: o fim deve ser depois do início.`;
      if (i > 0 && min(ord[i]!.inicio) < min(ord[i - 1]!.fim)) return `${DIAS_SEMANA[Number(d)]}: há horários sobrepostos.`;
    }
  }
  return null;
}

/** Horários livres de um dia (ISO yyyy-mm-dd, horário de Brasília). */
export function horariosLivres(cfg: ConfigAgendamento, dia: string, ocupados: Ocupado[], agora = new Date()): Date[] {
  const dur = Math.max(5, cfg.duracao_min);
  const passo = dur + Math.max(0, cfg.intervalo_min);
  const minimo = agora.getTime() + cfg.antecedencia_h * 3600000;
  const limite = agora.getTime() + cfg.horizonte_dias * 86400000;
  const occ = ocupados.map((o) => [new Date(o.inicio).getTime(), new Date(o.fim).getTime()] as const);
  const out: Date[] = [];
  for (const j of cfg.janelas[String(diaSemana(dia))] ?? []) {
    for (let m = min(j.inicio); m + dur <= min(j.fim); m += passo) {
      const ini = instante(dia, m); const t = ini.getTime(); const f = t + dur * 60000;
      if (t < minimo || t > limite) continue;
      if (occ.some(([a, b]) => t < b && f > a)) continue;
      out.push(ini);
    }
  }
  return out;
}

/** Link "Adicionar ao Google Agenda" para o convidado. */
export function linkGoogleAgenda(titulo: string, inicio: Date, duracaoMin: number, detalhes: string, local = "") {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const fim = new Date(inicio.getTime() + duracaoMin * 60000);
  const p = new URLSearchParams({ action: "TEMPLATE", text: titulo, dates: `${f(inicio)}/${f(fim)}`, details: detalhes, location: local });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
