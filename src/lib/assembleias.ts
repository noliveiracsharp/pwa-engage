/** Regras puras do Módulo de Assembleias (quórum, peso e veredito). O SQL só soma votos; o veredito vem daqui. */

export type Quorum = "simples" | "absoluta" | "dois_tercos" | "unanimidade" | "eleicao";
export type CriterioPeso = "fracao_ideal" | "unidade";
export type StatusAssembleia = "rascunho" | "convocada" | "em_andamento" | "sessao_permanente" | "finalizada" | "cancelada";
export type StatusPauta = "aguardando" | "em_votacao" | "encerrada";

export const QUORUNS: { value: Quorum; label: string; ajuda: string }[] = [
  { value: "simples", label: "Maioria simples dos presentes", ajuda: "Mais votos Sim que Não entre quem votou (Art. 1.352 CC)." },
  { value: "absoluta", label: "Maioria absoluta do condomínio", ajuda: "Sim acima de 50% de todo o condomínio (ex.: obras úteis, destituição)." },
  { value: "dois_tercos", label: "2/3 do condomínio", ajuda: "Sim com 2/3 de todo o condomínio (convenção, obras voluptuárias)." },
  { value: "unanimidade", label: "Unanimidade", ajuda: "Todo o condomínio votando Sim (fachada, destinação)." },
  { value: "eleicao", label: "Eleição / várias opções", ajuda: "Vence a opção com mais votos (chapas, orçamentos)." },
];

export const STATUS_ASSEMBLEIA: { value: StatusAssembleia; label: string }[] = [
  { value: "rascunho", label: "Rascunho" },
  { value: "convocada", label: "Convocada" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "sessao_permanente", label: "Sessão permanente" },
  { value: "finalizada", label: "Finalizada" },
  { value: "cancelada", label: "Cancelada" },
];

export const STATUS_PAUTA: { value: StatusPauta; label: string }[] = [
  { value: "aguardando", label: "Aguardando" },
  { value: "em_votacao", label: "Em votação" },
  { value: "encerrada", label: "Encerrada" },
];

/** Opções padrão de uma pauta comum. */
export const OPCOES_PADRAO = [
  { descricao: "Sim", tipo: "sim" },
  { descricao: "Não", tipo: "nao" },
  { descricao: "Abstenção", tipo: "abstencao" },
] as const;

/** Peso do voto de uma unidade conforme o critério da convenção. */
export function pesoUnidade(criterio: CriterioPeso, fracao: number | null | undefined): number {
  if (criterio === "unidade") return 1;
  const f = Number(fracao);
  return Number.isFinite(f) && f > 0 ? f : 0;
}

/** Quem pode votar: precisa de presença; inadimplente só vota se liberado com motivo (Art. 1.335, III CC). */
export function direitoVoto(adimplente: boolean, liberadoMotivo?: string | null): boolean {
  return adimplente || !!liberadoMotivo?.trim();
}

/** Uma unidade pode levar no máximo `limite` procurações (0 = sem limite). */
export function procuracoesExcedidas(jaRepresentadas: number, limite: number): boolean {
  return limite > 0 && jaRepresentadas >= limite;
}

export type OpcaoTotal = { id: string; descricao: string; tipo: string; peso: number; votos: number };
export type Veredito = { situacao: "aprovada" | "reprovada" | "empate" | "sem_votos"; texto: string; vencedora?: string; percentualSim: number };

/**
 * Veredito de uma pauta.
 * @param totalCondominio soma de pesos de todo o condomínio (frações ou nº de unidades)
 */
export function vereditoPauta(quorum: Quorum, opcoes: OpcaoTotal[], totalCondominio: number): Veredito {
  const somaVotos = opcoes.reduce((a, o) => a + o.votos, 0);
  if (!somaVotos) return { situacao: "sem_votos", texto: "Sem votos registrados", percentualSim: 0 };
  if (quorum === "eleicao") {
    const validas = opcoes.filter((o) => o.tipo !== "abstencao");
    const max = Math.max(0, ...validas.map((o) => o.peso));
    const top = validas.filter((o) => o.peso === max && max > 0);
    if (top.length !== 1) return { situacao: "empate", texto: "Empate — nova votação necessária", percentualSim: 0 };
    return { situacao: "aprovada", texto: `Eleita: ${top[0]!.descricao}`, vencedora: top[0]!.descricao, percentualSim: 0 };
  }
  const sim = opcoes.filter((o) => o.tipo === "sim").reduce((a, o) => a + o.peso, 0);
  const nao = opcoes.filter((o) => o.tipo === "nao").reduce((a, o) => a + o.peso, 0);
  const base = quorum === "simples" ? sim + nao : totalCondominio;
  const pct = base > 0 ? (sim / base) * 100 : 0;
  const eps = 1e-9;
  let ok = false;
  if (quorum === "simples") ok = sim > nao;
  else if (quorum === "absoluta") ok = base > 0 && sim > base / 2 + eps;
  else if (quorum === "dois_tercos") ok = base > 0 && sim + eps >= (base * 2) / 3;
  else if (quorum === "unanimidade") ok = base > 0 && sim + eps >= base;
  if (quorum === "simples" && sim === nao) return { situacao: "empate", texto: "Empate entre Sim e Não", percentualSim: pct };
  return { situacao: ok ? "aprovada" : "reprovada", texto: ok ? "Aprovada" : quorum === "simples" ? "Reprovada" : "Reprovada — quórum não atingido", percentualSim: pct };
}

/** 2ª convocação padrão: 30 minutos depois da 1ª. */
export function segundaConvocacao(primeira: string): string {
  const d = new Date(primeira);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 30 * 60_000).toISOString();
}

/** Status em que o morador pode votar. */
export const emSessao = (st: string) => st === "em_andamento" || st === "sessao_permanente";

export type GrupoAssembleia = "andamento" | "convocadas" | "rascunho" | "encerradas";
/** Agrupa o status nas abas do módulo (ordem: em andamento, convocadas, rascunho, encerradas). */
export function grupoAssembleia(st: string): GrupoAssembleia {
  if (st === "em_andamento" || st === "sessao_permanente") return "andamento";
  if (st === "convocada") return "convocadas";
  if (st === "rascunho") return "rascunho";
  return "encerradas";
}
/** Aba inicial: ao vivo > convocadas > rascunho > encerradas (a primeira com itens). */
export function abaInicialAssembleias(status: string[], comRascunho: boolean): GrupoAssembleia {
  const g = new Set(status.map(grupoAssembleia));
  const ordem: GrupoAssembleia[] = comRascunho ? ["andamento", "convocadas", "rascunho", "encerradas"] : ["andamento", "convocadas", "encerradas"];
  return ordem.find((x) => g.has(x)) ?? (g.has("encerradas") ? "encerradas" : "convocadas");
}

/** Dias corridos entre o envio (agora) e a 1ª convocação. */
export function diasAteConvocacao(dataHora: string | Date, agora: Date = new Date()): number {
  const alvo = new Date(dataHora);
  const ini = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const fim = Date.UTC(alvo.getFullYear(), alvo.getMonth(), alvo.getDate());
  return Math.floor((fim - ini) / 86400000);
}

/** Valida a antecedência mínima da convenção. Emergencial com justificativa dispensa o prazo. */
export function validarAntecedencia(p: { dataHora: string | null; tipo: string; minAgo: number; minAge: number; emergencial: boolean; justificativa?: string | null; agora?: Date }):
  { ok: true } | { ok: false; motivo: string } {
  if (!p.dataHora) return { ok: false, motivo: "Informe a data da 1ª convocação antes de convocar." };
  const dias = diasAteConvocacao(p.dataHora, p.agora);
  if (dias < 0) return { ok: false, motivo: "A data da 1ª convocação já passou." };
  if (p.emergencial) return p.justificativa?.trim() ? { ok: true } : { ok: false, motivo: "Informe a justificativa da convocação emergencial." };
  const min = p.tipo === "AGO" ? p.minAgo : p.minAge;
  if (dias < min) return { ok: false, motivo: `A convenção exige ${min} dia(s) de antecedência para ${p.tipo}; faltam só ${dias}. Ajuste a data ou marque como emergencial.` };
  return { ok: true };
}
