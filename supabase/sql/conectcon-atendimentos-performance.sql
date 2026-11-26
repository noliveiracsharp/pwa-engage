-- Atendimentos: carregamento rápido da lista (rode uma vez no SQL Editor).
-- 1) Preenche encerrado_em dos atendimentos antigos já finalizados (uma única vez).
update public.atendimentos a
   set encerrado_em = coalesce(a.updated_at, a.created_at, now())
  from public.atendimentos a2
  left join public.kanban_etapas e on e.id = a2.kanban_etapa_id
 where a2.id = a.id
   and a.encerrado_em is null
   and public.atendimento_esta_encerrado(to_jsonb(a2), to_jsonb(e));

-- 2) Índices
create index if not exists idx_atendimentos_ativos_fast
  on public.atendimentos (empresa_id, created_at desc) where encerrado_em is null;
create index if not exists idx_at_msg_ultima
  on public.atendimentos_mensagem (atendimento_id, created_at desc);
create index if not exists idx_atendimentos_pessoas on public.atendimentos (pessoas_id);

-- 3) Lista de ativos usando a coluna indexada (sem converter o histórico inteiro)
create or replace function public.fn_atendimentos_ativos(p_empresa_id uuid default null)
returns setof jsonb language sql stable security invoker set search_path = public as $$
  select to_jsonb(a) || jsonb_build_object(
    '_pessoa', case when p.id is null then null else to_jsonb(p) end,
    '_ultima', (select to_jsonb(m) from public.atendimentos_mensagem m
                where m.atendimento_id = a.id
                  and coalesce((to_jsonb(m)->>'oculta_para_atendente')::boolean, false) = false
                order by m.created_at desc limit 1))
  from (
    select * from public.atendimentos x
     where x.encerrado_em is null
       and (p_empresa_id is null or x.empresa_id = p_empresa_id or x.empresa_id is null)
     order by x.created_at desc
     limit 500
  ) a
  left join public.pessoas p on p.id = a.pessoas_id
  order by a.created_at desc;
$$;
grant execute on function public.fn_atendimentos_ativos(uuid) to authenticated;
analyze public.atendimentos;
analyze public.atendimentos_mensagem;
notify pgrst, 'reload schema';
