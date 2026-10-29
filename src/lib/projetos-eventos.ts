import { supabase } from "@/integrations/supabase/client";
import { instanciaParaAvisos, ordenarParaAvisos } from "@/lib/instancia-finalidade";
import { dispararMensagem } from "@/lib/atendimentos-envio";
import { text } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";

export const EVENTOS = "projetos_eventos";

type Evento = {
  empresaId: unknown;
  autorId: unknown;
  autorNome: string;
  projetoId: unknown;
  /** Tarefa a abrir pelo aviso (link direto). */
  tarefaId?: unknown;
  projetoNome?: string;
  tipo: "tarefa" | "atividade";
  acao: "criou" | "alterou";
  titulo: string;
  prazo?: unknown;
  responsaveis: string[];
  anteriores: string[];
};

/**
 * Registra o evento no feed (um por responsável citado, exceto o autor) e avisa por
 * WhatsApp os responsáveis recém-incluídos quando a empresa tem instância ativa.
 * Falhas aqui nunca bloqueiam o salvamento.
 */
export async function registrarEventoProjeto(e: Evento) {
  const autor = String(e.autorId ?? "");
  // Inclui o próprio autor quando ele se atribui, para receber WhatsApp e aviso no sininho.
  const alvos = [...new Set(e.responsaveis.map(String))].filter(Boolean);
  if (alvos.length === 0) return;
  const novos = new Set(alvos.filter((id) => !e.anteriores.map(String).includes(id)));
  const itemLabel = e.tipo === "tarefa" ? "tarefa" : "atividade";

  const linhas = alvos.map((uid) => ({
        tarefa_id: e.tarefaId ? String(e.tarefaId) : null,
        empresa_id: e.empresaId ?? null,
        usuario_id: uid,
        autor_id: autor || null,
        projeto_id: e.projetoId ?? null,
        tipo: e.tipo,
        acao: novos.has(uid) ? "atribuiu" : e.acao,
        descricao: `${e.autorNome || "Alguém"} ${novos.has(uid) ? "atribuiu você à" : `${e.acao} a`} ${itemLabel} "${e.titulo}"${e.projetoNome ? ` no projeto ${e.projetoNome}` : ""}.`,
      }));
  try {
    const { error } = await supabase.from(EVENTOS as never).insert(linhas as never);
    // Sem a coluna tarefa_id (script não rodado), grava sem o link direto.
    if (error) await supabase.from(EVENTOS as never).insert(linhas.map(({ tarefa_id: _t, ...r }) => r) as never);
  } catch { /* feed opcional */ }

  if (novos.size === 0) return;
  try {
    const { data: insts } = await supabase.from("empresas_instancias").select("*").eq("empresa_id", e.empresaId as never);
    const inst = instanciaParaAvisos((insts ?? []) as Row[]) ?? (insts as Row[] | null)?.[0];
    if (!inst) return;
    const { data: users } = await supabase.from("usuarios").select("*").in("id", [...novos] as never);
    const prazo = e.prazo ? String(e.prazo).slice(0, 10).split("-").reverse().join("/") : "";
    const link = typeof window !== "undefined" ? `${window.location.origin}${linkItemProjeto(e.projetoId, e.tarefaId)}` : "";
    for (const u of (users ?? []) as Row[]) {
      const tel = text(pick(u, ["telefone", "celular", "whatsapp"]));
      if (!tel) continue;
      const msg = [
        `Olá ${text(pick(u, ["nome"])).split(" ")[0]}, você foi atribuído(a) à ${itemLabel} *${e.titulo}*${e.projetoNome ? ` no projeto *${e.projetoNome}*` : ""} por ${e.autorNome || "um colega"}.`,
        prazo ? `Prazo: ${prazo}.` : "",
        link ? `Acesse: ${link}` : "",
        "\n_Mensagem automática do sistema. Não é preciso responder._",
      ].filter(Boolean).join("\n");
      await dispararMensagem({ instancia: inst, mensagemId: null, atendimentoId: null, telefone: tel, texto: msg }).catch(() => false);
    }
  } catch { /* aviso opcional */ }
}

/** Link direto para o item: abre o projeto e a tarefa na tela de Projetos. */
export function linkItemProjeto(projetoId: unknown, tarefaId: unknown): string {
  const q = new URLSearchParams();
  if (projetoId) q.set("projeto", String(projetoId));
  if (tarefaId) q.set("tarefa", String(tarefaId));
  const s = q.toString();
  return s ? `/projetos?${s}` : "/projetos";
}
