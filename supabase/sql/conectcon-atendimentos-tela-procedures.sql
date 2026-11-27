-- Atendimentos: tela carregada só por procedures (rode uma vez no SQL Editor, antes de publicar).
-- Substitui as consultas diretas da tela (lista, contatos, última mensagem, etiquetas,
-- participantes, instâncias, departamentos, etapas, etiquetas, usuários e notas rápidas)
-- por DUAS chamadas: fn_atendimentos_painel_v2 (conversas) e fn_atendimentos_apoio (cadastros).
-- Idempotente: pode rodar de novo sem problema.

-- 1) Índices usados pelas procedures
create index if not exists idx_atendimentos_ativos_fast
  on public.atendimentos (empresa_id, created_at desc) where encerrado_em is null;
create index if not exists idx_atendimentos_ativos_todos
  on public.atendimentos (created_at desc) where encerrado_em is null;
create index if not exists idx_at_msg_ultima
  on public.atendimentos_mensagem (atendimento_id, created_at desc);
create index if not exists idx_at_etiqueta_atendimento
  on public.atendimentos_etiqueta (atendimento_id);
create index if not exists idx_at_participantes_atendimento
  on public.atendimentos_participantes (atendimento_id);
create index if not exists idx_atendimentos_pessoas on public.atendimentos (pessoas_id);

-- 2) Conversas em andamento, já com contato, última mensagem, etiquetas e participantes.
create or replace function public.fn_atendimentos_painel_v2(p_empresa_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_master boolean := coalesce(public.app_is_master(), false);
  v_emp uuid;
  v_out jsonb;
begin
  if auth.uid() is null then raise exception 'Sessão expirada'; end if;
  -- Master: empresa do contexto (sem contexto = todas). Demais perfis: sempre a própria empresa.
  v_emp := case when v_master then p_empresa_id else public.app_usuario_empresa_id() end;
  if v_emp is null and not v_master then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(t.linha order by t.ord desc), '[]'::jsonb) into v_out
  from (
    select a.created_at as ord,
      to_jsonb(a) || jsonb_build_object(
        '_pessoa', case when p.id is null then null else to_jsonb(p) end,
        '_ultima', u.j,
        '_etiquetas', coalesce(et.ids, '[]'::jsonb),
        '_participantes', coalesce(pa.ids, '[]'::jsonb)
      ) as linha
    from (
      select x.id from public.atendimentos x
       where x.encerrado_em is null
         and (v_emp is null or x.empresa_id = v_emp)
       order by x.created_at desc
       limit 500
    ) ids
    join public.atendimentos a on a.id = ids.id
    left join public.pessoas p on p.id = a.pessoas_id
    left join lateral (
      select jsonb_strip_nulls(jsonb_build_object(
        'id', z.mj->'id', 'atendimento_id', z.mj->'atendimento_id',
        'mensagem', z.mj->'mensagem', 'conteudo', z.mj->'conteudo', 'texto', z.mj->'texto',
        'tipo', z.mj->'tipo', 'tipo_midia', z.mj->'tipo_midia', 'midia_url', z.mj->'midia_url',
        'msg_interna', z.mj->'msg_interna', 'usuario_id', z.mj->'usuario_id',
        'remetente_tipo', z.mj->'remetente_tipo', 'created_at', z.mj->'created_at')) as j
      from (
        select to_jsonb(m) as mj from public.atendimentos_mensagem m
         where m.atendimento_id = a.id and m.oculta_para_atendente is not true
         order by m.created_at desc limit 1
      ) z
    ) u on true
    left join lateral (
      select jsonb_agg(v.etiqueta_id) as ids from public.atendimentos_etiqueta v where v.atendimento_id = a.id
    ) et on true
    left join lateral (
      select jsonb_agg(pp.usuario_id) as ids from public.atendimentos_participantes pp where pp.atendimento_id = a.id
    ) pa on true
  ) t;
  return v_out;
end $$;
revoke all on function public.fn_atendimentos_painel_v2(uuid) from public, anon;
grant execute on function public.fn_atendimentos_painel_v2(uuid) to authenticated;

-- 3) Cadastros de apoio da tela (canais, departamentos, etapas, etiquetas, usuários, notas rápidas).
create or replace function public.fn_atendimentos_apoio(p_empresa_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_master boolean := coalesce(public.app_is_master(), false);
  v_emp uuid;
begin
  if auth.uid() is null then raise exception 'Sessão expirada'; end if;
  v_emp := case when v_master then p_empresa_id else public.app_usuario_empresa_id() end;
  if v_emp is null and not v_master then
    return jsonb_build_object('instancias','[]'::jsonb,'kanbans','[]'::jsonb,'etapas','[]'::jsonb,
      'etiquetas','[]'::jsonb,'usuarios','[]'::jsonb,'notas','[]'::jsonb);
  end if;
  return jsonb_build_object(
    'instancias', (select coalesce(jsonb_agg(r.j order by r.j->>'id'), '[]'::jsonb) from (
        select to_jsonb(i) as j from public.empresas_instancias i) r
       where v_emp is null or r.j->>'empresa_id' = v_emp::text or (v_master and r.j->>'empresa_id' is null)),
    'kanbans', (select coalesce(jsonb_agg(to_jsonb(k) order by k.id), '[]'::jsonb) from public.kanban_nome k
       where v_emp is null or k.empresa_id = v_emp or (v_master and k.empresa_id is null)),
    'etapas', (select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]'::jsonb) from public.kanban_etapas e
       join public.kanban_nome k on k.id = e.kanban_nome_id
       where v_emp is null or k.empresa_id = v_emp or (v_master and k.empresa_id is null)),
    'etiquetas', (select coalesce(jsonb_agg(r.j order by r.j->>'id'), '[]'::jsonb) from (
        select to_jsonb(x) as j from public.etiquetas x) r
       where v_emp is null or r.j->>'empresa_id' = v_emp::text or (v_master and r.j->>'empresa_id' is null)),
    'usuarios', (select coalesce(jsonb_agg(r.j - array['senha','password','senha_hash'] order by r.j->>'id'), '[]'::jsonb) from (
        select to_jsonb(u) as j from public.usuarios u) r
       where v_emp is null or r.j->>'empresa_id' = v_emp::text or (v_master and r.j->>'empresa_id' is null)),
    'notas', (select coalesce(jsonb_agg(r.j order by r.j->>'id'), '[]'::jsonb) from (
        select to_jsonb(n) as j from public.empresas_notasrapidas n) r
       where v_emp is null or r.j->>'empresa_id' = v_emp::text or (v_master and r.j->>'empresa_id' is null))
  );
end $$;
revoke all on function public.fn_atendimentos_apoio(uuid) from public, anon;
grant execute on function public.fn_atendimentos_apoio(uuid) to authenticated;

analyze public.atendimentos;
analyze public.atendimentos_mensagem;
notify pgrst, 'reload schema';
