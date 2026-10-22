import { supabase } from "@/integrations/supabase/client";
import type { NovoTitulo, OrigemTitulo } from "@/lib/financeiro";
import type { Row } from "@/lib/row";
import { linhasDoTitulo, type FonteRateio } from "@/lib/rateio";

/** Quantos títulos uma origem já gerou (evita duplicar). */
export async function contarTitulosDaOrigem(origemIds: string[], tipos: OrigemTitulo[]) {
  const { count, error } = await supabase
    .from("financeiro_titulos")
    .select("id", { count: "exact", head: true })
    .in("origem_id", origemIds)
    .in("origem_tipo", tipos);
  if (error) throw error;
  return count ?? 0;
}

/** Remove os títulos ainda em aberto de uma origem (usado em "regerar"). */
export async function apagarAbertosDaOrigem(origemIds: string[], tipos: OrigemTitulo[]) {
  const { error } = await supabase
    .from("financeiro_titulos")
    .delete()
    .in("origem_id", origemIds)
    .in("origem_tipo", tipos)
    .eq("status", "aberto");
  if (error) throw error;
}

export async function inserirTitulos(empresaId: string, titulos: NovoTitulo[], rateio?: { fontes: FonteRateio[]; clienteId?: string | null }) {
  if (!titulos.length) return 0;
  const linhas = titulos.map((t) => ({ ...t, empresa_id: empresaId, status: "aberto" }));
  let { data, error } = await supabase.from("financeiro_titulos").insert(linhas as never).select("id");
  if (error && /cliente_atendido_id/.test(error.message)) {
    // Script do faturamento misto ainda não rodado: grava sem o cliente atendido.
    ({ data, error } = await supabase
      .from("financeiro_titulos")
      .insert(linhas.map(({ cliente_atendido_id: _c, ...r }) => r) as never).select("id"));
  }
  if (error) throw error;
  if (rateio?.fontes.length && data?.length === titulos.length) await gravarRateio(empresaId, titulos, data as { id: string }[], rateio);
  return titulos.length;
}

/** Linhas por item/centro de custo de cada título recém-criado. Sem o script do rateio, apenas ignora. */
async function gravarRateio(empresaId: string, titulos: NovoTitulo[], ids: { id: string }[], rateio: { fontes: FonteRateio[]; clienteId?: string | null }) {
  const lote = titulos.flatMap((t, i) => linhasDoTitulo(t, rateio.fontes, rateio.clienteId ?? null)
    .map((l) => ({ ...l, empresa_id: empresaId, titulo_id: ids[i]!.id })));
  if (!lote.length) return;
  const { error } = await supabase.from("financeiro_titulos_itens" as never).insert(lote as never);
  if (error && !/financeiro_titulos_itens|schema cache|does not exist/i.test(error.message)) throw error;
}

/** Centro de custo e conta gerencial de cada produto/serviço. */
async function classificacaoDosItens(ids: string[]) {
  const m = new Map<string, { centro: string | null; conta: string | null; nome: string }>();
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return m;
  let { data, error } = await supabase.from("itens").select("*").in("id", unicos);
  if (error) throw error;
  for (const r of (data ?? []) as Row[]) m.set(String(r["id"]), {
    centro: (r["centro_custo_id"] as string) || null, conta: (r["plano_contas_id"] as string) || null,
    nome: String(r["descricao"] ?? r["nome"] ?? ""),
  });
  data = null;
  return m;
}

/** Fontes de rateio dos itens gravados de uma Oferta (herdam o centro de custo do produto/serviço). */
export async function fontesDaOferta(itens: Row[]): Promise<FonteRateio[]> {
  const cls = await classificacaoDosItens(itens.map((i) => String(i["item_id"] ?? "")));
  return itens.map((i) => {
    const c = cls.get(String(i["item_id"] ?? ""));
    return {
      item_id: (i["item_id"] as string) || null, descricao: String(i["detalhe"] ?? "") || c?.nome || "Item",
      quantidade: Number(i["quantidade"] ?? 1) || 1, peso: Number(i["total_linha"] ?? 0) || 0,
      centro_custo_id: (i["centro_custo_id"] as string) || c?.centro || null, plano_contas_id: c?.conta ?? null,
      recorrente: String(i["natureza"] ?? "") === "recorrente", pagador: (i["faturar_para_id"] as string) || null,
      origem_tipo: "oferta_item" as const, origem_id: (i["id"] as string) || null,
    };
  });
}

/** Fontes de rateio dos itens de um pedido de compra. */
export async function fontesDoPedido(pedidoId: string): Promise<FonteRateio[]> {
  const { data, error } = await supabase.from("pedidos_compra_itens").select("*").eq("pedido_id", pedidoId);
  if (error) throw error;
  const itens = (data ?? []) as Row[];
  const cls = await classificacaoDosItens(itens.map((i) => String(i["item_id"] ?? "")));
  return itens.map((i) => {
    const c = cls.get(String(i["item_id"] ?? ""));
    return {
      item_id: (i["item_id"] as string) || null, descricao: c?.nome || "Item", quantidade: Number(i["quantidade"] ?? 1) || 1,
      peso: Number(i["total"] ?? 0) || 0, centro_custo_id: c?.centro ?? null, plano_contas_id: c?.conta ?? null,
      origem_tipo: "pedido_item" as const, origem_id: (i["id"] as string) || null,
    };
  });
}

/** Itens gravados de uma Oferta (natureza, total e pagador de cada um). */
export async function itensDaOferta(orcamentoId: string) {
  const { data, error } = await supabase.from("orcamento_itens").select("*").eq("orcamento_id", orcamentoId);
  if (error) throw error;
  return (data ?? []) as Row[];
}

export const erroFinanceiro = (e: unknown) => {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? "");
  return m.includes("financeiro_titulos") ? "Rode o script atendeai-financeiro.sql no banco." : m || "Falha no financeiro.";
};
