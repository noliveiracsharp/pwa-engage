/** Planilha CSV (;) de blocos e unidades — lógica pura, testada. */
export const COLUNAS = ["Bloco", "Unidade", "Andar", "Tipo", "Area privativa (m2)", "Fracao ideal"] as const;
export const TIPOS_VALIDOS = ["apartamento", "casa", "cobertura", "loja", "sala", "vaga_autonoma", "outro"];

export type LinhaUnidade = { bloco: string; numero: string; andar: number | null; tipo: string; area_privativa: number | null; fracao_ideal: number | null };
export type ErroLinha = { linha: number; mensagem: string };

const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const num = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));

export function gerarCsv(linhas: LinhaUnidade[]): string {
  const corpo = linhas.map((l) => [l.bloco, l.numero, l.andar == null ? "" : String(l.andar), l.tipo, num(l.area_privativa), num(l.fracao_ideal)].map(esc).join(";"));
  return "\uFEFF" + [COLUNAS.join(";"), ...corpo].join("\r\n");
}

export const MODELO: LinhaUnidade[] = [
  { bloco: "Torre 1", numero: "101", andar: 1, tipo: "apartamento", area_privativa: 65.5, fracao_ideal: 0.0125 },
  { bloco: "Torre 1", numero: "102", andar: null, tipo: "apartamento", area_privativa: null, fracao_ideal: null },
  { bloco: "Bloco Comercial", numero: "Loja 1", andar: 0, tipo: "loja", area_privativa: 40, fracao_ideal: null },
];

function splitCsv(texto: string, sep: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cel = ""; let q = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (q) { if (c === '"') { if (texto[i + 1] === '"') { cel += '"'; i++; } else q = false; } else cel += c; continue; }
    if (c === '"') q = true; else if (c === sep) { row.push(cel); cel = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && texto[i + 1] === "\n") i++; row.push(cel); rows.push(row); row = []; cel = ""; }
    else cel += c;
  }
  if (cel || row.length) { row.push(cel); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const decimal = (v: string): number | null | undefined => {
  const t = v.trim(); if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : undefined;
};
/** Andar inferido do número: 101→1, 1203→12, "Loja 1"→null. */
export function inferirAndar(numero: string): number | null {
  return /^\d{3,4}$/.test(numero) ? Math.floor(Number(numero) / 100) : null;
}

export function lerCsv(texto: string): { linhas: LinhaUnidade[]; erros: ErroLinha[] } {
  const t = texto.replace(/^\uFEFF/, "");
  const primeira = t.split(/\r?\n/)[0] ?? "";
  const sep = primeira.split(";").length >= primeira.split(",").length ? ";" : ",";
  const rows = splitCsv(t, sep);
  const erros: ErroLinha[] = []; const linhas: LinhaUnidade[] = [];
  if (!rows.length) return { linhas, erros: [{ linha: 1, mensagem: "Planilha vazia." }] };
  const cab = rows[0]!.map(norm);
  const idx = (...nomes: string[]) => cab.findIndex((c) => nomes.some((n) => c.startsWith(n)));
  const iB = idx("bloco", "torre"), iU = idx("unidade", "numero"), iA = idx("andar"), iT = idx("tipo"), iM = idx("area", "metragem"), iF = idx("fracao");
  if (iB < 0 || iU < 0) return { linhas, erros: [{ linha: 1, mensagem: "Cabeçalho precisa das colunas Bloco e Unidade." }] };
  const vistos = new Set<string>();
  rows.slice(1).forEach((r, k) => {
    const n = k + 2; const g = (i: number) => (i < 0 ? "" : (r[i] ?? "").trim());
    const bloco = g(iB), numero = g(iU);
    if (!bloco || !numero) { erros.push({ linha: n, mensagem: "Bloco e Unidade são obrigatórios." }); return; }
    const chave = `${norm(bloco)}|${norm(numero)}`;
    if (vistos.has(chave)) { erros.push({ linha: n, mensagem: `Unidade ${numero} repetida no bloco ${bloco}.` }); return; }
    vistos.add(chave);
    const tipoTxt = norm(g(iT)).replace(/\s+/g, "_");
    const tipo = tipoTxt || "apartamento";
    if (!TIPOS_VALIDOS.includes(tipo)) { erros.push({ linha: n, mensagem: `Tipo "${g(iT)}" inválido.` }); return; }
    const andarTxt = g(iA); const andar = andarTxt ? Number(andarTxt) : inferirAndar(numero);
    if (andar != null && !Number.isInteger(andar)) { erros.push({ linha: n, mensagem: "Andar deve ser número inteiro." }); return; }
    const area = decimal(g(iM)), fr = decimal(g(iF));
    if (area === undefined || fr === undefined) { erros.push({ linha: n, mensagem: "Área ou fração ideal com número inválido." }); return; }
    linhas.push({ bloco, numero, andar, tipo, area_privativa: area, fracao_ideal: fr });
  });
  return { linhas, erros };
}
