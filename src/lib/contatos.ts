/** Regras puras dos contatos (telefones/e-mails) de Parceiros e Empresas. */
export const EMAIL_REGEX = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/i;

export function emailValido(v: string): boolean {
  const e = v.trim();
  return e.length <= 200 && !e.includes("..") && EMAIL_REGEX.test(e);
}

export function dominioEmail(v: string): string | null {
  return emailValido(v) ? v.trim().split("@")[1]!.toLowerCase() : null;
}

export const FINALIDADES = [
  { value: "comercial", label: "Comercial" },
  { value: "financeiro", label: "Financeiro / Cobrança" },
  { value: "fiscal", label: "Fiscal / NF-e" },
  { value: "geral", label: "Geral" },
] as const;
