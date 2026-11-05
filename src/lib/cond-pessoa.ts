/** Regras puras do cadastro de pessoas do condomínio. */

export const GENEROS = [
  { value: "F", label: "Feminino" },
  { value: "M", label: "Masculino" },
  { value: "O", label: "Outro / prefiro não informar" },
];

export const ACESSIBILIDADE = [
  { value: "", label: "Não possuo" },
  { value: "condicao_cronica", label: "Condição crônica com necessidade de apoio" },
  { value: "deficiencia_intelectual", label: "Deficiência intelectual" },
  { value: "fala_comunicacao", label: "Dificuldade de fala ou comunicação" },
  { value: "mobilidade_reduzida", label: "Mobilidade reduzida" },
  { value: "outra", label: "Outra necessidade de acessibilidade" },
  { value: "perda_memoria", label: "Perda de memória" },
  { value: "perda_visao", label: "Perda de visão e cegueira" },
  { value: "surdez", label: "Pessoa surda" },
  { value: "desenvolvimento", label: "Transtorno de desenvolvimento" },
  { value: "tea", label: "Transtorno do Espectro Autista" },
];

export const FUNCOES_CONDOMINIO = [
  { value: "condomino", label: "Condômino" },
  { value: "conselheiro_consultivo", label: "Conselheiro consultivo" },
  { value: "conselheiro_fiscal", label: "Conselheiro fiscal" },
  { value: "gerente_predial", label: "Gerente predial" },
  { value: "sindico", label: "Síndico" },
  { value: "subsindico", label: "Subsíndico" },
];

export const STATUS_CONEXAO = [
  { value: "ativo", label: "Ativo", ajuda: "Usa todas as funcionalidades liberadas." },
  { value: "inativo", label: "Inativo", ajuda: "Não interage com agendamentos, enquetes e anúncios internos." },
  { value: "bloqueado", label: "Bloqueado", ajuda: "Não conecta ao condomínio." },
];

/** Papéis titulares: exigem aceite do regimento interno. */
export const PAPEIS_TITULARES = ["proprietario", "inquilino", "preposto"];

/** "25/06/1985" → "1985-06-25"; inválida → "". */
export function dataBrParaIso(br: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br.trim());
  if (!m) return "";
  const [, d, mes, a] = m;
  const dt = new Date(Date.UTC(Number(a), Number(mes) - 1, Number(d)));
  if (dt.getUTCFullYear() !== Number(a) || dt.getUTCMonth() !== Number(mes) - 1 || dt.getUTCDate() !== Number(d)) return "";
  return `${a}-${mes}-${d}`;
}

/** "1985-06-25" → "25/06/1985". */
export function isoParaBr(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Máscara de digitação dd/mm/aaaa. */
export function mascaraData(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join("/");
}

export type PreferenciaCatalogo = { chave: string; descricao: string; publico: string; padrao: boolean; ordem: number };

/** Preferências que se aplicam ao papel, na ordem do catálogo. */
export function preferenciasDoPapel(cat: PreferenciaCatalogo[], papel: string): PreferenciaCatalogo[] {
  const titular = PAPEIS_TITULARES.includes(papel);
  return cat
    .filter((p) => p.publico === "todos" || (titular ? p.publico === "titular" : p.publico === "familiar"))
    .sort((a, b) => a.ordem - b.ordem);
}

/** Valor efetivo de cada preferência: o salvo ou, se nunca respondido, o padrão do catálogo. */
export function valoresPreferencias(cat: PreferenciaCatalogo[], salvas: Record<string, unknown> | null | undefined): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const p of cat) {
    const v = salvas?.[p.chave];
    out[p.chave] = typeof v === "boolean" ? v : p.padrao;
  }
  return out;
}

/** Salvar exige aceite do regimento só para titulares que ainda não aceitaram. */
export function exigeAceite(papel: string, jaAceitoEm: string | null | undefined): boolean {
  return PAPEIS_TITULARES.includes(papel) && !jaAceitoEm;
}
