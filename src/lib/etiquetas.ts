/** Etiqueta sem quadro (kanban_id vazio) é global; com quadro só aparece nele. */
export const TODOS_QUADROS = "__todos";

export function etiquetasDoQuadro<T extends Record<string, unknown>>(etiquetas: T[], kanbanId: string | null | undefined): T[] {
  const k = String(kanbanId ?? "");
  return etiquetas.filter((e) => {
    const q = String(e["kanban_id"] ?? "");
    return !q || q === k;
  });
}
