/** Regras puras do módulo Meu Condomínio (links de contato e navegação). */
export const digitos = (v: string) => v.replace(/\D/g, "");

/** Link tel: — mantém números curtos de emergência (190, 193) como estão. */
export function linkTelefone(v: string): string | null {
  const d = digitos(v);
  if (d.length < 3) return null;
  return `tel:${d.length >= 10 && !d.startsWith("0") && !d.startsWith("55") ? "+55" + d : d.length > 11 && d.startsWith("55") ? "+" + d : d}`;
}

/** Link do WhatsApp só para celulares brasileiros (DDD + 9 dígitos). */
export function linkWhats(v: string): string | null {
  let d = digitos(v);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 11) d = "55" + d;
  return d.length === 13 && d.startsWith("55") && d[4] === "9" ? `https://wa.me/${d}` : null;
}

export function linksRota(lat: number | null, lng: number | null, endereco: string) {
  const q = lat != null && lng != null ? `${lat},${lng}` : encodeURIComponent(endereco);
  return {
    maps: lat != null && lng != null ? `https://www.google.com/maps/dir/?api=1&destination=${q}` : `https://www.google.com/maps/search/?api=1&query=${q}`,
    waze: lat != null && lng != null ? `https://waze.com/ul?ll=${q}&navigate=yes` : `https://waze.com/ul?q=${q}&navigate=yes`,
  };
}

export const TIPOS_CONTATO = [
  { value: "telefone", label: "Telefone" },
  { value: "email", label: "E-mail" },
  { value: "link", label: "Site / link" },
  { value: "texto", label: "Informação" },
];

export const EMERGENCIAS = [
  { titulo: "Polícia Militar", valor: "190" },
  { titulo: "SAMU", valor: "192" },
  { titulo: "Bombeiros", valor: "193" },
  { titulo: "Defesa Civil", valor: "199" },
];
