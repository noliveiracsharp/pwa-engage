/**
 * Acesso a quadros Kanban por PERFIL (tabela perfil_kanban).
 * Regra: Master vê tudo; quadro sem nenhum perfil marcado é visível a todos;
 * quadro com perfis marcados só aparece para esses perfis.
 */
export type VinculoPerfilKanban = { kanban_nome_id: string; perfil_id: string };

export function kanbanPermitido(
  kanbanId: string,
  perfilId: string | null,
  vinculos: VinculoPerfilKanban[],
  isMaster: boolean,
): boolean {
  if (isMaster) return true;
  const doQuadro = vinculos.filter((v) => v.kanban_nome_id === kanbanId);
  if (doQuadro.length === 0) return true;
  return !!perfilId && doQuadro.some((v) => v.perfil_id === perfilId);
}
