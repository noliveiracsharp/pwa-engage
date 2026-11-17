/** Regras puras de vertical (Corporativo x Condomínios) para perfis e funções. */
export type Vertical = "global" | "geral" | "condominio";
type Row = Record<string, unknown>;

const NOMES_CONDO = /^(s[ií]ndico|subs[ií]ndico|conselho|conselheiro|portaria|porteiro|morador)$/i;
const ROTAS_CONDO = ["/condominios", "/minha-unidade"];

export const ROTULO_VERTICAL: Record<Vertical, string> = {
  global: "Global",
  geral: "Corporativo",
  condominio: "Condomínios",
};

/** Vertical do perfil: coluna `vertical` quando existe; senão deduz pelo nome/ordem. */
export function verticalDoPerfil(p: Row): Vertical {
  const v = String(p["vertical"] ?? "");
  if (v === "global" || v === "geral" || v === "condominio") return v;
  if (Number(p["ordem"]) === 0) return "global";
  return NOMES_CONDO.test(String(p["descricao"] ?? "").trim()) ? "condominio" : "geral";
}

/** Vertical da função pela rota (dela ou da raiz): /condominios/* é Condomínios. */
export function verticalDaRota(path: unknown): Exclude<Vertical, "global"> {
  const p = String(path ?? "");
  return ROTAS_CONDO.some((r) => p === r || p.startsWith(r + "/")) ? "condominio" : "geral";
}

/** Perfis que a empresa ativa enxerga: padrões do sistema (sem empresa) + os dela; Master fica de fora. */
export function perfisDaEmpresa<T extends Row>(perfis: T[], empresaId: unknown): T[] {
  return perfis.filter(
    (p) =>
      verticalDoPerfil(p) !== "global" &&
      (!p["empresa_id"] || empresaId == null || String(p["empresa_id"]) === String(empresaId)),
  );
}
