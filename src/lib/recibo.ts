const UN = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CEM = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100), r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CEM[c]!);
  if (r < 20) { if (r) partes.push(UN[r]!); }
  else { const d = Math.floor(r / 10), u = r % 10; partes.push(u ? `${DEZ[d]} e ${UN[u]}` : DEZ[d]!); }
  return partes.join(" e ");
}

function inteiro(n: number): string {
  if (n === 0) return "zero";
  const mi = Math.floor(n / 1_000_000), mil = Math.floor((n % 1_000_000) / 1000), r = n % 1000;
  const partes: string[] = [];
  if (mi) partes.push(mi === 1 ? "um milhão" : `${inteiro(mi)} milhões`);
  if (mil) partes.push(mil === 1 ? "mil" : `${ate999(mil)} mil`);
  if (r) partes.push(ate999(r));
  if (partes.length > 1) {
    const ultimo = partes.pop()!;
    const usaE = r > 0 && (r < 100 || r % 100 === 0);
    return `${partes.join(", ")}${usaE ? " e " : ", "}${ultimo}`;
  }
  return partes[0]!;
}

/** Valor em reais por extenso: 9520.22 → "nove mil, quinhentos e vinte reais e vinte e dois centavos". */
export function valorPorExtenso(valor: number): string {
  const total = Math.round(Math.abs(valor) * 100);
  const reais = Math.floor(total / 100), cent = total % 100;
  const sReais = reais ? `${inteiro(reais)}${reais % 1_000_000 === 0 && reais >= 1_000_000 ? " de" : ""} ${reais === 1 ? "real" : "reais"}` : "";
  const sCent = cent ? `${inteiro(cent)} ${cent === 1 ? "centavo" : "centavos"}` : "";
  if (!sReais && !sCent) return "zero real";
  return [sReais, sCent].filter(Boolean).join(" e ");
}
