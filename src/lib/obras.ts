/** Gestão de Obras (condomínios): regras puras de progresso, prazo e custo. */
export type AtividadeObra = { id: string; fase_id: string; descricao: string; status: string; responsavel: string; data_inicio: string; data_fim: string; percentual: number; custo: number | null; ordem: number };
export type FaseObra = { id: string; obra_id: string; nome: string; ordem: number; data_inicio: string; data_fim: string; atividades: AtividadeObra[] };
export type FotoObra = { id: string; obra_id: string; url: string; legenda: string; momento: string; created_at: string };
export type Obra = {
  id: string; titulo: string; observacao: string; status: string; data_inicio: string; data_fim: string;
  custo_previsto: number | null; visivel_moradores: boolean; mostrar_custo: boolean; aviso: string;
  fases: FaseObra[]; fotos: FotoObra[];
};

export const STATUS_OBRA = [
  { value: "planejada", label: "Planejada" },
  { value: "andamento", label: "Em andamento" },
  { value: "suspensa", label: "Suspensa" },
  { value: "concluida", label: "Concluída" },
];
export const STATUS_ATIVIDADE = [
  { value: "pendente", label: "Pendente" },
  { value: "andamento", label: "Em andamento" },
  { value: "bloqueada", label: "Bloqueada" },
  { value: "concluida", label: "Concluída" },
];
export const MOMENTOS_FOTO = [
  { value: "antes", label: "Antes" },
  { value: "durante", label: "Durante" },
  { value: "depois", label: "Depois" },
];
export const rotulo = (lista: { value: string; label: string }[], v: string) => lista.find((x) => x.value === v)?.label ?? v;

const limitar = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
const arred = (n: number) => Math.round(n * 10) / 10;

/** Percentual da atividade: concluída vale 100%. */
export const percAtividade = (a: Pick<AtividadeObra, "status" | "percentual">) => (a.status === "concluida" ? 100 : limitar(a.percentual));

/** Média das atividades da fase (sem atividades = 0%). */
export function percFase(f: Pick<FaseObra, "atividades">): number {
  if (!f.atividades.length) return 0;
  return arred(f.atividades.reduce((t, a) => t + percAtividade(a), 0) / f.atividades.length);
}

/** Média de todas as atividades da obra; obra concluída vale 100%. */
export function percObra(o: Pick<Obra, "status" | "fases">): number {
  if (o.status === "concluida") return 100;
  const ats = o.fases.flatMap((f) => f.atividades);
  if (!ats.length) return 0;
  return arred(ats.reduce((t, a) => t + percAtividade(a), 0) / ats.length);
}

/** Custo realizado = soma do custo das atividades. */
export const custoRealizado = (o: Pick<Obra, "fases">) => o.fases.flatMap((f) => f.atividades).reduce((t, a) => t + (a.custo ?? 0), 0);

export type EstadoFase = "concluida" | "atual" | "futura";
/** Estado de cada fase na régua: concluídas (100%), a primeira não concluída é a atual, o resto futuras. */
export function estadosFases(fases: Pick<FaseObra, "atividades" | "ordem">[]): EstadoFase[] {
  let achouAtual = false;
  return fases.map((f) => {
    if (f.atividades.length && percFase(f) >= 100) return "concluida";
    if (!achouAtual) { achouAtual = true; return "atual"; }
    return "futura";
  });
}

export type Prazo = "no_prazo" | "atencao" | "atrasada" | "concluida" | "sem_prazo";
/** Prazo da obra: atrasada após a data final; atenção nos últimos 7 dias com menos de 90%. */
export function prazoObra(o: Pick<Obra, "status" | "data_fim" | "fases">, hoje: Date): { prazo: Prazo; dias: number } {
  if (o.status === "concluida" || percObra(o) >= 100) return { prazo: "concluida", dias: 0 };
  if (!o.data_fim) return { prazo: "sem_prazo", dias: 0 };
  const fim = new Date(`${o.data_fim}T23:59:59`);
  const dias = Math.floor((fim.getTime() - hoje.getTime()) / 86_400_000);
  if (dias < 0) return { prazo: "atrasada", dias: -dias };
  if (dias <= 7 && percObra(o) < 90) return { prazo: "atencao", dias };
  return { prazo: "no_prazo", dias };
}

/** Visão do morador: some obras não públicas e zera custos quando não autorizado. */
export function paraMorador(obras: Obra[]): Obra[] {
  return obras.filter((o) => o.visivel_moradores).map((o) => o.mostrar_custo ? o : {
    ...o, custo_previsto: null, fases: o.fases.map((f) => ({ ...f, atividades: f.atividades.map((a) => ({ ...a, custo: null })) })),
  });
}
