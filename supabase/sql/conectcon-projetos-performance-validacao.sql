-- Projetos: carregamento rápido, finalidade do espaço e validação de erros por quem abriu.
-- Rode no SQL Editor. Requer public.fin_rpc_empresa (conectcon-financeiro-procedures-seguranca.sql).

-- 1) Novas colunas
ALTER TABLE public.projetos_espacos ADD COLUMN IF NOT EXISTS finalidade text NOT NULL DEFAULT 'projetos';
ALTER TABLE public.projetos_tarefas ADD COLUMN IF NOT EXISTS criado_por uuid;
ALTER TABLE public.projetos_tarefas ADD COLUMN IF NOT EXISTS status_alterado_em timestamptz;

-- 2) Índices
CREATE INDEX IF NOT EXISTS idx_projetos_tarefas_empresa ON public.projetos_tarefas (empresa_id);
CREATE INDEX IF NOT EXISTS idx_projetos_tarefas_espaco ON public.projetos_tarefas (espaco_id);
CREATE INDEX IF NOT EXISTS idx_projetos_tarefas_projeto ON public.projetos_tarefas (projeto_id);
CREATE INDEX IF NOT EXISTS idx_projetos_tarefas_status ON public.projetos_tarefas (status_id);
CREATE INDEX IF NOT EXISTS idx_projetos_atividades_tarefa ON public.projetos_atividades (tarefa_id);
CREATE INDEX IF NOT EXISTS idx_projetos_eventos_usuario ON public.projetos_eventos (usuario_id, created_at DESC);

-- 3) Lista de tarefas: abertas + concluídas nos últimos p_dias (ou todas) + a tarefa pedida por link.
DROP FUNCTION IF EXISTS public.fn_projetos_tarefas_lista(boolean, int, uuid, uuid);
CREATE OR REPLACE FUNCTION public.fn_projetos_tarefas_lista(
  p_incluir_concluidas boolean DEFAULT false, p_dias int DEFAULT 15, p_tarefa_id uuid DEFAULT NULL, p_empresa_id uuid DEFAULT NULL)
RETURNS SETOF public.projetos_tarefas
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid := public.fin_rpc_empresa(p_empresa_id);
BEGIN
  IF v IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT t.* FROM public.projetos_tarefas t
  LEFT JOIN public.projetos_status s ON s.id = t.status_id
  WHERE t.empresa_id = v
    AND (
      p_incluir_concluidas
      OR t.id = p_tarefa_id
      OR COALESCE(s.tipo, '') <> 'concluido'
      OR COALESCE(t.status_alterado_em, now()) >= now() - make_interval(days => GREATEST(p_dias, 0))
    )
  ORDER BY t.ordem NULLS LAST, t.id;
END $$;
REVOKE ALL ON FUNCTION public.fn_projetos_tarefas_lista(boolean, int, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_projetos_tarefas_lista(boolean, int, uuid, uuid) TO authenticated;

-- 4) Aviso para quem abriu a tarefa sempre que outra pessoa muda o status.
CREATE OR REPLACE FUNCTION public.trg_projetos_tarefa_status_aviso() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j jsonb := to_jsonb(NEW);
  v_status text; v_tipo text; v_titulo text;
BEGIN
  IF NEW.status_id IS NOT DISTINCT FROM OLD.status_id THEN RETURN NEW; END IF;
  NEW.status_alterado_em := now();
  IF NEW.criado_por IS NULL OR NEW.criado_por = COALESCE(NEW.alterado_por, auth.uid()) THEN RETURN NEW; END IF;
  SELECT COALESCE(to_jsonb(s)->>'descricao', to_jsonb(s)->>'nome', 'novo status'), s.tipo
    INTO v_status, v_tipo FROM public.projetos_status s WHERE s.id = NEW.status_id;
  v_titulo := COALESCE(j->>'nome', j->>'titulo', j->>'descricao', 'tarefa');
  INSERT INTO public.projetos_eventos (empresa_id, usuario_id, autor_id, projeto_id, tarefa_id, tipo, acao, descricao)
  VALUES (NEW.empresa_id, NEW.criado_por, COALESCE(NEW.alterado_por, auth.uid()), NULLIF(j->>'projeto_id','')::uuid, NEW.id, 'tarefa',
    CASE WHEN v_tipo = 'validacao' THEN 'validar' ELSE 'status' END,
    CASE WHEN v_tipo = 'validacao'
      THEN 'A tarefa "' || v_titulo || '" que você abriu está pronta para validação. Abra para aprovar ou reabrir.'
      ELSE 'A tarefa "' || v_titulo || '" que você abriu mudou para ' || COALESCE(v_status, 'sem status') || '.' END);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW; -- aviso nunca bloqueia a gravação
END $$;
DROP TRIGGER IF EXISTS projetos_tarefa_status_aviso ON public.projetos_tarefas;
CREATE TRIGGER projetos_tarefa_status_aviso BEFORE UPDATE OF status_id ON public.projetos_tarefas
  FOR EACH ROW EXECUTE FUNCTION public.trg_projetos_tarefa_status_aviso();

NOTIFY pgrst, 'reload schema';
