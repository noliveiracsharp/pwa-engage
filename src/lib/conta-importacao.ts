/** Leitura local (sem IA) de boletos, contas de consumo (PDF) e NF-e (XML) para Contas a Pagar. */

export type ParcelaLida = { vencimento: string; valor: number };
export type ContaLida = {
  origem: "boleto" | "consumo" | "nfe" | "pdf";
  cnpj: string | null;
  fornecedor: string | null;
  numero: string | null;
  emissao: string | null;
  linhaDigitavel: string | null;
  total: number | null;
  parcelas: ParcelaLida[];
};

const so = (s: string) => s.replace(/\D/g, "");
const brl = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const br2iso = (s: string) => { const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

/** Vencimento pelo fator do boleto. Desde 22/02/2025 o fator recomeçou em 1000. */
export function vencimentoDoFator(fator: number): string | null {
  if (!fator) return null;
  return iso(new Date(Date.UTC(2025, 1, 22) + (fator - 1000) * 86400000));
}

/** Decodifica linha digitável de boleto bancário (47) ou de arrecadação/consumo (48). */
export function lerLinhaDigitavel(linha: string): { tipo: "boleto" | "consumo"; linha: string; valor: number | null; vencimento: string | null } | null {
  const d = so(linha);
  if (d.length === 47) {
    const fator = Number(d.slice(33, 37));
    const valor = Number(d.slice(37, 47)) / 100;
    return { tipo: "boleto", linha: d, valor: valor || null, vencimento: vencimentoDoFator(fator) };
  }
  if (d.length === 48 && d[0] === "8") {
    const barras = [0, 12, 24, 36].map((i) => d.slice(i, i + 11)).join("");
    const valor = ["6", "7"].includes(d[2] ?? "") ? Number(barras.slice(4, 15)) / 100 : null;
    return { tipo: "consumo", linha: d, valor: valor || null, vencimento: null };
  }
  return null;
}

/** Procura uma linha digitável (com ou sem pontuação) dentro de um texto. */
export function acharLinhaDigitavel(texto: string): string | null {
  const cand = texto.match(/[\d][\d.\s-]{44,70}\d/g) ?? [];
  for (const c of cand) {
    const d = so(c);
    if (d.length === 47 || (d.length === 48 && d[0] === "8")) return d;
  }
  return null;
}

/** Lê o texto de um PDF de boleto ou conta. */
export function lerTextoConta(texto: string): ContaLida {
  const ld = acharLinhaDigitavel(texto);
  const dec = ld ? lerLinhaDigitavel(ld) : null;
  const venc = texto.match(/vencimento[^\d]{0,40}(\d{2}\/\d{2}\/\d{4})/i);
  const val = texto.match(/(?:valor (?:do documento|cobrado|a pagar)|total a pagar)[^\d]{0,30}([\d.]+,\d{2})/i);
  const cnpj = texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  const vencimento = dec?.vencimento ?? (venc ? br2iso(venc[1] ?? "") : null);
  const valor = dec?.valor ?? (val ? brl(val[1] ?? "") : null);
  return {
    origem: dec?.tipo ?? "pdf", cnpj: cnpj ? so(cnpj[0]) : null, fornecedor: null, numero: null, emissao: null,
    linhaDigitavel: dec?.linha ?? null, total: valor,
    parcelas: vencimento && valor ? [{ vencimento, valor }] : [],
  };
}

const tag = (xml: string, t: string) => xml.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1]?.trim() ?? null;

/** Lê o XML de uma NF-e: emitente, número, total e duplicatas (parcelas). */
export function lerXmlNfe(xml: string): ContaLida | null {
  if (!/<infNFe/i.test(xml)) return null;
  const emit = xml.match(/<emit>([\s\S]*?)<\/emit>/)?.[1] ?? "";
  const total = Number(tag(xml.match(/<ICMSTot>([\s\S]*?)<\/ICMSTot>/)?.[1] ?? "", "vNF") ?? 0) || null;
  const emissao = (tag(xml, "dhEmi") ?? tag(xml, "dEmi"))?.slice(0, 10) ?? null;
  const parcelas = [...xml.matchAll(/<dup>([\s\S]*?)<\/dup>/g)].map((m) => ({
    vencimento: tag(m[1] ?? "", "dVenc") ?? "", valor: Number(tag(m[1] ?? "", "vDup") ?? 0),
  })).filter((p) => p.vencimento && p.valor > 0);
  return {
    origem: "nfe", cnpj: tag(emit, "CNPJ") ?? tag(emit, "CPF"), fornecedor: tag(emit, "xNome"),
    numero: tag(xml, "nNF"), emissao, linhaDigitavel: null, total,
    parcelas: parcelas.length ? parcelas : total && emissao ? [{ vencimento: emissao, valor: total }] : [],
  };
}
