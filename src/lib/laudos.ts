import { supabase } from "@/integrations/supabase/client";

export const OBJETIVO_LEVANTAMENTO = "levantamento_tecnico";
// Valor do enum no banco (laudo_objetivo) — grafado com "ç".
export const OBJETIVO_INSPECAO = "inspeção_tecnica";

export const OBJETIVOS = [
  { value: OBJETIVO_LEVANTAMENTO, label: "Levantamento técnico" },
  { value: OBJETIVO_INSPECAO, label: "Inspeção técnica" },
];

export const isInspecao = (v: unknown) => String(v ?? "").startsWith("insp");
export const objetivoLabel = (v: unknown) =>
  isInspecao(v) ? "Inspeção técnica" : "Levantamento técnico";

export const CLASSIFICACOES = [
  { value: "apto", label: "Apto", badge: "bg-success text-success-foreground", pdf: "aprovado" },
  { value: "vulneravel", label: "Vulnerável", badge: "bg-warning text-warning-foreground", pdf: "em-andamento" },
  { value: "nao_apto", label: "Não apto", badge: "bg-destructive text-destructive-foreground", pdf: "reprovado" },
] as const;

export const classificacaoMeta = (v: unknown) => CLASSIFICACOES.find((c) => c.value === v);

export const COTACAO_STATUS = [
  { value: "pendente", label: "Pendente", badge: "bg-secondary text-secondary-foreground" },
  { value: "em_cotacao", label: "Em cotação", badge: "bg-warning text-warning-foreground" },
  { value: "cotado", label: "Cotado", badge: "bg-primary text-primary-foreground" },
  { value: "aprovado", label: "Aprovado", badge: "bg-success text-success-foreground" },
  { value: "cancelado", label: "Cancelado", badge: "bg-destructive text-destructive-foreground" },
];
export const cotacaoStatusMeta = (v: unknown) =>
  COTACAO_STATUS.find((s) => s.value === v) ?? COTACAO_STATUS[0]!;

/** Próximo número sequencial por ano/empresa: PREFIXO-AAAA-001. */
export async function proximoNumero(
  tabela: "laudos_tecnicos" | "cotacoes",
  prefixo: string,
  empresaId: string | number | undefined,
) {
  const ano = new Date().getFullYear();
  let q = supabase.from(tabela).select("numero").like("numero", `${prefixo}-${ano}-%`);
  if (empresaId !== undefined) q = q.eq("empresa_id", String(empresaId));
  const { data } = await q;
  let max = 0;
  for (const r of (data ?? []) as Array<{ numero: string | null }>) {
    const n = Number(String(r.numero ?? "").split("-").pop());
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefixo}-${ano}-${String(max + 1).padStart(3, "0")}`;
}

/** Envia uma foto ao bucket público e devolve a URL. */
export async function uploadFoto(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `laudos/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("chat_media").upload(path, file, { upsert: false });
  if (error) throw error;
  return supabase.storage.from("chat_media").getPublicUrl(path).data.publicUrl;
}

/* ------------------------------- CSV ------------------------------- */

export function toCsv(rows: Array<Array<string | number>>): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
}

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const sep = (clean.split(/\r?\n/)[0] ?? "").includes(";") ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]!;
    if (q) {
      if (c === '"' && clean[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((v) => v.trim())) out.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((v) => v.trim())) out.push(row);
  return out;
}

export function baixarArquivo(nome: string, conteudo: string, tipo = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
