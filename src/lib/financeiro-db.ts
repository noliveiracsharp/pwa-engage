import { supabase } from "@/integrations/supabase/client";
import type { NovoTitulo, OrigemTitulo } from "@/lib/financeiro";
import type { Row } from "@/lib/row";

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

export async function inserirTitulos(empresaId: string, titulos: NovoTitulo[]) {
  if (!titulos.length) return 0;
  const linhas = titulos.map((t) => ({ ...t, empresa_id: empresaId, status: "aberto" }));
  let { error } = await supabase.from("financeiro_titulos").insert(linhas as never);
  if (error && /cliente_atendido_id/.test(error.message)) {
    // Script do faturamento misto ainda não rodado: grava sem o cliente atendido.
    ({ error } = await supabase
      .from("financeiro_titulos")
      .insert(linhas.map(({ cliente_atendido_id: _c, ...r }) => r) as never));
  }
  if (error) throw error;
  return titulos.length;
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
