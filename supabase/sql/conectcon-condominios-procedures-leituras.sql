-- Condomínios: leituras só por procedures (rode uma vez no SQL Editor; pode rodar de novo).
-- Cria fn_lista_<tabela> para TODA tabela cond_* existente no seu banco.
-- SECURITY INVOKER: as permissões (RLS) atuais de cada tabela continuam valendo
-- (morador só vê o que já via, gestão só o próprio condomínio). Os filtros do sistema
-- (condomínio, status, datas) são levados pelo Postgres para dentro da consulta.
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r','v','p') and c.relname like 'cond\_%'
  loop
    execute format(
      'create or replace function public.%I() returns setof public.%I
         language sql stable security invoker set search_path = public as $f$ table public.%I $f$',
      'fn_lista_' || t, t, t);
    execute format('revoke all on function public.%I() from public, anon', 'fn_lista_' || t);
    execute format('grant execute on function public.%I() to authenticated', 'fn_lista_' || t);
  end loop;
  if to_regclass('public.empresas') is not null then
    create or replace function public.fn_lista_empresas() returns setof public.empresas
      language sql stable security invoker set search_path = public as $f$ table public.empresas $f$;
    grant execute on function public.fn_lista_empresas() to authenticated;
  end if;
end $$;

notify pgrst, 'reload schema';
