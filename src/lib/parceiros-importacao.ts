import { digitsOnly, isValidCpfCnpj } from "@/lib/input-masks";
import { parseCsv, toCsv } from "@/lib/laudos";

/** Colunas do modelo CSV de importação de parceiros (cabeçalho → campo). */
export const COLUNAS_PARCEIRO = [
  ["Razão social / Nome *", "razao_social"],
  ["Nome fantasia", "nome_fantasia"],
  ["Tipo pessoa (Jurídica/Física)", "tipo_pessoa"],
  ["CNPJ/CPF", "documento"],
  ["Inscrição estadual", "inscricao_estadual"],
  ["Cliente (Sim/Não)", "is_cliente"],
  ["Fornecedor (Sim/Não)", "is_fornecedor"],
  ["Telefone", "telefone"],
  ["Telefone 2", "telefone2"],
  ["E-mail", "email"],
  ["CEP", "cep"],
  ["Endereço", "endereco"],
  ["Número", "numero"],
  ["Complemento", "complemento"],
  ["Bairro", "bairro"],
  ["Cidade", "cidade"],
  ["UF", "uf"],
  ["Observações", "observacoes"],
] as const;

export type LinhaParceiro = {
  linha: number;
  valores: Record<string, string | boolean>;
  erros: string[];
  avisos: string[];
};

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const sim = (v: string) => ["sim", "s", "x", "1", "true", "yes"].includes(norm(v));

export function modeloCsvParceiros(): string {
  return toCsv([
    COLUNAS_PARCEIRO.map((c) => c[0]),
    ["Empresa Exemplo Ltda", "Exemplo", "Jurídica", "11.222.333/0001-81", "", "Sim", "Não", "(12) 99999-0000", "", "contato@exemplo.com.br", "12010-000", "Rua Exemplo", "100", "Sala 1", "Centro", "Taubaté", "SP", ""],
  ]);
}

/** Lê o CSV e valida cada linha; `docsExistentes` = documentos (só dígitos) já cadastrados. */
export function lerCsvParceiros(texto: string, docsExistentes: Set<string>): LinhaParceiro[] {
  const [cab, ...rows] = parseCsv(texto);
  if (!cab) return [];
  const idx = new Map<string, number>();
  cab.forEach((h, i) => {
    const n = norm(h);
    const col = COLUNAS_PARCEIRO.find(([t, k]) => norm(t) === n || norm(k) === n || norm(t).startsWith(n) && n.length > 3);
    if (col && !idx.has(col[1])) idx.set(col[1], i);
  });
  const vistos = new Set<string>();
  return rows.map((r, i) => {
    const get = (k: string) => (idx.has(k) ? String(r[idx.get(k)!] ?? "").trim() : "");
    const erros: string[] = [];
    const avisos: string[] = [];
    const razao = get("razao_social");
    if (!razao) erros.push("Razão social obrigatória");
    const doc = digitsOnly(get("documento"));
    const tipoTxt = norm(get("tipo_pessoa"));
    const tipo = tipoTxt.startsWith("f") || (!tipoTxt && doc.length === 11) ? "Física" : "Jurídica";
    if (doc) {
      if (!isValidCpfCnpj(doc)) erros.push("CNPJ/CPF inválido");
      else if (docsExistentes.has(doc)) erros.push("Já cadastrado");
      else if (vistos.has(doc)) erros.push("Duplicado no arquivo");
      vistos.add(doc);
    } else avisos.push("Sem documento");
    const email = get("email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) erros.push("E-mail inválido");
    const cli = get("is_cliente");
    const forn = get("is_fornecedor");
    const isCliente = cli ? sim(cli) : !forn || !sim(forn);
    const isFornecedor = forn ? sim(forn) : false;
    const valores: Record<string, string | boolean> = {
      tipo_pessoa: tipo,
      is_cliente: isCliente,
      is_fornecedor: isFornecedor,
      status: true,
    };
    for (const [, k] of COLUNAS_PARCEIRO) {
      if (k === "tipo_pessoa" || k === "is_cliente" || k === "is_fornecedor") continue;
      const v = get(k);
      if (!v) continue;
      valores[k] = ["documento", "telefone", "telefone2", "cep"].includes(k) ? digitsOnly(v) : k === "uf" ? v.toUpperCase().slice(0, 2) : v;
    }
    return { linha: i + 2, valores, erros, avisos };
  });
}
