import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, it, expect } from "vitest";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const token = "a".repeat(40);
const EMP = id(2), PRINCIPAL = id(30), SUPORTE = id(31), DESATIVADO = id(32);

async function banco(aplicarCorrecao: boolean) {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE empresas_instancias(id uuid,empresa_id uuid,webhook_token text,tipo text,instance_id text,token text,nome text);
    CREATE TABLE usuarios(id uuid,telefone text);
    CREATE TABLE pessoas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid,nome text,telefone text,status boolean);
    CREATE TABLE kanban_nome(id uuid,empresa_id uuid,nome text);
    CREATE TABLE kanban_etapas(id uuid,kanban_nome_id uuid,ordem int,is_default_humano boolean,is_default_encerrado boolean);
    CREATE TABLE atendimentos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),pessoas_id uuid,instancia_id uuid,empresa_id uuid,kanban_nome_id uuid NOT NULL,kanban_etapa_id uuid,modo_atendimento text,canal text,usuario_responsavel_id uuid,dt_ultimo_whatsapp timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz,protocolo text);
    CREATE TABLE atendimentos_mensagem(atendimento_id uuid,mensagem text,tipo_midia text,remetente_tipo text,empresa_id uuid,instancia_id uuid,midia_url text,externo_id text,usuario_id uuid,msg_interna boolean);
    CREATE TABLE fluxos_atendimento(id uuid,empresa_id uuid,nome text,ativo boolean,instancia_id uuid,gatilho text,palavras_chave text,updated_at timestamptz DEFAULT now(),nos jsonb,conexoes jsonb);
    CREATE TABLE fluxos_execucoes(id uuid DEFAULT gen_random_uuid(),atendimento_id uuid,fluxo_id uuid,status text,no_atual text,variaveis jsonb,created_at timestamptz DEFAULT now());
    CREATE FUNCTION _fluxo_upd(p_tabela text,p_id uuid,p_dados jsonb) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
    INSERT INTO empresas_instancias VALUES('${id(1)}','${EMP}','${token}','zapi','i','t','WhatsApp');
    INSERT INTO fluxos_atendimento(id,empresa_id,nome,ativo,gatilho,nos,conexoes) VALUES
      ('${PRINCIPAL}','${EMP}','Principal',true,'mensagem_recebida','[{"id":"s","type":"subfluxo","data":{"tipo":"subfluxo","fluxo_id":"${SUPORTE}"}}]','[]'),
      ('${SUPORTE}','${EMP}','Suporte',false,'mensagem_recebida','[]','[]'),
      ('${DESATIVADO}','${EMP}','Antigo',false,'mensagem_recebida','[]','[]');`);
  await db.exec(readFileSync("supabase/sql/conectcon-atendimentos-triagem.sql", "utf8"));
  if (aplicarCorrecao) {
    const sql = readFileSync("supabase/sql/conectcon-fluxos-subfluxo-retomada.sql", "utf8");
    await db.exec(sql);
    await db.exec(sql);
  }
  return db;
}

type Resp = { fluxo: { id: string } | null; execucao: { no_atual: string; status: string } | null; atendimento_id: string };
async function receber(db: PGlite, texto: string, externo: string) {
  const r = await db.query<{ r: Resp }>("SELECT fluxo_webhook_receber($1,$2,$3,$4,'texto',null,$5) AS r", [token, "5511997440832", "Nilton", texto, externo]);
  return r.rows[0]!.r;
}
async function aguardarEm(db: PGlite, fluxo: string) {
  const r = await receber(db, "oi", `m-${fluxo}`);
  await db.query("INSERT INTO fluxos_execucoes(atendimento_id,fluxo_id,status,no_atual,variaveis) VALUES($1,$2,'aguardando','menu-unidades','{}')", [r.atendimento_id, fluxo]);
}

describe("retomada de conversa em subfluxo", () => {
  it("sem a correção, a escolha da unidade dentro do subfluxo inativo é ignorada", async () => {
    const db = await banco(false);
    try {
      await aguardarEm(db, SUPORTE);
      expect((await receber(db, "2", "m2")).fluxo).toBeNull();
    } finally { await db.close(); }
  }, 30000);
  it("com a correção, retoma o subfluxo chamado pelo fluxo principal no menu em que parou", async () => {
    const db = await banco(true);
    try {
      await aguardarEm(db, SUPORTE);
      const r = await receber(db, "2", "m2");
      expect(r.fluxo?.id).toBe(SUPORTE);
      expect(r.execucao?.no_atual).toBe("menu-unidades");
    } finally { await db.close(); }
  }, 30000);
  it("fluxo desativado que nenhum outro chama continua sem responder", async () => {
    const db = await banco(true);
    try {
      await aguardarEm(db, DESATIVADO);
      expect((await receber(db, "2", "m2")).fluxo).toBeNull();
    } finally { await db.close(); }
  }, 30000);
});
