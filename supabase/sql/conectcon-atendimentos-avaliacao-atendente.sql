-- Atribui o atendente aos chamados avaliados/encerrados que ficaram sem responsável:
-- usa o último atendente que enviou mensagem (não interna) na conversa.
UPDATE public.atendimentos a
   SET usuario_responsavel_id = u.usuario_id
  FROM LATERAL (
    SELECT m.usuario_id FROM public.atendimentos_mensagem m
     WHERE m.atendimento_id = a.id AND m.usuario_id IS NOT NULL
       AND coalesce(m.msg_interna, false) = false
     ORDER BY m.created_at DESC LIMIT 1) u
 WHERE a.usuario_responsavel_id IS NULL;
