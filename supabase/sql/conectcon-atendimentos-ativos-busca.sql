-- ConectCon HUB — Atendimentos: lista inicial só com o que está em andamento + busca sob demanda
-- SECURITY INVOKER: respeita as RLS existentes.

create index if not exists idx_at_msg_atend_created on public.atendimentos_mensagem (atendimento_id, created_at desc);
create index if not exists idx_atendimentos_empresa_created on public.atendimentos (empresa_id, created_at desc);
create index if not exists idx_atendimentos_etapa on public.atendimentos (kanban_etapa_id);

-- 1) Lista inicial: tudo que NÃO está em etapa de encerramento (ativos, aguardando, IA)
create or replace function public.fn_atendimentos_ativos(p_empresa_id uuid default null)
returns setof jsonb language sql stable security invoker set search_path = public as $$
  select to_jsonb(a) || jsonb_build_object(
    '_pessoa', case when p.id is null then null else to_jsonb(p) end,
    '_ultima', (select to_jsonb(m) from public.atendimentos_mensagem m
                where m.atendimento_id = a.id
                  and coalesce((to_jsonb(m)->>'oculta_para_atendente')::boolean, false) = false
                order by m.created_at desc limit 1))
  from public.atendimentos a
  left join public.pessoas p on p.id = a.pessoas_id
  left join public.kanban_etapas e on e.id = a.kanban_etapa_id
  where coalesce(e.is_default_encerrado, false) = false
    and (p_empresa_id is null or a.empresa_id = p_empresa_id or a.empresa_id is null)
  order by a.created_at desc
  limit 500;
$$;

-- 2) Busca (Encerrados / Todos / Histórico): nome, telefone, protocolo e período
create or replace function public.fn_atendimentos_buscar(
  p_empresa_id uuid default null, p_termo text default null,
  p_de date default null, p_ate date default null,
  p_somente_encerrados boolean default false, p_usuario_id uuid default null,
  p_limite int default 100)
returns setof jsonb language sql stable security invoker set search_path = public as $$
  select to_jsonb(a) || jsonb_build_object(
    '_pessoa', case when p.id is null then null else to_jsonb(p) end,
    '_ultima', (select to_jsonb(m) from public.atendimentos_mensagem m
                where m.atendimento_id = a.id order by m.created_at desc limit 1))
  from public.atendimentos a
  left join public.pessoas p on p.id = a.pessoas_id
  left join public.kanban_etapas e on e.id = a.kanban_etapa_id
  where (p_empresa_id is null or a.empresa_id = p_empresa_id or a.empresa_id is null)
    and (not p_somente_encerrados or e.is_default_encerrado = true)
    and (p_de is null or a.created_at >= p_de)
    and (p_ate is null or a.created_at < p_ate + 1)
    and (p_usuario_id is null or a.usuario_responsavel_id = p_usuario_id
         or exists (select 1 from public.atendimentos_participantes x where x.atendimento_id = a.id and x.usuario_id = p_usuario_id))
    and (p_termo is null
         or a.protocolo ilike '%' || p_termo || '%'
         or (to_jsonb(p)->>'nome') ilike '%' || p_termo || '%'
         or (length(regexp_replace(p_termo, '\D', '', 'g')) >= 3
             and regexp_replace(coalesce(to_jsonb(p)->>'telefone', ''), '\D', '', 'g') like '%' || regexp_replace(p_termo, '\D', '', 'g') || '%'))
  order by a.created_at desc
  limit least(coalesce(p_limite, 100), 300);
$$;

grant execute on function public.fn_atendimentos_ativos(uuid) to authenticated;
grant execute on function public.fn_atendimentos_buscar(uuid, text, date, date, boolean, uuid, int) to authenticated;
notify pgrst, 'reload schema';
