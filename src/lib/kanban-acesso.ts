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

/**
 * Quem recebe o alerta de nova mensagem de cliente:
 * conversa atribuída → só o responsável; na fila → quem tem acesso ao quadro.
 */
export function deveNotificar(o: {
  kanbanId: string | null;
  responsavelId: string | null;
  usuarioId: string | null;
  perfilId: string | null;
  vinculos: VinculoPerfilKanban[];
  isMaster: boolean;
}): boolean {
  if (o.responsavelId) return !!o.usuarioId && o.responsavelId === o.usuarioId;
  if (!o.kanbanId) return o.isMaster;
  return kanbanPermitido(o.kanbanId, o.perfilId, o.vinculos, o.isMaster);
}
