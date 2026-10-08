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