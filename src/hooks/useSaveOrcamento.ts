import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { atualizarVisoes, idColumn } from "@/lib/crud";
import { useAudit } from "@/lib/audit";
import { formatNumero, toISODate, yearOf } from "@/lib/orcamentos";
import type { Row } from "@/lib/row";
import { vincularKanban } from "@/lib/orcamento-kanban";
import { TIPO_MODELO_PADRAO, totaisDasLinhas } from "@/lib/orcamento-totais-auto";

export type LinhaPayload = {
  id?: string | undefined;
  ordem: number;
  item_id: string | null;
  detalhe: string | null;
  quantidade: number;
  unidade_medida_id: string | null;
  valor_unitario: number;
  total_linha: number;
  preco_custo: number;
  imposto_pct: number;
  imposto_valor: number;
  custo_total: number;
  lucro: number;
  margem_pct: number;
  natureza?: string;
  bloco?: string | null;
  faturar_para_id?: string | null;
  execucao?: string;
  fornecedor_id?: string | null;
  incluso?: boolean;
  desconto_linha?: number;
  dt_inicio_faturamento?: string | null;
};

/**
 * Executa a gravação removendo colunas que ainda não existem no banco
 * (ex.: script de modalidades não executado), para não travar o salvamento.
 */
async function gravarTolerante<T extends Row | Row[]>(
  payload: T,
  run: (p: T) => PromiseLike<{ data?: unknown; error: { code?: string; message: string } | null }>,
) {
  let atual = payload;
  const ausentes: string[] = [];
  for (let i = 0; i < 15; i += 1) {
    const res = await run(atual);
    const m = res.error?.message.match(/Could not find the '([^']+)' column/);
    if (!res.error || !m) {
      if (ausentes.length) {
        toast.warning("Alguns campos novos não foram gravados", {
          description: `Execute o script de modalidades no banco (${ausentes.join(", ")}).`,
        });
      }
      return res;
    }
    const col = m[1]!;
    ausentes.push(col);
    const tira = (r: Row) => {
      const { [col]: _x, ...rest } = r;
      return rest;
    };
    atual = (Array.isArray(atual) ? atual.map(tira) : tira(atual as Row)) as T;
  }
  return run(atual);
}

export type SaveOrcamentoInput = {
  header: Row;
  linhas: LinhaPayload[];
  original: Row | null;
};

/**
 * Grava o cabeçalho em `orcamentos` e sincroniza as linhas em `orcamento_itens`
 * (remove as excluídas, atualiza as existentes e insere as novas).
 * O número (#ano-sequência) é gerado pelo gatilho do banco; há um fallback
 * no cliente caso o gatilho não esteja instalado.
 */
export function useSaveOrcamento() {
  const queryClient = useQueryClient();
  const { stamp, usuarioId } = useAudit();

  return useMutation({
    mutationFn: async ({
      header,
      linhas,
      original,
    }: SaveOrcamentoInput): Promise<{ id: string; numero: string; linhas: Row[] }> => {
      header = await vincularKanban(header, original);
      if (header["total_liquido"] === undefined && linhas.length) header = { ...totaisDasLinhas(linhas), ...header };
      if (!original && header["blocos_selecionados"] === undefined && header["empresa_id"]) {
        const { data: padrao } = await supabase
          .from("orcamentos_templates" as never)
          .select("conteudo")
          .eq("empresa_id", String(header["empresa_id"]))
          .eq("tipo", TIPO_MODELO_PADRAO)
          .limit(1);
        const raw = (padrao as Row[] | null)?.[0]?.["conteudo"];
        if (raw) {
          try { header = { ...header, blocos_selecionados: JSON.parse(String(raw)) }; } catch { /* modelo inválido: ignora */ }
        }
      }
      let id: string;
      let numero = String(original?.["numero"] ?? "");

      if (original) {
        const key = idColumn(original);
        id = String(original[key]);
        const { error } = await gravarTolerante(stamp(header, false), (p) =>
          supabase.from("orcamentos").update(p).eq(key, id),
        );
        if (error) throw error;
      } else {
        const { data, error } = await gravarTolerante(stamp(header, true), (p) =>
          supabase
            .from("orcamentos")
            .insert(p)
            .select("id, numero, ano, sequencia, empresa_id, dt_orcamento")
            .single(),
        );
        if (error) throw error;
        const created = data as Row;
        id = String(created["id"]);
        numero = String(created["numero"] ?? "");

        if (!numero) {
          // Fallback: gatilho ausente — numera pelo maior sequencial do ano/empresa.
          const ano = yearOf(created["dt_orcamento"]) ?? new Date().getFullYear();
          let q = supabase
            .from("orcamentos")
            .select("sequencia")
            .eq("ano", ano)
            .order("sequencia", { ascending: false })
            .limit(1);
          if (created["empresa_id"]) q = q.eq("empresa_id", String(created["empresa_id"]));
          const { data: last } = await q;
          const seqAtual = Number((last?.[0] as Row | undefined)?.["sequencia"] ?? 0) || 0;
          const sequencia = seqAtual + 1;
          numero = formatNumero(ano, sequencia);
          const { error: numErr } = await supabase
            .from("orcamentos")
            .update({ numero, ano, sequencia })
            .eq("id", id);
          if (numErr) throw numErr;
        }
      }

      // ---- linhas -------------------------------------------------------
      const { data: existentes, error: readErr } = await supabase
        .from("orcamento_itens")
        .select("id")
        .eq("orcamento_id", id);
      if (readErr) throw readErr;

      const manter = new Set(linhas.map((l) => l.id).filter((v): v is string => Boolean(v)));
      const remover = ((existentes ?? []) as Row[])
        .map((r) => String(r["id"]))
        .filter((rid) => !manter.has(rid));
      if (remover.length) {
        const { error } = await supabase.from("orcamento_itens").delete().in("id", remover);
        if (error) throw error;
      }

      const auditoria: Row = usuarioId !== undefined ? { alterado_por: usuarioId } : {};
      const atualizar = linhas.filter((l) => l.id);
      const inserir = linhas.filter((l) => !l.id);

      for (const l of atualizar) {
        const { id: lid, ...rest } = l;
        const { error } = await gravarTolerante({ ...rest, orcamento_id: id, ...auditoria } as Row, (p) =>
          supabase.from("orcamento_itens").update(p).eq("id", lid!),
        );
        if (error) throw error;
      }
      if (inserir.length) {
        const { error } = await gravarTolerante(
          inserir.map(({ id: _omit, ...rest }) => ({ ...rest, orcamento_id: id, ...auditoria }) as Row),
          (p) => supabase.from("orcamento_itens").insert(p),
        );
        if (error) throw error;
      }

      const { data: gravadas, error: linhasErr } = await supabase
        .from("orcamento_itens")
        .select("*")
        .eq("orcamento_id", id)
        .order("ordem", { ascending: true });
      if (linhasErr) throw linhasErr;
      return { id, numero, linhas: (gravadas ?? []) as Row[] };
    },
    onSuccess: ({ numero }) => {
      void atualizarVisoes(queryClient, "orcamentos", "orcamento_itens");
      toast.success(
        numero ? `Oferta ${numero} salva com sucesso.` : "Oferta salva com sucesso.",
      );
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a oferta.");
    },
  });
}

/** Atualiza apenas a situação (ação rápida na listagem). */
export function useAlterarSituacao() {
  const queryClient = useQueryClient();
  const { stamp } = useAudit();
  return useMutation({
    mutationFn: async ({ row, situacao }: { row: Row; situacao: string }) => {
      const key = idColumn(row);
      const patch = await vincularKanban({ situacao }, row);
      const { error } = await supabase
        .from("orcamentos")
        .update(stamp(patch, false))
        .eq(key, row[key] as never);
      if (error) throw error;
    },
    onSuccess: (_d, { situacao }) => {
      void atualizarVisoes(queryClient, "orcamentos");
      toast.success(`Situação alterada para "${situacao}".`);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar a situação.");
    },
  });
}

/** Garante que datas vindas do formulário sejam gravadas como yyyy-mm-dd ou null. */
export function dateOrNull(value: string): string | null {
  const iso = toISODate(value);
  return iso || null;
}
