CREATE INDEX IF NOT EXISTS idx_atendimentos_empresa_updated ON public.atendimentos (empresa_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_atendimentos_empresa_status ON public.atendimentos (empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_atendimentos_responsavel ON public.atendimentos (usuario_responsavel_id);
CREATE INDEX IF NOT EXISTS idx_atendimentos_msg_atendimento ON public.atendimentos_mensagem (atendimento_id, created_at);
CREATE INDEX IF NOT EXISTS idx_atendimentos_msg_ultimas ON public.atendimentos_mensagem (oculta_para_atendente, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atendimentos_participantes_at ON public.atendimentos_participantes (atendimento_id);
CREATE INDEX IF NOT EXISTS idx_atendimentos_etiqueta_at ON public.atendimentos_etiqueta (atendimento_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_empresa ON public.pessoas (empresa_id);
