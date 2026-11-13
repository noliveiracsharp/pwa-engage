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

export type CategoriaDoc = { value: string; label: string; vence: boolean; id?: string; dias?: number };

/** Categorias do condomínio; sem linhas próprias, usa a lista padrão. Ordem alfabética, "Outros" no fim. */
export function categoriasEfetivas(rows: { id?: unknown; codigo?: unknown; descricao?: unknown; controla_vencimento?: unknown; dias_alerta_padrao?: unknown }[]): CategoriaDoc[] {
  const base: CategoriaDoc[] = rows.length
    ? rows.map((r) => ({ id: String(r.id ?? ""), value: String(r.codigo ?? ""), label: String(r.descricao ?? ""), vence: !!r.controla_vencimento, dias: antecedencia(r.dias_alerta_padrao) }))
    : CATEGORIAS_DOC.map((c) => ({ value: c.value, label: c.label, vence: c.vence, dias: c.value === "laudos" ? 90 : c.value === "apolices" ? 45 : DIAS_ALERTA }));
  return base.sort((a, b) => (a.value === "outros" ? 1 : b.value === "outros" ? -1 : a.label.localeCompare(b.label, "pt-BR")));
}

/** Código estável a partir do nome, único entre os existentes. */
export function codigoCategoria(nome: string, existentes: string[]): string {
  const raiz = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "categoria";
  let c = raiz, i = 2;
  while (existentes.includes(c)) c = `${raiz}_${i++}`;
  return c;
}

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
export function statusValidade(vencimento: string | null | undefined, hoje: Date = new Date(), diasAlerta: number = DIAS_ALERTA): StatusValidade {
  if (!vencimento) return "sem";
  const v = new Date(`${vencimento.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(v.getTime())) return "sem";
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dias = Math.round((v.getTime() - h.getTime()) / 86_400_000);
  if (dias < 0) return "vencido";
  if (dias <= antecedencia(diasAlerta)) return "a_vencer";
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

/** Antecedência válida (0–3650 dias); vazio ou inválido usa o padrão de 30. */
export function antecedencia(v: unknown): number {
  const n = Number(v);
  if (v === null || v === undefined || v === "" || !Number.isFinite(n) || n < 0) return DIAS_ALERTA;
  return Math.min(3650, Math.round(n));
}

export type AlertaDoc = { id: string; condominioId: string; titulo: string; vencimento: string; dias: number; status: "vencido" | "a_vencer" };

/** Documentos vencidos ou dentro da antecedência própria, do mais urgente ao menos urgente. */
export function quadroVencimentos(docs: { id?: unknown; condominio_id?: unknown; titulo?: unknown; data_vencimento?: unknown; dias_antecedencia?: unknown }[], hoje: Date = new Date()): AlertaDoc[] {
  const out: AlertaDoc[] = [];
  for (const d of docs) {
    const v = String(d.data_vencimento ?? "").slice(0, 10);
    if (!v) continue;
    const st = statusValidade(v, hoje, antecedencia(d.dias_antecedencia));
    if (st !== "vencido" && st !== "a_vencer") continue;
    out.push({ id: String(d.id ?? ""), condominioId: String(d.condominio_id ?? ""), titulo: String(d.titulo ?? ""), vencimento: v, dias: diasParaVencer(v, hoje), status: st });
  }
  return out.sort((a, b) => a.dias - b.dias);
}
