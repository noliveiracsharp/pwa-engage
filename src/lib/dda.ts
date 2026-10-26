/**
 * DDA (Débito Direto Autorizado) — leitura do arquivo CNAB 240 FEBRABAN (Segmento G)
 * e cruzamento com as contas a pagar. Puro e testado.
 */

export type BoletoDda = {
  codigo_barras: string;
  linha_digitavel: string;
  cedente_documento: string;
  cedente_nome: string;
  vencimento: string; // AAAA-MM-DD
  valor: number;
};

const so = (s: string) => s.replace(/\D/g, "");

function mod10(num: string) {
  let soma = 0, peso = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    let r = Number(num[i]) * peso;
    if (r > 9) r = Math.floor(r / 10) + (r % 10);
    soma += r; peso = peso === 2 ? 1 : 2;
  }
  return String((10 - (soma % 10)) % 10);
}

/** Converte código de barras (44 dígitos) em linha digitável (47 dígitos). */
export function linhaDigitavelDe(barras: string) {
  const b = so(barras);
  if (b.length !== 44) return "";
  const livre = b.slice(19);
  const c1 = b.slice(0, 4) + livre.slice(0, 5);
  const c2 = livre.slice(5, 15);
  const c3 = livre.slice(15, 25);
  return c1 + mod10(c1) + c2 + mod10(c2) + c3 + mod10(c3) + b[4] + b.slice(5, 19);
}

const data8 = (s: string) => {
  const d = so(s);
  if (d.length !== 8 || d === "00000000") return "";
  return `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
};

/** Lê as linhas do Segmento G de um arquivo CNAB 240 DDA. */
export function lerCnabDda(conteudo: string): BoletoDda[] {
  const out: BoletoDda[] = [];
  for (const bruta of conteudo.split(/\r?\n/)) {
    const l = bruta.padEnd(240, " ");
    if (l[7] !== "3" || l[13] !== "G") continue;
    const barras = so(l.slice(17, 61));
    if (barras.length !== 44) continue;
    const doc = so(l.slice(62, 77)).replace(/^0+(?=\d{11,})/, "");
    out.push({
      codigo_barras: barras,
      linha_digitavel: linhaDigitavelDe(barras),
      cedente_documento: doc.length > 11 ? doc.padStart(14, "0").slice(-14) : doc.padStart(11, "0").slice(-11),
      cedente_nome: l.slice(77, 107).trim(),
      vencimento: data8(l.slice(107, 115)),
      valor: Number(so(l.slice(115, 130)) || "0") / 100,
    });
  }
  return out;
}

export type TituloPagar = { id: string; parceiro_id: string; valor: number; vencimento: string; status: string; tipo: string; linha_digitavel?: string | null };
export type ParceiroDoc = { id: string; documento: string };

const dias = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000);

/** Fornecedor pelo CNPJ/CPF do cedente e título em aberto com o mesmo valor e vencimento (±5 dias). */
export function cruzarDda(b: Pick<BoletoDda, "cedente_documento" | "valor" | "vencimento">, parceiros: ParceiroDoc[], titulos: TituloPagar[]) {
  const parceiro = parceiros.find((p) => so(p.documento) === b.cedente_documento) ?? null;
  if (!parceiro) return { parceiroId: null, tituloId: null };
  const cands = titulos
    .filter((t) => t.tipo === "pagar" && t.status === "aberto" && t.parceiro_id === parceiro.id
      && Math.abs(Number(t.valor) - b.valor) < 0.01 && (!b.vencimento || dias(t.vencimento, b.vencimento) <= 5))
    .sort((x, y) => dias(x.vencimento, b.vencimento) - dias(y.vencimento, b.vencimento));
  return { parceiroId: parceiro.id, tituloId: cands[0]?.id ?? null };
}
