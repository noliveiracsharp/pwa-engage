-- Etapas com nome de encerramento passam a contar como encerradas; lista/busca também olham o status.
update public.kanban_etapas set is_default_encerrado = true
where lower(descricao) ~ '(encerr|finaliz|fechad|conclu|resolvid)' and is_default_encerrado is distinct from true;
-- (funções fn_atendimentos_ativos / fn_atendimentos_buscar: ver script enviado no chat)
