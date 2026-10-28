import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adicionarAviso, listarAvisos } from "@/lib/avisos";
import { instanciaParaAvisos } from "@/lib/instancia-finalidade";
import { dispararMensagem } from "@/lib/atendimentos-envio";
import { text } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { situacaoAtivada } from "@/lib/oferta-ativacao";

export const AVISOS_EQUIPE = "avisos_equipe";
const INTERVALO = 30 * 1000;

type Notificacao = {
  empresaId: unknown;
  autorId: unknown;
  usuarioIds: unknown[];
  titulo: string;
  texto: string;
  /** Caminho interno (ex.: /cotacoes). */
  link?: string;
};

/**
 * Avisa colegas no sininho (tabela avisos_equipe, lida pelo destinatário) e por WhatsApp
 * pela instância de avisos da empresa. Retorna quantos WhatsApps saíram; falhas nunca bloqueiam o fluxo.
 */
export async function notificarEquipe(n: Notificacao): Promise<{ avisos: number; whatsapp: number }> {
  const ids = [...new Set(n.usuarioIds.map((x) => String(x ?? "")).filter(Boolean))];
  if (!ids.length) return { avisos: 0, whatsapp: 0 };
  let avisos = 0;
  let whatsapp = 0;
  try {
    const { error } = await supabase.from(AVISOS_EQUIPE as never).insert(ids.map((uid) => ({
      empresa_id: n.empresaId ?? null, usuario_id: uid, autor_id: n.autorId ?? null,
      titulo: n.titulo, texto: n.texto, link: n.link ?? null,
    })) as never);
    if (!error) avisos = ids.length;
  } catch { /* sininho opcional */ }
  try {
    const { data: insts } = await supabase.from("empresas_instancias").select("*").eq("empresa_id", n.empresaId as never);
    const inst = instanciaParaAvisos((insts ?? []) as Row[]) ?? (insts as Row[] | null)?.[0];
    if (!inst) return { avisos, whatsapp };
    const { data: users } = await supabase.from("usuarios").select("*").in("id", ids as never);
    const url = typeof window !== "undefined" && n.link ? `${window.location.origin}${n.link}` : "";
    for (const u of (users ?? []) as Row[]) {
      const tel = text(pick(u, ["telefone", "celular", "whatsapp"]));
      if (!tel) continue;
      const msg = [
        `Olá ${text(pick(u, ["nome"])).split(" ")[0]}, *${n.titulo}*`,
        n.texto,
        url ? `Acesse: ${url}` : "",
        "\n_Mensagem automática do sistema. Não é preciso responder._",
      ].filter(Boolean).join("\n");
      const ok = await dispararMensagem({ instancia: inst, mensagemId: null, atendimentoId: null, telefone: tel, texto: msg }).catch(() => false);
      if (ok) whatsapp++;
    }
  } catch { /* WhatsApp opcional */ }
  return { avisos, whatsapp };
}

/** Traz para o sininho os avisos que colegas enviaram a este usuário. */
export function useAvisosEquipe(usuarioId: unknown) {
  useEffect(() => {
    const uid = String(usuarioId ?? "");
    if (!uid || typeof window === "undefined") return;
    let parado = false;
    const checar = async () => {
      const desde = new Date(Date.now() - 7 * 864e5).toISOString();
      const { data, error } = await supabase.from(AVISOS_EQUIPE as never).select("*")
        .eq("usuario_id", uid as never).eq("lido", false as never).gte("created_at", desde as never)
        .order("created_at", { ascending: true }).limit(30);
      if (parado || error || !data) return;
      const existentes = new Set(listarAvisos().map((a) => a.chave));
      const entregues: string[] = [];
      for (const a of data as Row[]) {
        const chave = `equipe:${String(a["id"])}`;
        entregues.push(String(a["id"]));
        if (existentes.has(chave)) continue;
        adicionarAviso({ tipo: "equipe", chave, titulo: text(a["titulo"]), texto: text(a["texto"]), ...(text(a["link"]) ? { link: text(a["link"]) } : {}) });
        toast.info(text(a["titulo"]));
      }
      if (entregues.length) await supabase.from(AVISOS_EQUIPE as never).update({ lido: true } as never).in("id", entregues as never);
    };
    void checar();
    const t = setInterval(() => void checar(), INTERVALO);
    return () => { parado = true; clearInterval(t); };
  }, [usuarioId]);
}

/** Lembra o responsável das Ofertas em Ativação cujas atividades (compras, projeto, financeiro) ainda não foram feitas. */
export function useAvisosAtivacao(usuarioId: unknown) {
  useEffect(() => {
    const uid = String(usuarioId ?? "");
    if (!uid || typeof window === "undefined") return;
    let parado = false;
    const checar = async () => {
      const { data, error } = await supabase.from("orcamentos" as never)
        .select("id, numero, situacao, ativacao_concluida_em, parceiro:parceiro_id(nome_fantasia, razao_social)")
        .eq("usuario_id", uid as never).is("ativacao_concluida_em", null).ilike("situacao", "%ativa%").limit(30);
      if (parado || error || !data) return;
      const existentes = new Set(listarAvisos().map((a) => a.chave));
      const dia = new Date().toISOString().slice(0, 10);
      for (const o of data as Row[]) {
        if (!situacaoAtivada(o["situacao"])) continue;
        const chave = `ativacao:${String(o["id"])}:${dia}`;
        if (existentes.has(chave)) continue;
        const p = (o["parceiro"] ?? {}) as Row;
        const nome = text(p["nome_fantasia"]) || text(p["razao_social"]) || "Cliente";
        adicionarAviso({ tipo: "cliente", chave, titulo: "Oferta pendente de atividades", texto: `Oferta ${text(o["numero"])} · ${nome}: gere pedidos de compra, projeto e financeiro.`, link: "/orcamentos" });
      }
    };
    void checar();
    const t = setInterval(() => void checar(), 5 * 60 * 1000);
    return () => { parado = true; clearInterval(t); };
  }, [usuarioId]);
}
