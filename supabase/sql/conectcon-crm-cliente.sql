-- CRM do Cliente (Etapa 1): interações comerciais por cliente/condomínio + linha do tempo 360°.
-- Rode no SQL Editor. Requer public.fin_rpc_empresa (conectcon-financeiro-procedures-seguranca.sql).

-- 1) Interações registradas pela equipe (e, na Etapa 2, pelo agente de WhatsApp).
CREATE TABLE IF NOT EXISTS public.crm_interacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  cliente_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  usuario_id uuid,
  tipo text NOT NULL DEFAULT 'nota'
    CHECK (tipo IN ('nota','visita','reuniao','ligacao','whatsapp','email','analise_ia')),
  texto text NOT NULL DEFAULT '',
  origem text NOT NULL DEFAULT 'sistema' CHECK (origem IN ('sistema','whatsapp_bot','legado_oferta')),
  proxima_acao_tipo text,
  proxima_acao_em timestamptz,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_interacoes_cliente ON public.crm_interacoes (empresa_id, cliente_id, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS idx_crm_interacoes_proxima ON public.crm_interacoes (empresa_id, proxima_acao_em) WHERE proxima_acao_em IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_interacoes TO authenticated;
GRANT ALL ON public.crm_interacoes TO service_role;
ALTER TABLE public.crm_interacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_interacoes_ler ON public.crm_interacoes;
CREATE POLICY crm_interacoes_ler ON public.crm_interacoes FOR SELECT TO authenticated
  USING (empresa_id = public.fin_rpc_empresa(empresa_id));
DROP POLICY IF EXISTS crm_interacoes_inserir ON public.crm_interacoes;
CREATE POLICY crm_interacoes_inserir ON public.crm_interacoes FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.fin_rpc_empresa(empresa_id));
DROP POLICY IF EXISTS crm_interacoes_alterar ON public.crm_interacoes;
CREATE POLICY crm_interacoes_alterar ON public.crm_interacoes FOR UPDATE TO authenticated
  USING (empresa_id = public.fin_rpc_empresa(empresa_id)) WITH CHECK (empresa_id = public.fin_rpc_empresa(empresa_id));
DROP POLICY IF EXISTS crm_interacoes_excluir ON public.crm_interacoes;
CREATE POLICY crm_interacoes_excluir ON public.crm_interacoes FOR DELETE TO authenticated
  USING (empresa_id = public.fin_rpc_empresa(empresa_id));

-- 2) Índices de apoio para a linha do tempo.
CREATE INDEX IF NOT EXISTS idx_orcamentos_parceiro ON public.orcamentos (parceiro_id);
DO $$ BEGIN
  IF to_regclass('public.laudos') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_laudos_parceiro ON public.laudos (parceiro_id)';
  END IF;
END $$;

-- 3) Linha do tempo 360°: interações + ofertas + histórico antigo das ofertas + laudos/visitas técnicas.
DROP FUNCTION IF EXISTS public.fn_crm_timeline(uuid, uuid, int);
CREATE OR REPLACE FUNCTION public.fn_crm_timeline(p_cliente_id uuid, p_empresa_id uuid DEFAULT NULL, p_limite int DEFAULT 300)
RETURNS TABLE (id text, origem text, tipo text, titulo text, texto text, ocorrido_em timestamptz,
               usuario_id uuid, ref_id uuid, editavel boolean, proxima_acao_tipo text, proxima_acao_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid := public.fin_rpc_empresa(p_empresa_id);
BEGIN
  IF v IS NULL OR p_cliente_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT * FROM (
    SELECT i.id::text, 'crm'::text, i.tipo, NULL::text, i.texto, i.ocorrido_em, i.usuario_id, NULL::uuid, true,
           i.proxima_acao_tipo, i.proxima_acao_em
      FROM public.crm_interacoes i WHERE i.empresa_id = v AND i.cliente_id = p_cliente_id
    UNION ALL
    SELECT 'of-' || o.id::text, 'oferta', 'oferta',
           'Oferta ' || COALESCE(to_jsonb(o)->>'numero', '') ||
             COALESCE(' · ' || NULLIF(to_jsonb(o)->>'situacao', ''), ''),
           COALESCE(to_jsonb(o)->>'titulo', to_jsonb(o)->>'descricao', ''),
           o.created_at, NULLIF(to_jsonb(o)->>'usuario_id', '')::uuid, o.id, false, NULL, NULL
      FROM public.orcamentos o WHERE o.empresa_id = v AND o.parceiro_id = p_cliente_id
    UNION ALL
    SELECT 'oi-' || x.id::text, 'oferta_historico', x.tipo,
           'Na oferta ' || COALESCE(to_jsonb(o)->>'numero', ''), x.descricao, x.created_at, x.usuario_id, o.id, false, NULL, NULL
      FROM public.orcamento_interacoes x JOIN public.orcamentos o ON o.id = x.orcamento_id
     WHERE o.empresa_id = v AND o.parceiro_id = p_cliente_id
  ) t
  ORDER BY 6 DESC
  LIMIT GREATEST(p_limite, 1);

  IF to_regclass('public.laudos') IS NOT NULL THEN
    RETURN QUERY EXECUTE
      'SELECT ''la-'' || l.id::text, ''laudo''::text, ''laudo''::text,
              COALESCE(to_jsonb(l)->>''tipo'', ''Visita técnica'') || COALESCE('' · '' || NULLIF(to_jsonb(l)->>''numero'', ''''), ''''),
              COALESCE(to_jsonb(l)->>''status'', ''''), l.created_at, NULL::uuid, l.id, false, NULL::text, NULL::timestamptz
         FROM public.laudos l WHERE l.empresa_id = $1 AND l.parceiro_id = $2
        ORDER BY l.created_at DESC LIMIT 100' USING v, p_cliente_id;
  END IF;
EXCEPTION WHEN undefined_column OR undefined_table THEN RETURN;
END $$;
REVOKE ALL ON FUNCTION public.fn_crm_timeline(uuid, uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_crm_timeline(uuid, uuid, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
