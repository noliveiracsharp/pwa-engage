-- Leituras por procedure para TODAS as tabelas e views do schema public
-- (Ofertas, Kanban, Cotações, Chat interno, Projetos, Empresas, Usuários, Ajuda etc.).
-- Rode uma vez no SQL Editor; pode rodar de novo (e de novo sempre que criar tabelas).
-- SECURITY INVOKER: as permissões (RLS) atuais de cada tabela continuam valendo.
-- Os filtros do sistema são levados pelo Postgres para dentro da consulta.
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r','v','m','p')
              and length('fn_lista_' || c.relname) <= 63
  loop
    begin
      execute format(
        'create or replace function public.%I() returns setof public.%I
           language sql stable security invoker set search_path = public as $f$ table public.%I $f$',
        'fn_lista_' || t, t, t);
      execute format('revoke all on function public.%I() from public', 'fn_lista_' || t);
      execute format('grant execute on function public.%I() to authenticated, anon', 'fn_lista_' || t);
    exception when others then
      raise notice 'fn_lista_% ignorada: %', t, sqlerrm;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';
