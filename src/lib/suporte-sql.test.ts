import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { it, expect } from "vitest";

it("SQL reaplicável: encerra sem etapa, preserva histórico e não confunde unidade com nota", async () => {
  const db = new PGlite();
  const empresa = "00000000-0000-0000-0000-000000000001";
  const pessoa = "00000000-0000-0000-0000-000000000002";
  const instancia = "00000000-0000-0000-0000-000000000003";
  const atendimento = "00000000-0000-0000-0000-000000000004";
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;
    CREATE FUNCTION public.app_is_master() RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
    CREATE FUNCTION public.app_usuario_empresa_id() RETURNS uuid LANGUAGE sql AS $$SELECT '${empresa}'::uuid$$;
    CREATE TABLE empresas(id uuid PRIMARY KEY,csat_msg_agradecimento text);
    CREATE TABLE usuarios(id uuid,perfil_id uuid,email text);
    CREATE TABLE menu(perfil_id uuid,funcoes_id uuid,can_read boolean,can_create boolean,can_update boolean,can_delete boolean);
    CREATE TABLE funcoes(id uuid,path text,status boolean);
    CREATE TABLE pessoas(id uuid PRIMARY KEY,empresa_id uuid,nome text,telefone text);
    CREATE TABLE empresas_instancias(id uuid PRIMARY KEY,empresa_id uuid,webhook_token text,tipo text,instance_id text,token text,nome text);
    CREATE TABLE kanban_etapas(id uuid PRIMARY KEY,kanban_nome_id uuid,is_default_encerrado boolean,descricao text,ordem integer);
    CREATE TABLE atendimentos(id uuid PRIMARY KEY,empresa_id uuid,pessoas_id uuid,instancia_id uuid,kanban_nome_id uuid,kanban_etapa_id uuid,
      protocolo text,usuario_responsavel_id uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),nota integer,sino_ativo boolean);
    CREATE TABLE atendimentos_participantes(atendimento_id uuid,usuario_id uuid);
    CREATE TABLE atendimentos_mensagem(id uuid DEFAULT gen_random_uuid(),atendimento_id uuid,mensagem text,tipo_midia text,remetente_tipo text,
      empresa_id uuid,instancia_id uuid,externo_id text,created_at timestamptz DEFAULT now());
    CREATE FUNCTION public.fluxo_webhook_receber(text,text,text,text,text,text,text) RETURNS jsonb LANGUAGE plpgsql AS $$
    BEGIN RETURN (SELECT to_jsonb(a) FROM atendimentos a WHERE NOT EXISTS(SELECT 1 FROM kanban_etapas e
      WHERE e.id=a.kanban_etapa_id AND e.is_default_encerrado = true) LIMIT 1); END $$;
    INSERT INTO empresas VALUES('${empresa}',NULL);
    INSERT INTO pessoas VALUES('${pessoa}','${empresa}','Cliente','5511999999999');
    INSERT INTO empresas_instancias(id,empresa_id,webhook_token) VALUES('${instancia}','${empresa}','token-teste-suporte-123456789');
    INSERT INTO atendimentos(id,empresa_id,pessoas_id,instancia_id,sino_ativo) VALUES('${atendimento}','${empresa}','${pessoa}','${instancia}',true);
  `);
  const sql = readFileSync("supabase/sql/conectcon-suporte-documentos.sql", "utf8");
  await db.exec(sql);
  await db.exec(sql);
  const original = await db.query<{ encerrado_em: string | null }>("SELECT encerrado_em FROM atendimentos");
  expect(original.rows[0]?.encerrado_em).toBeNull();
  const escolha = await db.query<{ r: { avaliado: boolean } }>("SELECT csat_webhook_avaliar_suporte('token-teste-suporte-123456789','5511999999999',1,'1',NULL) r");
  expect(escolha.rows[0]?.r.avaliado).toBe(false);
  await db.query("SELECT atendimento_webhook_encerrar('token-teste-suporte-123456789',$1)", [atendimento]);
  const closed = await db.query<{ encerrado_em: string | null; sino_ativo: boolean }>("SELECT encerrado_em,sino_ativo FROM atendimentos");
  expect(closed.rows[0]?.encerrado_em).toBeTruthy();
  expect(closed.rows[0]?.sino_ativo).toBe(false);
  expect((await db.query("SELECT * FROM fn_atendimentos_ativos()")).rows).toHaveLength(0);
  expect((await db.query("SELECT * FROM fn_atendimentos_buscar(NULL,NULL,NULL,NULL,true,NULL,100)")).rows).toHaveLength(1);
  const nota = await db.query<{ r: { avaliado: boolean } }>("SELECT csat_webhook_avaliar_suporte('token-teste-suporte-123456789','5511999999999',5,'5',NULL) r");
  expect(nota.rows[0]?.r.avaliado).toBe(true);
  expect((await db.query<{ nota: number }>("SELECT nota FROM atendimentos")).rows[0]?.nota).toBe(5);
  await db.exec(sql);
  expect((await db.query<{ encerrado_em: string }>("SELECT encerrado_em FROM atendimentos")).rows[0]?.encerrado_em).toEqual(closed.rows[0]?.encerrado_em);
  await db.close();
}, 30000);