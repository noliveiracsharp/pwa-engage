-- Procedures das listas de pesquisa (Contas a Pagar/Receber, Cartões, Baixa, Ofertas).
-- Requer public.fin_rpc_empresa (conectcon-financeiro-procedures-seguranca.sql).

-- Títulos a pagar/receber por período de vencimento (abas do Financeiro e inbox DDA).
CREATE OR REPLACE FUNCTION public.fn_financeiro_titulos_lista(p_tipo text, p_de date DEFAULT NULL, p_ate date DEFAULT NULL, p_empresa_id uuid DEFAULT NULL)
RETURNS SETOF public.financeiro_titulos
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid := public.fin_rpc_empresa(p_empresa_id);
BEGIN
  IF v IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT t.* FROM public.financeiro_titulos t
    WHERE t.empresa_id = v AND t.tipo = p_tipo
      AND (p_de IS NULL OR t.vencimento >= p_de)
      AND (p_ate IS NULL OR t.vencimento <= p_ate)
    ORDER BY t.vencimento, t.id;
END $$;

-- Títulos lançados em cartão de crédito (limite usado e gráfico de faturas).
CREATE OR REPLACE FUNCTION public.fn_financeiro_titulos_cartao(p_empresa_id uuid DEFAULT NULL)
RETURNS SETOF public.financeiro_titulos
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid := public.fin_rpc_empresa(p_empresa_id);
BEGIN
  IF v IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT t.* FROM public.financeiro_titulos t
    WHERE t.empresa_id = v AND t.cartao_id IS NOT NULL
    ORDER BY t.vencimento, t.id;
END $$;

-- Títulos pagos a partir de N meses atrás (cálculo de tarifa na baixa).
CREATE OR REPLACE FUNCTION public.fn_financeiro_pagos_meses(p_meses int DEFAULT 24, p_empresa_id uuid DEFAULT NULL)
RETURNS SETOF public.financeiro_titulos
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid := public.fin_rpc_empresa(p_empresa_id);
BEGIN
  IF v IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT t.* FROM public.financeiro_titulos t
    WHERE t.empresa_id = v AND t.status = 'pago'
      AND t.pago_em >= (date_trunc('month', CURRENT_DATE) - make_interval(months => GREATEST(p_meses, 0)))::date
    ORDER BY t.pago_em, t.id;
END $$;

-- Ofertas da empresa em contexto (lista do módulo Ofertas).
CREATE OR REPLACE FUNCTION public.fn_orcamentos_lista(p_empresa_id uuid DEFAULT NULL)
RETURNS SETOF public.orcamentos
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid := public.fin_rpc_empresa(p_empresa_id);
BEGIN
  IF v IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT o.* FROM public.orcamentos o WHERE o.empresa_id = v ORDER BY o.id;
END $$;

-- Itens das Ofertas da empresa em contexto.
CREATE OR REPLACE FUNCTION public.fn_orcamentos_itens(p_empresa_id uuid DEFAULT NULL)
RETURNS SETOF public.orcamento_itens
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid := public.fin_rpc_empresa(p_empresa_id);
BEGIN
  IF v IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT i.* FROM public.orcamento_itens i
    WHERE i.orcamento_id IN (SELECT o.id FROM public.orcamentos o WHERE o.empresa_id = v)
    ORDER BY i.id;
END $$;

REVOKE ALL ON FUNCTION public.fn_financeiro_titulos_lista(text, date, date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_financeiro_titulos_cartao(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_financeiro_pagos_meses(int, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_orcamentos_lista(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_orcamentos_itens(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_titulos_lista(text, date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_titulos_cartao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_pagos_meses(int, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_orcamentos_lista(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_orcamentos_itens(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
