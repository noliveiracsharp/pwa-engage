-- Fluxo de Caixa: inclui títulos em aberto vencidos antes do período (entram como previstos no mês atual).
DROP FUNCTION IF EXISTS public.fn_financeiro_fluxo_caixa(date, date, uuid);
CREATE OR REPLACE FUNCTION public.fn_financeiro_fluxo_caixa(p_de date, p_ate date, p_empresa_id uuid DEFAULT NULL)
RETURNS TABLE (id uuid, tipo text, status text, vencimento date, pago_em date, valor numeric, valor_pago numeric, categoria text, descricao text, parceiro_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_empresa uuid := public.fin_rpc_empresa(p_empresa_id);
BEGIN
  IF v_empresa IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT t.id, t.tipo::text, t.status::text, t.vencimento::date, t.pago_em::date,
         COALESCE(t.valor,0)::numeric, COALESCE(t.valor_pago,0)::numeric, t.categoria::text, t.descricao::text, t.parceiro_id
    FROM public.financeiro_titulos t
   WHERE t.empresa_id = v_empresa AND t.status <> 'cancelado'
     AND ( (t.vencimento BETWEEN p_de AND p_ate)
        OR (t.pago_em IS NOT NULL AND t.pago_em BETWEEN p_de AND p_ate)
        OR (t.status <> 'pago' AND t.vencimento < p_de) );
END $$;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_fluxo_caixa(date, date, uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
