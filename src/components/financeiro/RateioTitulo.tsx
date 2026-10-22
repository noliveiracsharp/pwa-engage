import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Split, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { rowId, text, useTableRows } from "@/lib/crud";
import { buildTree } from "@/lib/hierarchy";
import { mascaraMoeda, moedaDeNumero } from "@/lib/input-masks";
import { formatBRL, num, round2 } from "@/lib/orcamentos";
import { diferencaRateio } from "@/lib/rateio";
import { erroFinanceiro } from "@/lib/financeiro-db";
import type { Row } from "@/lib/row";

type Linha = { id?: string; descricao: string; valor: string; centro_custo_id: string; plano_contas_id: string; item_id: string | null; origem_tipo: string; origem_id: string | null };

const valorNum = (v: string) => num(String(v).replace(/\./g, "").replace(",", "."));

function opcoesArvore(rows: Row[], pai: string) {
  return buildTree(rows.filter((r) => r["status"] !== false), pai).map((n) => {
    const parts = n.path.split(" > ");
    return { value: text(rowId(n.row)), label: [text(n.row["codigo"]), text(n.row["descricao"])].filter(Boolean).join(" - ") || (parts[parts.length - 1] ?? ""),
      depth: n.depth, keywords: [n.path] };
  });
}

/** Itens / rateio do título por centro de custo e conta gerencial. Grava direto, independente do formulário. */
export function RateioTitulo({ tituloId, empresaId, valorTitulo, readOnly, tipoTitulo = "receber" }: { tituloId: string; empresaId: string; valorTitulo: number; readOnly: boolean; tipoTitulo?: string }) {
  const { data: itens = [] } = useTableRows("itens");
  const itemOpts = useMemo(() => itens.filter((r) => r["status"] !== false && r["ativo"] !== false)
    .map((r) => ({ value: text(rowId(r)), label: [text(r["codigo"]), text(r["descricao"] ?? r["nome"])].filter(Boolean).join(" - ") }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")), [itens]);
  const qc = useQueryClient();
  const chave = ["financeiro_titulos_itens", tituloId];
  const q = useQuery({
    queryKey: chave,
    queryFn: async () => {
      const { data, error } = await supabase.from("financeiro_titulos_itens" as never).select("*").eq("titulo_id", tituloId).order("created_at");
      if (error) return { ok: false, rows: [] as Row[] };
      return { ok: true, rows: (data ?? []) as Row[] };
    },
  });
  const { data: centros = [] } = useTableRows("centro_custo");
  const { data: contas = [] } = useTableRows("plano_contas");
  const centroOpts = useMemo(() => opcoesArvore(centros, "centro_custo_pai_id"), [centros]);
  const contaOpts = useMemo(() => opcoesArvore(contas, "plano_contas_pai_id"), [contas]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const rows = q.data?.rows ?? [];
    setLinhas(rows.map((r) => ({ id: text(r["id"]), descricao: text(r["descricao"]), valor: moedaDeNumero(num(r["valor"])),
      centro_custo_id: text(r["centro_custo_id"]), plano_contas_id: text(r["plano_contas_id"]), item_id: (r["item_id"] as string) || null,
      origem_tipo: text(r["origem_tipo"]) || "manual", origem_id: (r["origem_id"] as string) || null })));
    if (rows.length) setAberto(true);
  }, [q.data]);

  if (q.data && !q.data.ok) return null; // script do rateio ainda não rodado
  const dif = diferencaRateio(valorTitulo, linhas.map((l) => ({ valor: valorNum(l.valor) })));
  const set = (i: number, p: Partial<Linha>) => setLinhas(linhas.map((l, k) => (k === i ? { ...l, ...p } : l)));
  /** Ao escolher um produto/serviço, herda descrição, centro de custo, conta e preço (respeitando o que falta fechar). */
  function escolherItem(i: number, id: string) {
    const it = itens.find((r) => text(rowId(r)) === id);
    if (!it) return set(i, { item_id: null });
    const atual = linhas[i]!;
    const preco = num(it[tipoTitulo === "pagar" ? "preco_custo" : "preco_venda"]) || num(it["preco_venda"]);
    const resto = round2(dif + valorNum(atual.valor));
    const valor = atual.valor && valorNum(atual.valor) > 0 ? atual.valor : moedaDeNumero(preco > 0 ? preco : Math.max(resto, 0));
    set(i, {
      item_id: id, descricao: text(it["descricao"] ?? it["nome"]),
      centro_custo_id: text(it["centro_custo_id"]) || atual.centro_custo_id,
      plano_contas_id: text(it["plano_contas_id"]) || atual.plano_contas_id,
      valor, origem_tipo: atual.origem_tipo === "manual" ? "manual" : atual.origem_tipo,
    });
  }

  async function salvar() {
    if (linhas.length && dif !== 0) { toast.error(`A soma das linhas precisa fechar com o título (diferença de ${formatBRL(dif)}).`); return; }
    if (linhas.some((l) => !l.centro_custo_id)) { toast.error("Escolha o centro de custo de todas as linhas."); return; }
    setSalvando(true);
    try {
      const del = await supabase.from("financeiro_titulos_itens" as never).delete().eq("titulo_id", tituloId);
      if (del.error) throw del.error;
      if (linhas.length) {
        const { error } = await supabase.from("financeiro_titulos_itens" as never).insert(linhas.map((l) => ({
          empresa_id: empresaId, titulo_id: tituloId, descricao: l.descricao.trim() || "Item", valor: round2(valorNum(l.valor)),
          centro_custo_id: l.centro_custo_id || null, plano_contas_id: l.plano_contas_id || null, item_id: l.item_id,
          origem_tipo: l.origem_tipo, origem_id: l.origem_id,
        })) as never);
        if (error) throw error;
      }
      toast.success("Rateio salvo.");
      qc.invalidateQueries({ queryKey: chave });
    } catch (e) { toast.error(erroFinanceiro(e)); } finally { setSalvando(false); }
  }

  if (!aberto) {
    return readOnly ? null : (
      <Button type="button" variant="outline" size="sm" className="sm:col-span-2 justify-self-start" onClick={() => {
        setAberto(true);
        if (!linhas.length) setLinhas([{ descricao: "", valor: moedaDeNumero(valorTitulo), centro_custo_id: "", plano_contas_id: "", item_id: null, origem_tipo: "manual", origem_id: null }]);
      }}><Split className="mr-1 h-4 w-4" /> Detalhar itens / rateio por centro de custo</Button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border p-3 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium"><Split className="h-4 w-4 text-primary" /> Itens / rateio</p>
        <span className={dif === 0 ? "text-muted-foreground text-xs" : "text-destructive text-xs font-medium"}>
          {dif === 0 ? `Fechado em ${formatBRL(valorTitulo)}` : `Diferença: ${formatBRL(dif)}`}
        </span>
      </div>
      {linhas.map((l, i) => (
        <div key={l.id ?? `n${i}`} className="grid gap-2 rounded-md bg-muted/40 p-2 sm:grid-cols-[1fr_8rem_auto]">
          <div className="sm:col-span-3">
            <SearchSelect value={l.item_id ?? ""} disabled={readOnly} options={itemOpts} placeholder="Produto ou serviço do cadastro (preenche centro de custo e valor)"
              onChange={(x) => escolherItem(i, x)} />
          </div>
          <Input value={l.descricao} disabled={readOnly} placeholder="Descrição do item" onChange={(e) => set(i, { descricao: e.target.value })} />
          <Input value={l.valor} disabled={readOnly} inputMode="decimal" placeholder="0,00" onChange={(e) => set(i, { valor: mascaraMoeda(e.target.value) })} />
          {!readOnly && <Button type="button" variant="ghost" size="icon" aria-label="Remover linha" onClick={() => setLinhas(linhas.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>}
          <div className="sm:col-span-3 grid gap-2 sm:grid-cols-2">
            <SearchSelect value={l.centro_custo_id} disabled={readOnly} options={centroOpts} placeholder="Centro de custo" onChange={(x) => set(i, { centro_custo_id: x })} />
            <SearchSelect value={l.plano_contas_id} disabled={readOnly} options={contaOpts} placeholder="Conta gerencial (Plano de Contas)" onChange={(x) => set(i, { plano_contas_id: x })} />
          </div>
        </div>
      ))}
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setLinhas([...linhas, { descricao: "", valor: dif > 0 ? moedaDeNumero(dif) : "", centro_custo_id: "", plano_contas_id: "", item_id: null, origem_tipo: "manual", origem_id: null }])}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar linha</Button>
          <Button type="button" size="sm" disabled={salvando} onClick={salvar}>Salvar rateio</Button>
        </div>
      )}
    </div>
  );
}
