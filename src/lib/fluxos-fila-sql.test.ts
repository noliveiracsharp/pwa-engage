import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, it, expect } from "vitest";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const token = "a".repeat(40);
async function banco() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE empresas_instancias(id uuid,empresa_id uuid,webhook_token text);
    CREATE TABLE pessoas(id uuid PRIMARY KEY,empresa_id uuid);
    CREATE TABLE kanban_nome(id uuid,empresa_id uuid);
    CREATE TABLE kanban_etapas(id uuid,kanban_nome_id uuid,descricao text,status boolean,ordem int,is_default_humano boolean,is_default_encerrado boolean);
    CREATE TABLE atendimentos(id uuid,empresa_id uuid,pessoas_id uuid,kanban_nome_id uuid,kanban_etapa_id uuid,kanban_etapas_id uuid,modo_atendimento text,modo text,usuario_responsavel_id uuid,encerrado_em timestamptz,status text,status_atendimento text,updated_at timestamptz,prioridade text);
    CREATE TABLE pessoas_camposperson(pessoa_id uuid,chave text,valor text,ordem int);
    CREATE TABLE empresas_camposperson(empresa_id uuid,chave text,ordem int);
    INSERT INTO empresas_instancias VALUES('${id(1)}','${id(2)}','${token}');
    INSERT INTO pessoas VALUES('${id(3)}','${id(2)}');
    INSERT INTO kanban_nome VALUES('${id(4)}','${id(2)}'),('${id(5)}','${id(20)}');
    INSERT INTO kanban_etapas VALUES
      ('${id(6)}','${id(4)}','Triagem',true,0,false,false),
      ('${id(7)}','${id(4)}','Nível 1 Atendentes',true,1,false,false),
      ('${id(8)}','${id(4)}','Nível 2 Atendimentos',true,2,true,false),
      ('${id(9)}','${id(5)}','Privada',true,1,true,false),
      ('${id(10)}','${id(4)}','Encerrado',true,3,false,true);
    INSERT INTO atendimentos(id,empresa_id,pessoas_id,modo_atendimento,usuario_responsavel_id)
      VALUES('${id(11)}','${id(2)}','${id(3)}','IA','${id(12)}'),('${id(13)}','${id(20)}',null,'IA',null);
    CREATE FUNCTION _fluxo_upd(p_tabela text,p_id uuid,p_dados jsonb) RETURNS void
    LANGUAGE plpgsql AS $$ DECLARE v_sets text; BEGIN
      SELECT string_agg(format('%I = (jsonb_populate_record(null::public.%I, $1)).%I',column_name,p_tabela,column_name),', ')
      INTO v_sets FROM information_schema.columns WHERE table_schema='public' AND table_name=p_tabela AND p_dados ? column_name AND column_name <> 'id';
      EXECUTE format('UPDATE public.%I SET %s WHERE id=$2',p_tabela,v_sets) USING p_dados,p_id;
    END $$;`);
  const sql = readFileSync("supabase/sql/conectcon-fluxos-fila-suporte.sql", "utf8");
  await db.exec(sql);
  await db.exec(sql);
  return db;
}
describe("fila humana do webhook", () => {
  it("escolhe Nível 2 do Suporte e limpa responsável em uma gravação", async () => {
    const db = await banco();
    try {
      await db.query("SELECT fluxo_webhook_fila($1,$2,$3)", [token,id(11),{ quadro_id: id(4) }]);
      const r = (await db.query<{kanban_nome_id:string;kanban_etapa_id:string;modo_atendimento:string;usuario_responsavel_id:string|null}>("SELECT * FROM atendimentos WHERE id=$1",[id(11)])).rows[0];
      expect(r?.kanban_nome_id).toBe(id(4));
      expect(r?.kanban_etapa_id).toBe(id(8));
      expect(r?.modo_atendimento).toBe("Humano");
      expect(r?.usuario_responsavel_id).toBeNull();
    } finally { await db.close(); }
  },30000);
  it("preserva etapa explícita e rejeita encerrada", async () => {
    const db = await banco();
    try {
      await db.query("SELECT fluxo_webhook_fila($1,$2,$3)",[token,id(11),{quadro_id:id(4),etapa_id:id(7)}]);
      expect((await db.query<{kanban_etapa_id:string}>("SELECT kanban_etapa_id FROM atendimentos WHERE id=$1",[id(11)])).rows[0]?.kanban_etapa_id).toBe(id(7));
      await expect(db.query("SELECT fluxo_webhook_fila($1,$2,$3)",[token,id(11),{etapa_id:id(10)}])).rejects.toThrow();
    } finally { await db.close(); }
  },30000);
  it("bloqueia token inválido, quadro e atendimento de outra empresa", async () => {
    const db = await banco();
    try {
      await expect(db.query("SELECT fluxo_webhook_fila($1,$2,$3)",["b".repeat(40),id(11),{}])).rejects.toThrow();
      await expect(db.query("SELECT fluxo_webhook_fila($1,$2,$3)",[token,id(11),{etapa_id:id(9)}])).rejects.toThrow();
      await expect(db.query("SELECT fluxo_webhook_fila($1,$2,$3)",[token,id(13),{}])).rejects.toThrow();
      await expect(db.query("SELECT fluxo_webhook_campos($1,$2,$3)",[token,id(13),{nome:"x"}])).rejects.toThrow();
    } finally { await db.close(); }
  },30000);
  it("persiste os 34 campos e atualiza sem duplicar", async () => {
    const db = await banco();
    try {
      const campos = Object.fromEntries(Array.from({length:34},(_,i)=>[`campo_${i}`,`valor_${i}`]));
      await db.query("SELECT fluxo_webhook_campos($1,$2,$3)",[token,id(11),campos]);
      await db.query("SELECT fluxo_webhook_campos($1,$2,$3)",[token,id(11),{campo_0:"alterado"}]);
      const rows = (await db.query<{chave:string;valor:string}>("SELECT chave,valor FROM pessoas_camposperson")).rows;
      expect(rows).toHaveLength(34);
      expect(rows.find(r=>r.chave === "campo_0")?.valor).toBe("alterado");
      expect(rows.find(r=>r.chave === "campo_33")?.valor).toBe("valor_33");
    } finally { await db.close(); }
  },30000);
});