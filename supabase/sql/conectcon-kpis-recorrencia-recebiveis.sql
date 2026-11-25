-- Carteira migrada: nenhuma Oferta/contrato é criado ou alterado.
-- Execute no SQL Editor do banco próprio. Requer fin_rpc_empresa já instalado.
CREATE INDEX IF NOT EXISTS idx_fin_titulos_empresa_vencimento ON public.financeiro_titulos (empresa_id, vencimento);

CREATE OR REPLACE FUNCTION public.fn_financeiro_recorrencia_mensal(
  p_empresa_id uuid DEFAULT NULL, p_de date DEFAULT NULL, p_ate date DEFAULT NULL,
  p_classificacao text DEFAULT 'Mensalidade'
)
RETURNS TABLE (mes date, cliente_id uuid, valor_mensal numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid := public.fin_rpc_empresa(p_empresa_id);
BEGIN
  IF v IS NULL OR p_de IS NULL OR p_ate IS NULL OR p_de > p_ate THEN RETURN; END IF;
  IF coalesce(trim(p_classificacao), '') = '' THEN
    RAISE EXCEPTION 'Informe a identificação das mensalidades';
  END IF;
  RETURN QUERY
    SELECT date_trunc('month', t.vencimento)::date,
      coalesce(t.cliente_atendido_id, t.parceiro_id), sum(t.valor)::numeric
    FROM public.financeiro_titulos t
    WHERE t.empresa_id = v AND t.tipo = 'receber'
      AND t.vencimento >= date_trunc('month', p_de)::date
      AND t.vencimento < (date_trunc('month', p_ate) + interval '1 month')::date
      AND coalesce(t.status, '') NOT IN ('cancelado', 'cancelada', 'estornado', 'estornada')
      AND t.valor > 0 AND coalesce(t.cliente_atendido_id, t.parceiro_id) IS NOT NULL
      -- Literal substring, not wildcard/regex: cannot accidentally match every row.
      AND strpos(lower(concat_ws(' ', t.categoria, t.descricao)), lower(trim(p_classificacao))) > 0
    GROUP BY 1, 2 ORDER BY 1, 2;
END $$;
REVOKE ALL ON FUNCTION public.fn_financeiro_recorrencia_mensal(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_financeiro_recorrencia_mensal(uuid, date, date, text) TO authenticated;
ANALYZE public.financeiro_titulos;
NOTIFY pgrst, 'reload schema';