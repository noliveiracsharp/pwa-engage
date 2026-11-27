-- Ofertas e Kanban: leituras só por procedures (rode uma vez no SQL Editor, antes de publicar).
-- SECURITY INVOKER: as permissões (RLS) atuais de cada tabela continuam valendo.
-- Idempotente: pode rodar de novo. Tabelas que não existirem no seu banco são ignoradas.

-- 1) Listas de cadastro usadas pelas Ofertas e pelo Kanban (filtros, ordem e paginação
--    continuam sendo aplicados pelo sistema sobre o resultado da procedure).
do $$
declare t text;
begin
  foreach t in array array['parceiros','usuarios','itens','unidade_medida','itens_marcas','empresas',
                           'kanban_nome','kanban_etapas','cotacoes'] loop
    if to_regclass('public.' || t) is not null then
      execute format(
        'create or replace function public.%I() returns setof public.%I
           language sql stable security invoker set search_path = public as $f$ table public.%I $f$',
        'fn_lista_' || t, t, t);
      execute format('grant execute on function public.%I() to authenticated', 'fn_lista_' || t);
    end if;
  end loop;
end $$;

-- 2) Normaliza texto para comparar situação da Oferta com o nome da etapa.
create or replace function public.fn_txt_norm(p text)
returns text language sql immutable set search_path = public as $$
  select lower(trim(translate(coalesce(p, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc')));
$$;

-- 3) Etapas de um quadro.
create or replace function public.fn_kanban_etapas_ids(p_kanban_id uuid)
returns setof uuid language sql stable security invoker set search_path = public as $$
  select e.id from public.kanban_etapas e
   where coalesce(to_jsonb(e)->>'kanban_nome_id', to_jsonb(e)->>'kanban_id', to_jsonb(e)->>'id_kanban') = p_kanban_id::text;
$$;
grant execute on function public.fn_kanban_etapas_ids(uuid) to authenticated;

create index if not exists idx_atendimentos_kanban_etapa on public.atendimentos (kanban_etapa_id);
create index if not exists idx_orcamentos_kanban_etapa on public.orcamentos (kanban_etapa_id);

-- 4) Cartões do quadro: só o que está nas etapas dele (antes o Kanban baixava as tabelas inteiras).
create or replace function public.fn_kanban_atendimentos(p_kanban_id uuid)
returns setof public.atendimentos language sql stable security invoker set search_path = public as $$
  select a.* from public.atendimentos a
   where a.kanban_etapa_id in (select public.fn_kanban_etapas_ids(p_kanban_id));
$$;
grant execute on function public.fn_kanban_atendimentos(uuid) to authenticated;

create or replace function public.fn_kanban_pessoas(p_kanban_id uuid)
returns setof public.pessoas language sql stable security invoker set search_path = public as $$
  select p.* from public.pessoas p
   where p.id in (select a.pessoas_id from public.atendimentos a
                   where a.kanban_etapa_id in (select public.fn_kanban_etapas_ids(p_kanban_id)));
$$;
grant execute on function public.fn_kanban_pessoas(uuid) to authenticated;

create or replace function public.fn_kanban_orcamentos(p_kanban_id uuid)
returns setof public.orcamentos language sql stable security invoker set search_path = public as $$
  select o.* from public.orcamentos o
   where o.kanban_etapa_id in (select public.fn_kanban_etapas_ids(p_kanban_id))
      or public.fn_txt_norm(o.situacao) in (
           select public.fn_txt_norm(e.descricao) from public.kanban_etapas e
            where e.id in (select public.fn_kanban_etapas_ids(p_kanban_id)));
$$;
grant execute on function public.fn_kanban_orcamentos(uuid) to authenticated;

notify pgrst, 'reload schema';
