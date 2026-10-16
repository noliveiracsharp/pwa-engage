import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";
import { tabelaDoKanban } from "@/lib/orcamento-kanban";

export type OrigemHandoff = "orcamentos" | "atendimentos";

/** Lê o destino configurado na etapa (quadro + etapa inicial). */
export function destinoDaEtapa(etapa: Row | null | undefined): { kanban: string; etapa: string } | null {
  const k = String(etapa?.["acao_kanban_destino_id"] ?? "").trim();
  const e = String(etapa?.["acao_etapa_destino_id"] ?? "").trim();
  return k && e ? { kanban: k, etapa: e } : null;
}

/** Monta o card do quadro de destino a partir do card de origem. Devolve null se faltar o contato. */
export function cardDestino(origem: Row, tipo: OrigemHandoff, tabelaDestino: string, destino: { kanban: string; etapa: string }, descEtapa: string): Row | null {
  const empresa_id = origem["empresa_id"] ?? null;
  void tipo;
  if (tabelaDestino === "orcamentos") return null; // Oferta nasce só pelo fluxo comercial
  // Destino = atendimentos: precisa de contato (pessoa).
  const pessoa = pick(origem, ["pessoa_id", "pessoas_id", "contato_id"]);
  if (!pessoa) return null;
  const card: Row = {
    pessoa_id: pessoa,
    pessoas_id: pessoa,
    kanban_nome_id: destino.kanban,
    kanban_etapa_id: destino.etapa,
    status: descEtapa || null,
    modo_atendimento: "Humano",
    empresa_id,
  };
  const inst = pick(origem, ["instancia_id"]);
  if (inst) card["instancia_id"] = inst;
  const resp = pick(origem, ["usuario_responsavel_id", "usuario_id", "vendedor_id"]);
  if (resp) card["usuario_responsavel_id"] = resp;
  return card;
}

async function inserirTolerante(tabela: string, payload: Row) {
  let p = { ...payload };
  for (let i = 0; i < 8; i++) {
    const { error } = await supabase.from(tabela as never).insert(p as never);
    if (!error) return;
    const m = /column "?([a-z_]+)"? .*does not exist|Could not find the '([a-z_]+)' column/i.exec(error.message);
    const col = m?.[1] ?? m?.[2];
    if (!col || !(col in p)) throw error;
    delete p[col];
  }
}

/**
 * Executa a ponte entre quadros configurada na etapa de entrada.
 * Retorna mensagem para o usuário ou null quando a etapa não tem ação.
 */
export async function executarHandoff(etapaId: string, origem: Row, tipo: OrigemHandoff): Promise<{ ok: boolean; msg: string } | null> {
  if (!etapaId) return null;
  const { data: etapa } = await supabase.from("kanban_etapas").select("*").eq("id", etapaId).maybeSingle();
  const destino = destinoDaEtapa(etapa as Row | null);
  if (!destino) return null;
  const tabela = (await tabelaDoKanban(destino.kanban)) ?? "atendimentos";
  const { data: et } = await supabase.from("kanban_etapas").select("descricao").eq("id", destino.etapa).maybeSingle();
  const card = cardDestino(origem, tipo, tabela, destino, String((et as Row | null)?.["descricao"] ?? ""));
  if (!card) return { ok: false, msg: "Card não criado no outro quadro: a origem não tem contato vinculado ou o destino é de Ofertas." };
  try {
    await inserirTolerante(tabela, card);
    return { ok: true, msg: "Card criado no quadro de destino." };
  } catch (e) {
    return { ok: false, msg: `Não foi possível criar o card no outro quadro: ${e instanceof Error ? e.message : String(e)}` };
  }
}
