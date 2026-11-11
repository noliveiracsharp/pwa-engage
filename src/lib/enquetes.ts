/** Regras puras de Enquetes & Pesquisas do condomínio (espelhadas nas funções SQL cond_enquete_*). */

export type StatusEnquete = "rascunho" | "ativa" | "encerrada" | "cancelada";
export type TipoPergunta = "unica" | "multipla" | "escala" | "texto";
export type Opcao = { id: string; texto: string; imagem?: string | null; arquivo?: string | null; arquivo_nome?: string | null };
export type Pergunta = { id: string; ordem: number; texto: string; tipo: TipoPergunta; obrigatoria: boolean; opcoes: Opcao[] };
export type Publico = {
  blocos?: string[];        // vazio = todas as torres
  papeis?: string[];        // proprietario, inquilino, familiar, preposto
  generos?: string[];       // F, M, O
  idade_min?: number | null;
  idade_max?: number | null;
  apenas_residentes?: boolean;
};
export type Pessoa = { papel: string; bloco_id: string | null; genero: string | null; data_nascimento: string | null; is_residente: boolean };
export type Resposta = { pergunta_id: string; opcoes?: string[]; nota?: number | null; texto?: string | null };

export const STATUS_ENQUETE: { value: StatusEnquete; label: string }[] = [
  { value: "rascunho", label: "Rascunho" },
  { value: "ativa", label: "Ativa" },
  { value: "encerrada", label: "Encerrada" },
  { value: "cancelada", label: "Cancelada" },
];
export const TIPOS_PERGUNTA: { value: TipoPergunta; label: string }[] = [
  { value: "unica", label: "Escolha única (gráfico de pizza)" },
  { value: "multipla", label: "Múltipla escolha" },
  { value: "escala", label: "Nota de 1 a 5" },
  { value: "texto", label: "Texto livre" },
];
/** Papéis que podem votar: prestadores, colaboradores e visitantes nunca votam. */
export const PAPEIS_VOTANTES = [
  { value: "familiar", label: "Familiares / dependentes" },
  { value: "inquilino", label: "Inquilinos" },
  { value: "preposto", label: "Prepostos" },
  { value: "proprietario", label: "Proprietários" },
];
/** Atalhos de faixa etária para o público. */
export const FAIXAS_ETARIAS = [
  { value: "todas", label: "Todas as idades", min: null, max: null },
  { value: "criancas", label: "Crianças (até 12)", min: null, max: 12 },
  { value: "jovens", label: "Adolescentes (13 a 17)", min: 13, max: 17 },
  { value: "adultos", label: "Adultos (18 a 59)", min: 18, max: 59 },
  { value: "melhor_idade", label: "Melhor idade (60+)", min: 60, max: null },
] as const;

/** Idade completa em anos na data de referência; null quando a data é inválida. */
export function idade(nascimento: string | null | undefined, ref: Date = new Date()): number | null {
  if (!nascimento) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(nascimento);
  if (!m) return null;
  const a = Number(m[1]), mes = Number(m[2]), d = Number(m[3]);
  let anos = ref.getFullYear() - a;
  if (ref.getMonth() + 1 < mes || (ref.getMonth() + 1 === mes && ref.getDate() < d)) anos--;
  return anos;
}

/** A pessoa (num vínculo de unidade) faz parte do público da enquete? */
export function elegivel(p: Pessoa, pub: Publico, ref: Date = new Date()): boolean {
  if (!PAPEIS_VOTANTES.some((x) => x.value === p.papel)) return false;
  if (pub.apenas_residentes && !p.is_residente) return false;
  if (pub.blocos?.length && (!p.bloco_id || !pub.blocos.includes(p.bloco_id))) return false;
  if (pub.papeis?.length && !pub.papeis.includes(p.papel)) return false;
  if (pub.generos?.length && (!p.genero || !pub.generos.includes(p.genero))) return false;
  if (pub.idade_min != null || pub.idade_max != null) {
    const i = idade(p.data_nascimento, ref);
    if (i == null) return false;
    if (pub.idade_min != null && i < pub.idade_min) return false;
    if (pub.idade_max != null && i > pub.idade_max) return false;
  }
  return true;
}

/** Status efetivo: uma enquete ativa com prazo vencido conta como encerrada. */
export function statusEfetivo(status: StatusEnquete, fim: string | null | undefined, agora: Date = new Date()): StatusEnquete {
  if (status === "ativa" && fim && new Date(fim).getTime() <= agora.getTime()) return "encerrada";
  return status;
}

/** Erros que impedem publicar (rascunho → ativa). */
export function errosPublicacao(titulo: string, perguntas: Pergunta[]): string[] {
  const e: string[] = [];
  if (!titulo.trim()) e.push("Informe o título.");
  if (!perguntas.length) e.push("Inclua ao menos uma pergunta.");
  perguntas.forEach((q, i) => {
    if (!q.texto.trim()) e.push(`Pergunta ${i + 1}: escreva o enunciado.`);
    if ((q.tipo === "unica" || q.tipo === "multipla") && q.opcoes.filter((o) => o.texto.trim()).length < 2)
      e.push(`Pergunta ${i + 1}: inclua ao menos 2 opções.`);
  });
  return e;
}

/** Valida as respostas do morador; devolve a primeira mensagem de erro ou null. */
export function validarRespostas(perguntas: Pergunta[], resp: Resposta[]): string | null {
  for (const [i, q] of perguntas.entries()) {
    const r = resp.find((x) => x.pergunta_id === q.id);
    const vazia = !r || (q.tipo === "texto" ? !r.texto?.trim() : q.tipo === "escala" ? r.nota == null : !r.opcoes?.length);
    if (vazia) { if (q.obrigatoria) return `Responda a pergunta ${i + 1}.`; continue; }
    if (q.tipo === "unica" && r!.opcoes!.length !== 1) return `Pergunta ${i + 1}: escolha apenas uma opção.`;
    if ((q.tipo === "unica" || q.tipo === "multipla") && r!.opcoes!.some((o) => !q.opcoes.some((x) => x.id === o))) return `Pergunta ${i + 1}: opção inválida.`;
    if (q.tipo === "escala" && (r!.nota! < 1 || r!.nota! > 5)) return `Pergunta ${i + 1}: nota de 1 a 5.`;
  }
  return null;
}

export type Fatia = { id: string; texto: string; votos: number; pct: number };
/** Contagem por opção com percentual sobre o total de votos (múltipla: sobre quem respondeu). */
export function agregarOpcoes(q: Pergunta, votos: { opcoes: string[] | null }[]): { fatias: Fatia[]; respondentes: number } {
  const validos = votos.filter((v) => v.opcoes?.length);
  const base = q.tipo === "multipla" ? validos.length : validos.reduce((n, v) => n + v.opcoes!.length, 0);
  const fatias = q.opcoes.map((o) => {
    const n = validos.filter((v) => v.opcoes!.includes(o.id)).length;
    return { id: o.id, texto: o.texto, votos: n, pct: base ? Math.round((n / base) * 1000) / 10 : 0 };
  });
  return { fatias, respondentes: validos.length };
}

/** Média e distribuição das notas 1..5. */
export function agregarEscala(votos: { nota: number | null }[]): { media: number; dist: number[]; respondentes: number } {
  const ns = votos.map((v) => v.nota).filter((n): n is number => typeof n === "number" && n >= 1 && n <= 5);
  const dist = [1, 2, 3, 4, 5].map((k) => ns.filter((n) => n === k).length);
  return { media: ns.length ? Math.round((ns.reduce((a, b) => a + b, 0) / ns.length) * 10) / 10 : 0, dist, respondentes: ns.length };
}

export const novoId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
