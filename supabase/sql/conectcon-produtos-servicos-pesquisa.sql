-- Execute no SQL Editor do banco próprio. Não altera dados nem políticas RLS.
-- Requer as funções de identidade existentes app_is_master / app_usuario_empresa_id.
SET search_path = public, extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_itens_empresa_descricao_id ON public.itens (empresa_id, descricao, id);
CREATE INDEX IF NOT EXISTS idx_itens_empresa_categoria_status ON public.itens (empresa_id, categoria, status);
CREATE INDEX IF NOT EXISTS idx_itens_busca_trgm ON public.itens USING gin
  (lower(coalesce(codigo, '') || ' ' || coalesce(descricao, '') || ' ' || coalesce(modelo, '') || ' ' || coalesce(tipo, '') || ' ' || coalesce(categoria, '')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_itens_marcas_busca_trgm ON public.itens_marcas USING gin (lower(descricao) gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.fn_itens_lista(
  p_empresa_id uuid DEFAULT NULL, p_busca text DEFAULT '', p_tipos text[] DEFAULT '{}',
  p_categoria text DEFAULT 'todos', p_status text DEFAULT 'todos',
  p_limite integer DEFAULT 50, p_offset integer DEFAULT 0,
  p_ordem text DEFAULT 'descricao', p_direcao text DEFAULT 'asc'
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v uuid := public.app_usuario_empresa_id();
  mestre boolean := coalesce(public.app_is_master(), false);
  pai uuid;
  busca text := lower(trim(coalesce(p_busca, '')));
  resultado jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária' USING ERRCODE = '42501'; END IF;
  IF NOT mestre AND NOT EXISTS (
    WITH RECURSIVE acessiveis AS (
      SELECT f.id FROM public.funcoes f WHERE f.path = '/itens' AND f.status IS DISTINCT FROM false
      UNION
      SELECT f.id FROM public.funcoes f JOIN acessiveis a ON f.funcoes_pai_id = a.id
      WHERE f.status IS DISTINCT FROM false
    )
    SELECT 1 FROM public.usuarios u
    JOIN public.menu m ON m.perfil_id = u.perfil_id
    JOIN acessiveis f ON f.id = m.funcoes_id
    WHERE (u.id::text = auth.uid()::text OR to_jsonb(u)->>'auth_user_id' = auth.uid()::text
      OR lower(u.email) = lower(auth.jwt()->>'email'))
      AND m.can_read IS TRUE
  ) THEN RAISE EXCEPTION 'Sem permissão para Produtos e Serviços' USING ERRCODE = '42501'; END IF;
  IF NOT mestre AND p_empresa_id IS NOT NULL AND p_empresa_id IS DISTINCT FROM v THEN
    RAISE EXCEPTION 'Empresa não autorizada' USING ERRCODE = '42501';
  END IF;
  IF mestre THEN v := p_empresa_id; END IF;
  IF NOT mestre AND v IS NULL THEN RAISE EXCEPTION 'Empresa não identificada' USING ERRCODE = '42501'; END IF;
  IF length(busca) > 200 OR p_limite NOT BETWEEN 1 AND 1000 OR p_offset < 0
    OR p_limite IS NULL OR p_offset IS NULL
    OR coalesce(p_status, '') NOT IN ('todos', 'ativo', 'inativo')
    OR coalesce(p_ordem, '') NOT IN ('codigo', 'descricao', 'tipo', 'categoria', 'marca', 'preco_venda', 'status')
    OR coalesce(p_direcao, '') NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'Parâmetros de pesquisa inválidos';
  END IF;
  SELECT e.empresa_pai_id INTO pai FROM public.empresas e
    JOIN public.empresas matriz ON matriz.id = e.empresa_pai_id
    WHERE e.id = v AND matriz.compartilhar_catalogo_filiais IS TRUE;

  WITH filtrados AS MATERIALIZED (
    SELECT i.*, to_jsonb(m) AS __marca
    FROM public.itens i LEFT JOIN public.itens_marcas m ON m.id = i.itens_marcas_id
      AND (m.empresa_id = i.empresa_id OR m.empresa_id = v OR m.empresa_id IS NULL)
    WHERE (mestre AND v IS NULL OR i.empresa_id = v OR i.empresa_id = pai OR mestre AND i.empresa_id IS NULL)
      AND (coalesce(cardinality(p_tipos), 0) = 0 OR i.tipo = ANY(p_tipos))
      AND (p_categoria = 'todos' OR p_categoria = '__sem_categoria__' AND trim(coalesce(i.categoria, '')) = '' OR i.categoria = p_categoria)
      AND (p_status = 'todos' OR p_status = 'ativo' AND i.status IS TRUE OR p_status = 'inativo' AND i.status IS FALSE)
      AND (busca = '' OR lower(coalesce(i.codigo, '') || ' ' || coalesce(i.descricao, '') || ' ' || coalesce(i.modelo, '') || ' ' || coalesce(i.tipo, '') || ' ' || coalesce(i.categoria, '')) LIKE '%' || replace(replace(replace(busca, '\', '\\'), '%', '\%'), '_', '\_') || '%'
        OR lower(m.descricao) LIKE '%' || replace(replace(replace(busca, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  ), pagina AS (
    SELECT f.* FROM filtrados f ORDER BY
      CASE WHEN p_direcao = 'asc' THEN CASE p_ordem WHEN 'marca' THEN f.__marca->>'descricao' WHEN 'codigo' THEN f.codigo WHEN 'descricao' THEN f.descricao WHEN 'tipo' THEN f.tipo WHEN 'categoria' THEN f.categoria END END ASC NULLS LAST,
      CASE WHEN p_direcao = 'desc' THEN CASE p_ordem WHEN 'marca' THEN f.__marca->>'descricao' WHEN 'codigo' THEN f.codigo WHEN 'descricao' THEN f.descricao WHEN 'tipo' THEN f.tipo WHEN 'categoria' THEN f.categoria END END DESC NULLS LAST,
      CASE WHEN p_ordem = 'preco_venda' AND p_direcao = 'asc' THEN f.preco_venda END ASC NULLS LAST,
      CASE WHEN p_ordem = 'preco_venda' AND p_direcao = 'desc' THEN f.preco_venda END DESC NULLS LAST,
      CASE WHEN p_ordem = 'status' AND p_direcao = 'asc' THEN f.status END ASC NULLS LAST,
      CASE WHEN p_ordem = 'status' AND p_direcao = 'desc' THEN f.status END DESC NULLS LAST,
      f.id LIMIT p_limite OFFSET p_offset
  ) SELECT jsonb_build_object('rows', coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM pagina p), '[]'::jsonb),
      'total', (SELECT count(*) FROM filtrados)) INTO resultado;
  RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.fn_itens_lista(uuid,text,text[],text,text,integer,integer,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_itens_lista(uuid,text,text[],text,text,integer,integer,text,text) TO authenticated;
ANALYZE public.itens;
ANALYZE public.itens_marcas;
NOTIFY pgrst, 'reload schema';