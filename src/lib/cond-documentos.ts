/** Regras puras da pasta digital do condomínio. */

export const CATEGORIAS_DOC = [
  { value: "apolices", label: "Apólices de seguro", vence: true },
  { value: "atas", label: "Atas & assembleias", vence: false },
  { value: "balancetes", label: "Balancetes & prestação de contas", vence: false },
  { value: "contratos", label: "Contratos de terceiros", vence: true },
  { value: "editais", label: "Editais & convocações", vence: false },
  { value: "institucionais", label: "Convenção & regimento interno", vence: false },
  { value: "laudos", label: "Laudos & vistorias (AVCB, SPDA…)", vence: true },
  { value: "outros", label: "Outros", vence: false },
] as const;

export const VISIBILIDADES_DOC = [
  { value: "diretoria", label: "Corpo diretivo (síndico e conselho)" },
  { value: "gestao", label: "Somente gestão (administradora e síndico)" },
  { value: "moradores", label: "Todos os moradores" },
  { value: "proprietarios", label: "Somente proprietários" },
] as const;

export type StatusValidade = "sem" | "valido" | "a_vencer" | "vencido";

/** Dias de antecedência para o alerta "A vencer". */
export const DIAS_ALERTA = 30;

/** Situação do documento em relação ao vencimento (datas ISO yyyy-mm-dd). */
export function statusValidade(vencimento: string | null | undefined, hoje: Date = new Date()): StatusValidade {
  if (!vencimento) return "sem";
  const v = new Date(`${vencimento.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(v.getTime())) return "sem";
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dias = Math.round((v.getTime() - h.getTime()) / 86_400_000);
  if (dias < 0) return "vencido";
  if (dias <= DIAS_ALERTA) return "a_vencer";
  return "valido";
}

export function diasParaVencer(vencimento: string, hoje: Date = new Date()): number {
  const v = new Date(`${vencimento.slice(0, 10)}T00:00:00`);
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((v.getTime() - h.getTime()) / 86_400_000);
}

export const TAMANHO_MAX_DOC = 20 * 1024 * 1024;

export function nomeArquivoSeguro(nome: string): string {
  return nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]/g, "_");
}
