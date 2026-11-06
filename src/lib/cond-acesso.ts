/** Regras puras de acesso de prestadores/visitantes aos leitores faciais. */

export const DIAS_SEMANA = [
  { k: "seg", l: "Segunda-feira" }, { k: "ter", l: "Terça-feira" }, { k: "qua", l: "Quarta-feira" },
  { k: "qui", l: "Quinta-feira" }, { k: "sex", l: "Sexta-feira" }, { k: "sab", l: "Sábado" }, { k: "dom", l: "Domingo" },
] as const;
export type DiaKey = (typeof DIAS_SEMANA)[number]["k"];
export type Faixa = { ativo: boolean; entrada: string; saida: string };
export type Agenda = Record<DiaKey, Faixa>;

export const TIPOS_SERVICO = [
  { value: "babá", label: "Babá" }, { value: "cozinheiro", label: "Cozinheiro(a)" },
  { value: "cuidador", label: "Cuidador(a)" }, { value: "diarista", label: "Diarista" },
  { value: "eletricista", label: "Eletricista" }, { value: "encanador", label: "Encanador" },
  { value: "jardineiro", label: "Jardineiro" }, { value: "motorista", label: "Motorista" },
  { value: "outro", label: "Outro" }, { value: "pedreiro", label: "Pedreiro / obra" },
  { value: "personal", label: "Personal Trainer" }, { value: "pintor", label: "Pintor" },
];

export function agendaVazia(): Agenda {
  return Object.fromEntries(DIAS_SEMANA.map((d) => [d.k, { ativo: false, entrada: "", saida: "" }])) as Agenda;
}

export function normalizarAgenda(v: unknown): Agenda {
  const base = agendaVazia();
  if (v && typeof v === "object") for (const d of DIAS_SEMANA) {
    const f = (v as Record<string, Partial<Faixa>>)[d.k];
    if (f) base[d.k] = { ativo: !!f.ativo, entrada: f.entrada ?? "", saida: f.saida ?? "" };
  }
  return base;
}

/** Copia a faixa de segunda para seg–sex. */
export function copiarParaUteis(a: Agenda): Agenda {
  const out = { ...a };
  for (const k of ["ter", "qua", "qui", "sex"] as DiaKey[]) out[k] = { ...a.seg };
  return out;
}

/** Erros de preenchimento (vazio = ok). */
export function errosAgenda(a: Agenda): string[] {
  const e: string[] = [];
  for (const d of DIAS_SEMANA) {
    const f = a[d.k];
    if (!f.ativo) continue;
    if (!f.entrada || !f.saida) e.push(`${d.l}: informe entrada e saída.`);
    else if (f.saida <= f.entrada) e.push(`${d.l}: a saída deve ser depois da entrada.`);
  }
  return e;
}

/**
 * A facial vai para o leitor só se: controle de acesso ligado, não precisa ser anunciado,
 * há ao menos um dia válido e a vigência (se houver) não expirou.
 */
export function sincronizaFacial(o: { controle: boolean; anunciado: boolean; agenda: Agenda; fim?: string | null; hoje?: string }): boolean {
  if (!o.controle || o.anunciado) return false;
  if (o.fim && o.fim < (o.hoje ?? new Date().toISOString().slice(0, 10))) return false;
  return DIAS_SEMANA.some((d) => o.agenda[d.k].ativo) && errosAgenda(o.agenda).length === 0;
}
