-- Procedures dos relatórios (DRE Gerencial, Cockpit de KPIs, Comissões).
-- Requer public.fin_rpc_empresa (conectcon-financeiro-procedures-seguranca.sql).

CREATE INDEX IF NOT EXISTS idx_fin_titulos_empresa_competencia ON public.financeiro_titulos (empresa_id, data_competencia);
CREATE INDEX IF NOT EXISTS idx_fin_titulos_empresa_origem ON public.financeiro_titulos (empresa_id, origem_tipo, tipo);
CREATE INDEX IF NOT EXISTS idx_fin_titulos_itens_titulo ON public.financeiro_titulos_itens (titulo_id);

-- Títulos com vencimento, pagamento ou competência no período.
CREATE OR REPLACE FUNCTION public.fn_financeiro_titulos_periodo(p_empresa_id uuid DEFAULT NULL, p_de date DEFAULT NULL, p_ate date DEFAULT NULL)
RETURNS SETOF public.financeiro_titulos
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid := public.fin_rpc_empresa(p_empresa_id);
BEGIN
  IF v IS NULL OR p_de IS NULL OR p_ate IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT t.* FROM public.financeiro_titulos t WHERE t.empresa_id = v AND t.vencimento BETWEEN p_de AND p_ate
    UNION
    SELECT t.* FROM public.financeiro_titulos t WHERE t.empresa_id = v AND t.pago_em BETWEEN p_de AND p_ate
    UNION
    SELECT t.* FROM public.financeiro_titulos t WHERE t.empresa_id = v AND t.data_competencia BETWEEN p_de AND p_ate;
END $$;

-- Linhas de rateio dos títulos do período.
CREATE OR REPLACE FUNCTION public.fn_financeiro_titulos_itens_periodo(p_empresa_id uuid DEFAULT NULL, p_de date DEFAULT NULL, p_ate date DEFAULT NULL)
RETURNS SETOF public.financeiro_titulos_itens
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.* FROM public.financeiro_titulos_itens i
  WHERE i.titulo_id IN (SELECT id FROM public.fn_financeiro_titulos_periodo(p_empresa_id, p_de, p_ate));
$$;

-- Títulos a receber gerados por Ofertas (base das comissões).
CREATE OR REPLACE FUNCTION public.fn_financeiro_titulos_ofertas(p_empresa_id uuid DEFAULT NULL)
RETURNS SETOF public.financeiro_titulos
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid := public.fin_rpc_empresa(p_empresa_id);
BEGIN
  IF v IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT t.* FROM public.financeiro_titulos t
    WHERE t.empresa_id = v AND t.tipo = 'receber' AND t.origem_tipo = 'oferta' AND t.origem_id IS NOT NULL;
END $$;

REVOKE ALL ON FUNCTION public.fn_financeiro_titulos_periodo(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_financeiro_titulos_itens_periodo(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_financeiro_titulos_ofertas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_titulos_periodo(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_titulos_itens_periodo(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_titulos_ofertas(uuid) TO authenticated;

ANALYZE public.financeiro_titulos;
NOTIFY pgrst, 'reload schema';
