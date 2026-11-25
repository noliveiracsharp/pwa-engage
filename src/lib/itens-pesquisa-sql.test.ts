import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const own = "00000000-0000-0000-0000-000000000001";
const parent = "00000000-0000-0000-0000-000000000002";
const other = "00000000-0000-0000-0000-000000000003";
const user = "00000000-0000-0000-0000-000000000004";
const profile = "00000000-0000-0000-0000-000000000005";
const db = new PGlite();
type Result = { rows: { codigo: string; preco_venda: number; __marca: { descricao: string } | null }[]; total: number };
async function search(args = "") {
  const r = await db.query<{ r: Result }>(`SELECT fn_itens_lista(${args}) r`);
  const result = r.rows[0]?.r;
  if (!result) throw new Error("Resultado ausente");
  return result;
}

describe("Procedure Produtos e Serviços", () => {
  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
      CREATE TABLE usuarios(id uuid PRIMARY KEY,email text,perfil_id uuid,empresa_id uuid);
      CREATE TABLE perfil(id uuid PRIMARY KEY,ordem int);
      CREATE TABLE funcoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),path text,status boolean DEFAULT true,funcoes_pai_id uuid);
      CREATE TABLE menu(perfil_id uuid,funcoes_id uuid,can_read boolean);
      CREATE TABLE empresas(id uuid PRIMARY KEY,empresa_pai_id uuid,compartilhar_catalogo_filiais boolean);
      CREATE TABLE itens_marcas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid,descricao text);
      CREATE TABLE itens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid,itens_marcas_id uuid,codigo text,descricao text,modelo text,tipo text,categoria text,status boolean,preco_venda numeric);
      CREATE FUNCTION app_usuario_empresa_id() RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$ SELECT empresa_id FROM usuarios WHERE id=auth.uid() $$;
      CREATE FUNCTION app_is_master() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM usuarios u JOIN perfil p ON p.id=u.perfil_id WHERE u.id=auth.uid() AND p.ordem=0) $$;
      INSERT INTO perfil VALUES('${profile}',1);
      INSERT INTO usuarios VALUES('${user}','fixture@example.invalid','${profile}','${own}');
      INSERT INTO empresas VALUES('${own}','${parent}',false),('${parent}',null,false),('${other}',null,false);
      INSERT INTO funcoes(path) VALUES('/itens');
      INSERT INTO menu SELECT '${profile}',id,true FROM funcoes;
      INSERT INTO itens_marcas(empresa_id,descricao) VALUES('${own}','ConectCon');
      INSERT INTO itens(empresa_id,itens_marcas_id,codigo,descricao,modelo,tipo,categoria,status,preco_venda)
      SELECT '${own}',id,'S00013','LGPD','Mensal','Serviço','Serviços Recorrentes (Mensais)',true,87.54 FROM itens_marcas;
      INSERT INTO itens(empresa_id,codigo,descricao,tipo,categoria,status,preco_venda) VALUES
        ('${own}','P0001','Cabo 100%','Produto','Elétrica',false,500),
        ('${own}','P0002','Parafuso','Produto',null,true,1),
        ('${parent}','M001','Matriz','Produto','Elétrica',true,10),
        ('${other}','O001','Outra','Produto','Elétrica',true,20),
        (null,'G001','Global','Produto','Elétrica',true,30);
    `);
    const sql = await readFile(new URL("../../supabase/sql/conectcon-produtos-servicos-pesquisa.sql", import.meta.url), "utf8");
    // PGlite does not ship pg_trgm; run the actual procedure and btree indexes.
    const runnable = sql.replace(/CREATE EXTENSION IF NOT EXISTS pg_trgm;/g, "")
      .replace(/CREATE INDEX IF NOT EXISTS idx_itens_busca_trgm[\s\S]*?gin_trgm_ops\);/g, "")
      .replace(/CREATE INDEX IF NOT EXISTS idx_itens_marcas_busca_trgm[\s\S]*?gin_trgm_ops\);/g, "");
    await db.exec(runnable);
    await db.exec(runnable);
  }, 30_000);
  beforeEach(async () => {
    await db.exec(`RESET ROLE; DELETE FROM menu WHERE funcoes_id IN (SELECT id FROM funcoes WHERE path <> '/itens'); DELETE FROM funcoes WHERE path <> '/itens'; UPDATE perfil SET ordem=1; UPDATE menu SET can_read=true;
      UPDATE empresas SET compartilhar_catalogo_filiais=false;
      SELECT set_config('test.uid','${user}',false); SET ROLE authenticated;`);
  });
  afterAll(async () => { await db.close(); });
  it("lista somente os três itens próprios", async () => {
    expect((await search()).total).toBe(3);
  });
  it("busca LGPD na descrição", async () => {
    expect((await search("p_busca => 'LGPD'")).rows.map(r => r.codigo)).toEqual(["S00013"]);
  });
  it("busca o nome da marca sem baixar a tabela de marcas", async () => {
    const r = await search("p_busca => 'conectcon'");
    expect(r.rows[0]?.__marca?.descricao).toBe("ConectCon");
    expect(r.total).toBe(1);
  });
  it("filtra a categoria Serviços Recorrentes (Mensais)", async () => {
    expect((await search("p_categoria => 'Serviços Recorrentes (Mensais)'")).rows.map(r => r.codigo)).toEqual(["S00013"]);
  });
  it("filtra natureza Produto e status inativo", async () => {
    expect((await search("p_tipos => ARRAY['Produto'], p_status => 'inativo'")).rows.map(r => r.codigo)).toEqual(["P0001"]);
  });
  it("filtra itens sem categoria", async () => {
    expect((await search("p_categoria => '__sem_categoria__'")).rows.map(r => r.codigo)).toEqual(["P0002"]);
  });
  it("pagina com contagem completa e ordem numérica de preço", async () => {
    const r = await search("p_limite => 1, p_offset => 1, p_ordem => 'preco_venda', p_direcao => 'desc'");
    expect(r.total).toBe(3);
    expect(r.rows.map(r => r.codigo)).toEqual(["S00013"]);
  });
  it("não interpreta porcentagem como curinga", async () => {
    expect((await search("p_busca => '100%'")).rows.map(r => r.codigo)).toEqual(["P0001"]);
  });
  it("rejeita tentativa de consultar outra empresa", async () => {
    await expect(search(`p_empresa_id => '${other}'`)).rejects.toThrow("Empresa não autorizada");
  });
  it("rejeita perfil sem Ler", async () => {
    await db.exec("RESET ROLE; UPDATE menu SET can_read=false; SET ROLE authenticated;");
    await expect(search()).rejects.toThrow("Sem permissão");
  });
  it("Ler em uma aba concede abertura da página raiz", async () => {
    await db.exec(`RESET ROLE; UPDATE menu SET can_read=false;
      INSERT INTO funcoes(path,funcoes_pai_id) SELECT '/estoque',id FROM funcoes WHERE path='/itens';
      INSERT INTO menu SELECT '${profile}',id,true FROM funcoes WHERE path='/estoque'; SET ROLE authenticated;`);
    expect((await search()).total).toBe(3);
  });
  it("Master pode consultar outra empresa sem misturar as próprias", async () => {
    await db.exec("RESET ROLE; UPDATE perfil SET ordem=0; SET ROLE authenticated;");
    expect((await search(`p_empresa_id => '${other}'`)).rows.map(r => r.codigo).sort()).toEqual(["G001", "O001"]);
  });
  it("Master sem empresa selecionada vê o catálogo completo", async () => {
    await db.exec("RESET ROLE; UPDATE perfil SET ordem=0; SET ROLE authenticated;");
    expect((await search()).total).toBe(6);
  });
  it("filial herda somente catálogo autorizado da matriz", async () => {
    await db.exec(`RESET ROLE; UPDATE empresas SET compartilhar_catalogo_filiais=true WHERE id='${parent}'; SET ROLE authenticated;`);
    expect((await search()).total).toBe(4);
  });
  it("revogar compartilhamento remove itens da matriz", async () => {
    expect((await search("p_busca => 'Matriz'")).total).toBe(0);
  });
  it("anônimo não pode executar", async () => {
    await db.exec("RESET ROLE; SET ROLE anon;");
    await expect(search()).rejects.toThrow("permission denied");
  });
  it("impede baixar a tabela sem limite", async () => {
    await expect(search("p_limite => 1001")).rejects.toThrow("Parâmetros");
  });
});