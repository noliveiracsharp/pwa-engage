-- Financeiro: leituras só por procedures (rode uma vez no SQL Editor; pode rodar de novo).
-- SECURITY INVOKER: as permissões (RLS) de cada tabela continuam valendo, então cada usuário
-- só enxerga a própria empresa. Filtros (empresa, tipo, série, título) são aplicados sobre a
-- procedure e o Postgres os leva para dentro da consulta, usando os índices abaixo.
-- Tabelas que não existirem no seu banco são ignoradas.
do $$
declare t text;
begin
  foreach t in array array['financeiro_titulos','financeiro_titulos_itens','orcamento_itens',
                           'pedidos_compra_itens','cobranca_regua','cobranca_envios','itens'] loop
    if to_regclass('public.' || t) is not null then
      execute format(
        'create or replace function public.%I() returns setof public.%I
           language sql stable security invoker set search_path = public as $f$ table public.%I $f$',
        'fn_lista_' || t, t, t);
      execute format('revoke all on function public.%I() from public, anon', 'fn_lista_' || t);
      execute format('grant execute on function public.%I() to authenticated', 'fn_lista_' || t);
    end if;
  end loop;
end $$;

-- Índices das buscas de série/parcelas e itens de rateio.
do $$
begin
  if to_regclass('public.financeiro_titulos') is not null then
    create index if not exists idx_fin_titulos_serie on public.financeiro_titulos (empresa_id, tipo, origem_tipo, origem_id);
  end if;
  if to_regclass('public.financeiro_titulos_itens') is not null then
    create index if not exists idx_fin_titulos_itens_titulo on public.financeiro_titulos_itens (titulo_id);
  end if;
  if to_regclass('public.orcamento_itens') is not null then
    create index if not exists idx_orcamento_itens_orc on public.orcamento_itens (orcamento_id);
  end if;
  if to_regclass('public.pedidos_compra_itens') is not null then
    create index if not exists idx_pedidos_compra_itens_ped on public.pedidos_compra_itens (pedido_id);
  end if;
end $$;

notify pgrst, 'reload schema';
