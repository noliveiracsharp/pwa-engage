import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Split, Trash2 } from "lucide-react";
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
import { calcularTarifa } from "@/lib/financeiro-tarifas";
import { tarifaPorLinha } from "@/lib/rateio-tarifa";
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
export function RateioTitulo({ tituloId, empresaId, valorTitulo, readOnly, tipoTitulo = "receber", formaPagamento = "", contaBancariaId = "" }: { tituloId: string; empresaId: string; valorTitulo: number; readOnly: boolean; tipoTitulo?: string; formaPagamento?: string; contaBancariaId?: string }) {
  const { data: itens = [] } = useTableRows("itens");
  const { data: contasBanc = [] } = useTableRows("financeiro_contas_bancarias");
  const contaBanc = contasBanc.find((c) => text(rowId(c)) === contaBancariaId) ?? contasBanc.find((c) => c["padrao"]) ?? null;
  // Tarifa de baixa (Pix/Boleto) da conta; sem forma ou sem tarifa cadastrada = 0 e nada muda.
  const tarifaTitulo = tipoTitulo === "receber" ? calcularTarifa(contaBanc as never, formaPagamento, Number.MAX_SAFE_INTEGER - 1).tarifa : 0;
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
  const [editando, setEditando] = useState<number | null>(null);

  useEffect(() => {
    const rows = q.data?.rows ?? [];
    setLinhas(rows.map((r) => ({ id: text(r["id"]), descricao: text(r["descricao"]), valor: moedaDeNumero(num(r["valor"])),
      centro_custo_id: text(r["centro_custo_id"]), plano_contas_id: text(r["plano_contas_id"]), item_id: (r["item_id"] as string) || null,
      origem_tipo: text(r["origem_tipo"]) || "manual", origem_id: (r["origem_id"] as string) || null })));
    if (rows.length) setAberto(true);
  }, [q.data]);

  if (q.data && !q.data.ok) return null; // script do rateio ainda não rodado
  const dif = diferencaRateio(valorTitulo, linhas.map((l) => ({ valor: valorNum(l.valor) })));
  const tarifas = tarifaPorLinha(tarifaTitulo, linhas.map((l) => valorNum(l.valor)));
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
        if (!linhas.length) { setEditando(0); } if (!linhas.length) setLinhas([{ descricao: "", valor: moedaDeNumero(valorTitulo), centro_custo_id: "", plano_contas_id: "", item_id: null, origem_tipo: "manual", origem_id: null }]);
      }}><Split className="mr-1 h-4 w-4" /> Detalhar itens / rateio por centro de custo</Button>
    );
  }

  const nova = (): Linha => ({ descricao: "", valor: dif > 0 ? moedaDeNumero(dif) : "", centro_custo_id: "", plano_contas_id: "", item_id: null, origem_tipo: "manual", origem_id: null });
  const nomeDe = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? "";
  const GRID = "sm:grid-cols-[2rem_1fr_4rem_7rem_7rem_5rem] sm:gap-3";

  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><Split className="h-4 w-4 text-primary" /> Itens / rateio <span className="text-muted-foreground font-normal">({linhas.length})</span></p>
        <span className={dif === 0 ? "text-muted-foreground text-xs" : "text-destructive text-xs font-medium"}>
          {dif === 0 ? `Fechado em ${formatBRL(valorTitulo)}` : `Diferença: ${formatBRL(dif)}`}
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border">
        {!readOnly && (
          <div className="border-b p-2">
            <Button type="button" variant="ghost" size="sm" className="text-primary w-full" onClick={() => { setLinhas([...linhas, nova()]); setEditando(linhas.length); }}>
              <Plus className="mr-1 h-4 w-4" /> Adicionar item
            </Button>
          </div>
        )}
        {linhas.length > 0 && (
          <div className={`text-muted-foreground bg-muted/40 hidden border-b px-3 py-2 text-xs font-medium sm:grid ${GRID}`}>
            <span>#</span><span>Item</span><span className="text-right">Qtd</span><span className="text-right">Unitário</span><span className="text-right">Total</span><span className="text-right">Ações</span>
          </div>
        )}
        {linhas.length === 0 && <p className="text-muted-foreground p-4 text-center text-xs">Nenhum item ainda.</p>}
        {linhas.map((l, i) => {
          const it = l.item_id ? itens.find((r) => text(rowId(r)) === l.item_id) : null;
          const tipo = it ? (text(it["tipo"]).toLowerCase().startsWith("s") ? "Serviço" : "Produto") : "";
          const codigo = it ? text(it["codigo"]) : "";
          const v = valorNum(l.valor);
          if (editando === i && !readOnly) {
            return (
              <div key={l.id ?? `n${i}`} className="bg-primary/5 space-y-2 border-b p-3 last:border-b-0">
                <SearchSelect value={l.item_id ?? ""} options={itemOpts} placeholder="Produto ou serviço do cadastro (preenche centro de custo e valor)" onChange={(x) => escolherItem(i, x)} />
                <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
                  <Input value={l.descricao} placeholder="Descrição do item" onChange={(e) => set(i, { descricao: e.target.value })} />
                  <Input value={l.valor} inputMode="decimal" placeholder="Valor (R$)" onChange={(e) => set(i, { valor: mascaraMoeda(e.target.value) })} />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <SearchSelect value={l.centro_custo_id} options={centroOpts} placeholder="Centro de custo" onChange={(x) => set(i, { centro_custo_id: x })} />
                  <SearchSelect value={l.plano_contas_id} options={contaOpts} placeholder="Conta gerencial (Plano de Contas)" onChange={(x) => set(i, { plano_contas_id: x })} />
                </div>
                {tarifaTitulo > 0 && (
                  <div className="grid grid-cols-3 gap-2 rounded bg-background px-2 py-1 text-xs tabular-nums">
                    <div><span className="text-muted-foreground block">Preço de venda</span>{formatBRL(v)}</div>
                    <div><span className="text-muted-foreground block">Baixa ({formaPagamento})</span><span className="text-destructive">− {formatBRL(tarifas[i] ?? 0)}</span></div>
                    <div><span className="text-muted-foreground block">Valor final</span><strong>{formatBRL(round2(v - (tarifas[i] ?? 0)))}</strong></div>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => { setLinhas(linhas.filter((_, k) => k !== i)); setEditando(null); }}><Trash2 className="mr-1 h-4 w-4" /> Remover</Button>
                  <Button type="button" size="sm" onClick={() => setEditando(null)}><Check className="mr-1 h-4 w-4" /> Salvar item</Button>
                </div>
              </div>
            );
          }
          return (
            <div key={l.id ?? `n${i}`} className={`grid grid-cols-[1fr_auto] items-center gap-2 border-b px-3 py-2 last:border-b-0 ${GRID}`}>
              <span className="text-muted-foreground hidden text-xs tabular-nums sm:block">{i + 1}.</span>
              <div className="min-w-0">
                <p className="text-sm font-medium break-words">
                  {tipo && <span className="bg-primary/10 text-primary mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase">{tipo}</span>}
                  {codigo && <span className="mr-1">{codigo} –</span>}{l.descricao || "—"}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {[nomeDe(centroOpts, l.centro_custo_id) || "Sem centro de custo", nomeDe(contaOpts, l.plano_contas_id)].filter(Boolean).join(" · ")}
                </p>
                {tarifaTitulo > 0 && (
                  <p className="text-muted-foreground text-xs tabular-nums">Baixa ({formaPagamento}): <span className="text-destructive">− {formatBRL(tarifas[i] ?? 0)}</span> · Final: <strong className="text-foreground">{formatBRL(round2(v - (tarifas[i] ?? 0)))}</strong></p>
                )}
              </div>
              <span className="hidden text-right text-sm tabular-nums sm:block">1</span>
              <span className="hidden text-right text-sm tabular-nums sm:block">{formatBRL(v)}</span>
              <span className="text-right text-sm font-semibold tabular-nums">{formatBRL(v)}</span>
              {!readOnly ? (
                <div className="col-span-2 flex justify-end gap-1 sm:col-span-1">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Editar item" onClick={() => setEditando(i)}><Pencil className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Remover item" onClick={() => setLinhas(linhas.filter((_, k) => k !== i))}><Trash2 className="text-destructive h-4 w-4" /></Button>
                </div>
              ) : <span className="hidden sm:block" />}
            </div>
          );
        })}
      </div>
      {!readOnly && (
        <div className="flex justify-end">
          <Button type="button" size="sm" disabled={salvando} onClick={salvar}>Salvar rateio</Button>
        </div>
      )}
    </div>
  );
}
