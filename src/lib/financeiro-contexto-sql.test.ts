import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const gk = "00000000-0000-0000-0000-000000000001";
const outra = "00000000-0000-0000-0000-000000000002";
const cond = "00000000-0000-0000-0000-000000000003";
const uid = "00000000-0000-0000-0000-000000000004";
const perfil = "00000000-0000-0000-0000-000000000005";
const titulo = "00000000-0000-0000-0000-000000000006";
const banco = "00000000-0000-0000-0000-000000000007";
const db = new PGlite();
async function entrar() { await db.exec(`SET ROLE authenticated; SELECT set_config('test.uid','${uid}',false)`); }
async function pode(acao: string, path = "/financeiro/receber") {
  const r = await db.query<{ ok: boolean }>("SELECT public.cond_financeiro_pode($1,$2,$3) AS ok", [cond, acao, path]);
  return r.rows[0]?.ok;
}
describe("SQL financeiro da carteira", () => {
  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
      GRANT USAGE ON SCHEMA auth TO authenticated,anon;
      CREATE TABLE usuarios(id uuid PRIMARY KEY,email text,perfil_id uuid,empresa_id uuid);
      CREATE TABLE perfil(id uuid PRIMARY KEY,ordem int);
      CREATE TABLE funcoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),path text,status boolean DEFAULT true);
      CREATE TABLE menu(perfil_id uuid,funcoes_id uuid,can_read boolean,can_create boolean,can_update boolean,can_delete boolean);
      CREATE TABLE empresas(id uuid PRIMARY KEY,titulo text,nome text,cnpj_cpf text);
      CREATE TABLE parceiros_classifica(id uuid PRIMARY KEY,descricao text,classifica_pai_id uuid);
      CREATE TABLE parceiros(id uuid PRIMARY KEY,empresa_id uuid,nome_fantasia text,razao_social text,documento text,classificacao_id uuid,status boolean);
      CREATE TABLE financeiro_titulos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid REFERENCES empresas(id),tipo text,valor numeric,conta_bancaria_id uuid);
      CREATE TABLE financeiro_contas_bancarias(id uuid PRIMARY KEY,empresa_id uuid REFERENCES empresas(id));
      CREATE TABLE financeiro_titulos_itens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid REFERENCES empresas(id),titulo_id uuid);
      CREATE FUNCTION app_usuario_empresa_id() RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$ SELECT empresa_id FROM usuarios WHERE id=auth.uid() $$;
      CREATE FUNCTION app_is_master() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM usuarios u JOIN perfil p ON p.id=u.perfil_id WHERE u.id=auth.uid() AND p.ordem=0) $$;
      INSERT INTO perfil VALUES('${perfil}',1);
      INSERT INTO usuarios VALUES('${uid}','fixture@example.invalid','${perfil}','${gk}');
      INSERT INTO empresas VALUES('${gk}','GK','GK','1'),('${outra}','Outra','Outra','2'),('${cond}','ConectCon','ConectCon','3');
      INSERT INTO parceiros_classifica VALUES('${perfil}','Condomínios',null);
      INSERT INTO parceiros VALUES('${cond}','${gk}','ConectCon','ConectCon','3','${perfil}',true);
      INSERT INTO funcoes(path) VALUES('/financeiro');
      INSERT INTO menu SELECT '${perfil}',id,true,true,true,true FROM funcoes;
      INSERT INTO financeiro_titulos VALUES('${titulo}','${cond}','receber',123,null);
      INSERT INTO financeiro_contas_bancarias VALUES('${banco}','${gk}');
      CREATE POLICY antigo ON financeiro_titulos FOR ALL TO authenticated USING(true) WITH CHECK(true);
    `);
    const sql = await readFile(new URL("../../supabase/sql/conectcon-financeiro-administradoras.sql", import.meta.url), "utf8");
    await db.exec(sql);
    await db.exec(sql); // Reaplicação segura.
  }, 30_000);
  beforeEach(async () => {
    await db.exec(`RESET ROLE; UPDATE parceiros SET empresa_id='${gk}'; UPDATE menu SET can_read=true,can_create=true,can_update=true,can_delete=true; DELETE FROM funcoes WHERE path='/financeiro/receber';`);
    await entrar();
  });
  afterAll(async () => { await db.close(); });
  it("GK lista sua entidade e ConectCon, sem listar a outra administradora", async () => {
    const r = await db.query<{ contexto: { id: string } }>("SELECT cond_financeiro_contextos($1) AS contexto", [gk]);
    expect(r.rows.map((r) => r.contexto.id).sort()).toEqual([gk, cond].sort());
  });
  it("GK lê o valor do título do condomínio autorizado", async () => {
    const r = await db.query<{ valor: string }>("SELECT valor FROM financeiro_titulos");
    expect(Number(r.rows[0]?.valor)).toBe(123);
  });
  it("novo título é gravado e lido no financeiro ConectCon, não no da GK", async () => {
    const r = await db.query<{ id: string; empresa_id: string; valor: string }>(`INSERT INTO financeiro_titulos(empresa_id,tipo,valor) VALUES('${cond}','pagar',450) RETURNING id,empresa_id,valor`);
    expect(r.rows[0]?.empresa_id).toBe(cond);
    const id = r.rows[0]?.id;
    expect(id).toBeDefined();
    const lido = await db.query<{ valor: string }>("SELECT valor FROM financeiro_titulos WHERE id=$1 AND empresa_id=$2",[id,cond]);
    expect(Number(lido.rows[0]?.valor)).toBe(450);
    expect((await db.query("SELECT id FROM financeiro_titulos WHERE id=$1 AND empresa_id=$2",[id,gk])).rows).toHaveLength(0);
    await db.query("DELETE FROM financeiro_titulos WHERE id=$1",[id]);
  });
  it("transferência revoga leitura e alteração, mesmo com política antiga permissiva", async () => {
    await db.exec(`RESET ROLE; UPDATE parceiros SET empresa_id='${outra}';`); await entrar();
    expect(await pode("alterar")).toBe(false);
    expect((await db.query("SELECT * FROM financeiro_titulos")).rows).toHaveLength(0);
    const r = await db.query("UPDATE financeiro_titulos SET valor=999 RETURNING id");
    expect(r.rows).toHaveLength(0);
  });
  it("perfil sem criar pode ler mas não inserir", async () => {
    await db.exec("RESET ROLE; UPDATE menu SET can_create=false;"); await entrar();
    expect(await pode("ler")).toBe(true);
    expect(await pode("criar")).toBe(false);
    await expect(db.exec(`INSERT INTO financeiro_titulos(empresa_id,tipo,valor) VALUES('${cond}','receber',999)`)).rejects.toThrow();
  });
  it("filha sem concessão não herda permissão da raiz", async () => {
    await db.exec("RESET ROLE; INSERT INTO funcoes(path) VALUES('/financeiro/receber');"); await entrar();
    expect(await pode("ler")).toBe(false);
  });
  it("não pode escolher o contexto global de outra administradora", async () => {
    await expect(db.query("SELECT cond_financeiro_contextos($1)",[outra])).rejects.toThrow("Empresa não autorizada");
  });
  it("não permite trocar a entidade de um título existente", async () => {
    await expect(db.exec(`UPDATE financeiro_titulos SET empresa_id='${gk}' WHERE id='${titulo}'`)).rejects.toThrow("Não é permitido transferir");
  });
  it("não permite vincular banco da GK ao título ConectCon", async () => {
    await expect(db.exec(`UPDATE financeiro_titulos SET conta_bancaria_id='${banco}' WHERE id='${titulo}'`)).rejects.toThrow("mesma entidade");
  });
  it("visitante anônimo não pode consultar carteira", async () => {
    await db.exec("RESET ROLE; SET ROLE anon;");
    await expect(db.query("SELECT cond_financeiro_contextos($1)",[gk])).rejects.toThrow("permission denied");
  });
});