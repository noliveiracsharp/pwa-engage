/** Regras puras da transferência de gestão de condomínio. */
export type SituacaoCnpj =
  | { situacao: "invalido" | "livre" }
  | { situacao: "meu"; condominio_id: string; nome: string }
  | { situacao: "outra"; condominio_id: string; nome: string; administradora: string | null; pendente: boolean };

export const soDigitos = (v: string) => v.replace(/\D/g, "");

/** O que a tela deve oferecer para o CNPJ digitado. */
export function acaoParaCnpj(s: SituacaoCnpj | null): "cadastrar" | "solicitar" | "aguardar" | "ja_meu" | "nada" {
  if (!s || s.situacao === "invalido") return "nada";
  if (s.situacao === "livre") return "cadastrar";
  if (s.situacao === "meu") return "ja_meu";
  return s.situacao === "outra" && s.pendente ? "aguardar" : "solicitar";
}

/** Quem pode agir numa solicitação pendente. */
export function acoesPermitidas(t: { status: string; empresa_origem_id: string | null; empresa_destino_id: string }, minha: string) {
  if (t.status !== "pendente") return [] as ("aprovar" | "recusar" | "cancelar")[];
  if (minha === t.empresa_origem_id) return ["aprovar", "recusar"] as const;
  if (minha === t.empresa_destino_id) return ["cancelar"] as const;
  return [];
}
