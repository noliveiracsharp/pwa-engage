-- ConectCon HUB — Painel de Atendimentos em 1 chamada (função compilada)
-- Junta atendimento + contato (nome/telefone/foto) + última mensagem, com índices.
-- SECURITY INVOKER: respeita as RLS existentes de cada tabela.

create index if not exists idx_at_msg_atend_created
  on public.atendimentos_mensagem (atendimento_id, created_at desc);
create index if not exists idx_atendimentos_empresa_created
  on public.atendimentos (empresa_id, created_at desc);

create or replace function public.fn_atendimentos_painel(p_empresa_id uuid default null, p_dias int default 90)
returns setof jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select to_jsonb(a)
    || jsonb_build_object(
      '_pessoa', case when p.id is null then null else to_jsonb(p) end,
      '_ultima', (
        select to_jsonb(m)
        from public.atendimentos_mensagem m
        where m.atendimento_id = a.id and coalesce((to_jsonb(m)->>'oculta_para_atendente')::boolean, false) = false
        order by m.created_at desc limit 1)
    )
  from public.atendimentos a
  left join public.pessoas p on p.id = a.pessoas_id
  where a.created_at >= now() - make_interval(days => p_dias)
    and (p_empresa_id is null or a.empresa_id = p_empresa_id or a.empresa_id is null)
  order by a.created_at desc;
$$;

grant execute on function public.fn_atendimentos_painel(uuid, int) to authenticated;
notify pgrst, 'reload schema';
