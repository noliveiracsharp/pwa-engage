import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { it, expect } from "vitest";

const E1 = "00000000-0000-0000-0000-0000000000e1";
const E2 = "00000000-0000-0000-0000-0000000000e2";

it("tela de Atendimentos por procedure: só a empresa do usuário, com contato, última mensagem e vínculos", async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '00000000-0000-0000-0000-0000000000aa'::uuid$$;
    CREATE TABLE cfg(master boolean);
    INSERT INTO cfg VALUES(false);
    CREATE FUNCTION public.app_is_master() RETURNS boolean LANGUAGE sql AS $$SELECT master FROM cfg$$;
    CREATE FUNCTION public.app_usuario_empresa_id() RETURNS uuid LANGUAGE sql AS $$SELECT '${E1}'::uuid$$;
    CREATE TABLE pessoas(id uuid PRIMARY KEY,empresa_id uuid,nome text);
    CREATE TABLE atendimentos(id uuid PRIMARY KEY,empresa_id uuid,pessoas_id uuid,encerrado_em timestamptz,created_at timestamptz DEFAULT now());
    CREATE TABLE atendimentos_mensagem(id uuid DEFAULT gen_random_uuid(),atendimento_id uuid,mensagem text,oculta_para_atendente boolean,created_at timestamptz);
    CREATE TABLE atendimentos_etiqueta(atendimento_id uuid,etiqueta_id uuid);
    CREATE TABLE atendimentos_participantes(atendimento_id uuid,usuario_id uuid);
    CREATE TABLE empresas_instancias(id uuid,empresa_id uuid,nome text);
    CREATE TABLE kanban_nome(id uuid PRIMARY KEY,empresa_id uuid,nome text);
    CREATE TABLE kanban_etapas(id uuid,kanban_nome_id uuid,descricao text);
    CREATE TABLE etiquetas(id uuid,empresa_id uuid,nome text);
    CREATE TABLE usuarios(id uuid,empresa_id uuid,nome text,senha text);
    CREATE TABLE empresas_notasrapidas(id uuid,empresa_id uuid,texto text);
    INSERT INTO pessoas VALUES('00000000-0000-0000-0000-000000000001','${E1}','Ana');
    INSERT INTO atendimentos VALUES
      ('00000000-0000-0000-0000-0000000000a1','${E1}','00000000-0000-0000-0000-000000000001',NULL,now()),
      ('00000000-0000-0000-0000-0000000000a2','${E1}',NULL,now(),now()),
      ('00000000-0000-0000-0000-0000000000a3','${E2}',NULL,NULL,now());
    INSERT INTO atendimentos_mensagem(atendimento_id,mensagem,oculta_para_atendente,created_at) VALUES
      ('00000000-0000-0000-0000-0000000000a1','visivel',false,now() - interval '1 min'),
      ('00000000-0000-0000-0000-0000000000a1','oculta',true,now());
    INSERT INTO atendimentos_etiqueta VALUES('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000f1');
    INSERT INTO atendimentos_participantes VALUES('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000aa');
    INSERT INTO kanban_nome VALUES('00000000-0000-0000-0000-0000000000b1','${E1}','Suporte'),('00000000-0000-0000-0000-0000000000b2','${E2}','Outro');
    INSERT INTO kanban_etapas VALUES('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','Nível 2'),('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000b2','X');
    INSERT INTO usuarios VALUES('00000000-0000-0000-0000-0000000000aa','${E1}','Nilton','segredo'),('00000000-0000-0000-0000-0000000000ab','${E2}','Outro','x');
  `);
  const sql = readFileSync("supabase/sql/conectcon-atendimentos-tela-procedures.sql", "utf8");
  await db.exec(sql);
  await db.exec(sql);

  // Mesmo pedindo a empresa 2, um perfil comum só recebe a própria empresa e só conversas em andamento.
  const painel = await db.query<{ r: Array<Record<string, any>> }>(`SELECT fn_atendimentos_painel_v2('${E2}') r`); // eslint-disable-line @typescript-eslint/no-explicit-any
  const lista = painel.rows[0]!.r;
  expect(lista.map((a) => a["id"])).toEqual(["00000000-0000-0000-0000-0000000000a1"]);
  expect(lista[0]!["_pessoa"]["nome"]).toBe("Ana");
  expect(lista[0]!["_ultima"]["mensagem"]).toBe("visivel");
  expect(lista[0]!["_etiquetas"]).toEqual(["00000000-0000-0000-0000-0000000000f1"]);
  expect(lista[0]!["_participantes"]).toEqual(["00000000-0000-0000-0000-0000000000aa"]);

  const apoio = await db.query<{ r: Record<string, Array<Record<string, unknown>>> }>(`SELECT fn_atendimentos_apoio('${E2}') r`);
  const a = apoio.rows[0]!.r;
  expect(a["kanbans"]!.map((k) => k["nome"])).toEqual(["Suporte"]);
  expect(a["etapas"]!.map((e) => e["descricao"])).toEqual(["Nível 2"]);
  expect(a["usuarios"]!.map((u) => u["nome"])).toEqual(["Nilton"]);
  expect(a["usuarios"]![0]).not.toHaveProperty("senha");

  // Master enxerga a empresa do contexto escolhido.
  await db.exec("UPDATE cfg SET master = true");
  const m = await db.query<{ r: Array<Record<string, unknown>> }>(`SELECT fn_atendimentos_painel_v2('${E2}') r`);
  expect(m.rows[0]!.r.map((x) => x["id"])).toEqual(["00000000-0000-0000-0000-0000000000a3"]);
});
