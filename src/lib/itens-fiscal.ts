/** Campos fiscais que o contador preenche (link público e CSV). */
export const CAMPOS_FISCAIS = [
  { key: "ncm", label: "NCM" },
  { key: "cest", label: "CEST" },
  { key: "origem", label: "Origem" },
  { key: "cfop_padrao", label: "CFOP" },
  { key: "csosn_cst", label: "CST/CSOSN" },
  { key: "lc116", label: "LC 116" },
  { key: "cod_tributacao_municipio", label: "Cód. trib. município" },
  { key: "aliquota_iss", label: "Alíquota ISS %" },
] as const;
export type CampoFiscal = (typeof CAMPOS_FISCAIS)[number]["key"];
export type ItemFiscal = { id: string; codigo: string; descricao: string; tipo: string } & Record<CampoFiscal, string>;

const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV com ";" (padrão do Excel em pt-BR) e BOM para acentos. */
export function gerarCsvFiscal(itens: ItemFiscal[]) {
  const cab = ["id", "codigo", "descricao", "tipo", ...CAMPOS_FISCAIS.map((c) => c.key)];
  const linhas = itens.map((i) => cab.map((k) => esc(String((i as Record<string, string>)[k] ?? ""))).join(";"));
  return "\uFEFF" + [cab.join(";"), ...linhas].join("\n");
}

function parseLinha(l: string, sep: string) {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i]!;
    if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === sep) { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out;
}

/** Lê o CSV devolvido (aceita ";" ou ","), indexado pelo id do item. */
export function lerCsvFiscal(txt: string): Map<string, Partial<Record<CampoFiscal, string>>> {
  const linhas = txt.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  const res = new Map<string, Partial<Record<CampoFiscal, string>>>();
  if (!linhas.length) return res;
  const sep = linhas[0]!.includes(";") ? ";" : ",";
  const cab = parseLinha(linhas[0]!, sep).map((c) => c.trim());
  const idx = cab.indexOf("id");
  if (idx < 0) return res;
  for (const l of linhas.slice(1)) {
    const cols = parseLinha(l, sep);
    const id = cols[idx]?.trim();
    if (!id) continue;
    const v: Partial<Record<CampoFiscal, string>> = {};
    for (const c of CAMPOS_FISCAIS) { const j = cab.indexOf(c.key); if (j >= 0) v[c.key] = (cols[j] ?? "").trim(); }
    res.set(id, v);
  }
  return res;
}

export function baixarArquivo(nome: string, conteudo: string, tipo = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}
