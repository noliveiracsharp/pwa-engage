/** Formata nomes/razões sociais: "A CASA DO MICRO LTDA" -> "A Casa do Micro LTDA". */
const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos", "para", "com", "por", "a", "o", "as", "os", "à", "ao", "aos"]);
const SIGLAS = new Set(["LTDA", "ME", "EPP", "EIRELI", "SA", "S.A.", "S/A", "S.A", "SS", "MEI", "SLU", "CIA", "EI", "ONG", "CNPJ", "CPF", "TI", "RH", "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII"]);

function capital(p: string): string {
  return p.replace(/^(\p{L})(.*)$/u, (_, a: string, b: string) => a.toUpperCase() + b);
}

export function nomeProprio(texto: unknown): string {
  const s = String(texto ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.split(" ").map((orig, i) => {
    const up = orig.toUpperCase();
    if (SIGLAS.has(up.replace(/[,;]$/, ""))) return up;
    const low = orig.toLowerCase();
    if (i > 0 && MINUSCULAS.has(low)) return low;
    // trata hífen e apóstrofo: "SANTA-RITA" -> "Santa-Rita", "D'AGUA" -> "D'Agua"
    return low.split(/([-'’])/).map(capital).join("");
  }).join(" ");
}
