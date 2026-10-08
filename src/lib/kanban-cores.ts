export const CORES_ETAPA = [
  { value: "padrao", label: "Padrão", className: "bg-muted-foreground" },
  { value: "azul", label: "Azul", className: "bg-primary" },
  { value: "ciano", label: "Ciano", className: "bg-stage-cyan" },
  { value: "verde", label: "Verde", className: "bg-success" },
  { value: "amarelo", label: "Amarelo", className: "bg-warning" },
  { value: "vermelho", label: "Vermelho", className: "bg-destructive" },
  { value: "violeta", label: "Violeta", className: "bg-stage-violet" },
  { value: "rosa", label: "Rosa", className: "bg-stage-pink" },
] as const;

export function corEtapa(value: unknown) {
  return CORES_ETAPA.find((cor) => cor.value === value) ?? CORES_ETAPA[0];
}

const BADGES_ETAPA = {
  padrao: "bg-muted text-muted-foreground",
  azul: "bg-primary/15 text-primary",
  ciano: "bg-stage-cyan/15 text-stage-cyan",
  verde: "bg-success text-success-foreground",
  amarelo: "bg-warning text-warning-foreground",
  vermelho: "bg-destructive text-destructive-foreground",
  violeta: "bg-stage-violet/15 text-stage-violet",
  rosa: "bg-stage-pink/15 text-stage-pink",
} as const;

export function badgeCorEtapa(value: unknown) {
  return BADGES_ETAPA[corEtapa(value).value];
}