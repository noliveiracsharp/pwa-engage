import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { CotacaoSheet } from "@/components/cotacoes/CotacaoSheet";
import { supabase } from "@/integrations/supabase/client";
import { useSaveOrcamento, type LinhaPayload } from "@/hooks/useSaveOrcamento";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { rowId, useDeleteRecord, useTableRows } from "@/lib/crud";
import { matchesAny } from "@/lib/input-masks";
import { COTACAO_STATUS, cotacaoStatusMeta, proximoNumero } from "@/lib/laudos";
import { useAudit } from "@/lib/audit";
import { formatDate, num, round2 } from "@/lib/orcamentos";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cotacoes")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Cotações de Compras — Atende.ai" },
      { name: "description", content: "Cotações com fornecedores via CSV, comparativo automático de preços e geração de oferta." },
      { property: "og:title", content: "Cotações de Compras — Atende.ai" },
      { property: "og:description", content: "Cotações com fornecedores via CSV, comparativo automático de preços e geração de oferta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CotacoesPage,
});

function CotacoesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const perms = usePagePermissions("/cotacoes");
  const { data: cotacoes = [], isLoading } = useTableRows("cotacoes");
  const { data: itensCot = [] } = useTableRows("cotacoes_itens");
  const { data: fornCot = [] } = useTableRows("cotacoes_fornecedores");
  const { data: precos = [] } = useTableRows("cotacoes_precos");
  const { data: laudos = [] } = useTableRows("laudos_tecnicos");
  const { data: parceiros = [] } = useTableRows("parceiros");
  const { data: itens = [] } = useTableRows("itens");
  const { data: pedidos = [] } = useTableRows("pedidos_compra");
  const remove = useDeleteRecord("cotacoes");
  const saveOrc = useSaveOrcamento();
  const { empresaId } = useAudit();

  const [novoTitulo, setNovoTitulo] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const novaCotacao = () => setNovoTitulo("Cotação avulsa");
  const criarCotacao = async () => {
    if (novoTitulo === null) return;
    const titulo = novoTitulo;
    setCriando(true);
    try {
    const numero = await proximoNumero("cotacoes", "COT", empresaId);
    const { data, error } = await supabase
      .from("cotacoes")
      .insert({ empresa_id: empresaId, numero, titulo: titulo.trim() || "Cotação avulsa", status: "pendente" })
      .select("id")
      .single();
    if (error) return void toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["table", "cotacoes"] });
    setNovoTitulo(null);
    setSelId(String((data as Row)["id"]));
    toast.success(`Cotação ${numero} criada. Adicione os itens e fornecedores.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar cotação.");
    } finally {
      setCriando(false);
    }
  };

  const [selId, setSelId] = useState<string | null>(null);
  const [aprovando, setAprovando] = useState(false);
  const [f, setF] = useState({ busca: "", status: "todos" });

  const sel = cotacoes.find((c) => String(rowId(c)) === selId) ?? null;
  const laudoById = useMemo(() => new Map(laudos.map((l) => [String(rowId(l)), l])), [laudos]);
  const parceiroById = useMemo(() => new Map(parceiros.map((p) => [String(rowId(p)), p])), [parceiros]);
  const itemById = useMemo(() => new Map(itens.map((i) => [String(rowId(i)), i])), [itens]);
  const deCot = (rows: Row[], id: string | null) => rows.filter((r) => String(r["cotacao_id"]) === id);

  const aprovar = async (melhores: Array<{ cotacaoItem: Row; preco: number; fornecedorId: string }>) => {
    if (!sel) return;
    setAprovando(true);
    try {
      const laudo = laudoById.get(String(sel["laudo_id"] ?? ""));
      const linhas: LinhaPayload[] = deCot(itensCot, selId).map((it, i) => {
        const item = itemById.get(String(it["item_id"]));
        const qtd = num(it["quantidade"]);
        const custo = melhores.find((m) => m.cotacaoItem === it)?.preco ?? 0;
        const venda = num(pick(item ?? {}, ["preco_venda", "valor_venda", "valor_unitario"]));
        const total = round2(venda * qtd);
        const custoTotal = round2(custo * qtd);
        return {
          ordem: i + 1,
          item_id: it["item_id"] ? String(it["item_id"]) : null,
          detalhe: (it["observacao"] as string) || null,
          quantidade: qtd,
          unidade_medida_id: item?.["unidade_medida_id"] ? String(item["unidade_medida_id"]) : null,
          valor_unitario: venda,
          total_linha: total,
          preco_custo: custo,
          imposto_pct: 0,
          imposto_valor: 0,
          custo_total: custoTotal,
          lucro: round2(total - custoTotal),
          margem_pct: total > 0 ? round2(((total - custoTotal) / total) * 100) : 0,
        };
      });
      const totalItens = round2(linhas.reduce((s, l) => s + l.total_linha, 0));
      const totalCusto = round2(linhas.reduce((s, l) => s + l.custo_total, 0));
      const { id } = await saveOrc.mutateAsync({
        original: null,
        linhas,
        header: {
          situacao: "Em andamento",
          dt_orcamento: new Date().toISOString().slice(0, 10),
          parceiro_id: laudo?.["parceiro_id"] ?? null,
          descricao: `Gerado da cotação ${sel["numero"] ?? ""}${laudo ? ` (laudo ${laudo["numero"] ?? ""})` : ""}`,
          total_itens: totalItens,
          desconto_tipo: "valor",
          desconto: 0,
          desconto_valor: 0,
          frete: 0,
          valores_adicionais: 0,
          total_liquido: totalItens,
          total_custo: totalCusto,
          total_imposto: 0,
          total_lucro: round2(totalItens - totalCusto),
          margem_pct: totalItens > 0 ? round2(((totalItens - totalCusto) / totalItens) * 100) : 0,
          qtd_parcelas: 1,
          tem_juros: false,
          coeficiente_juros: 0,
        },
      });
      const { error } = await supabase
        .from("cotacoes")
        .update({ status: "aprovado", orcamento_id: id, data_fechamento: new Date().toISOString() })
        .eq("id", String(selId));
      if (error) throw error;
      const vencedores = new Set(melhores.map((m) => m.fornecedorId));
      for (const fc of deCot(fornCot, selId)) {
        await supabase.from("cotacoes_fornecedores").update({ vencedor: vencedores.has(String(fc["fornecedor_id"])) }).eq("id", String(fc["id"]));
      }
      for (const t of ["cotacoes", "cotacoes_fornecedores"]) qc.invalidateQueries({ queryKey: ["table", t] });
      toast.success("Cotação aprovada. Oferta criada para o comercial.", {
        action: { label: "Abrir ofertas", onClick: () => navigate({ to: "/orcamentos" }) },
      });
      setSelId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível aprovar a cotação.");
    } finally {
      setAprovando(false);
    }
  };

  const rows = useMemo(
    () =>
      cotacoes
        .filter((r) => matchesAny([r["numero"], r["titulo"]], f.busca) && (f.status === "todos" || r["status"] === f.status))
        .sort((a, b) => String(b["created_at"] ?? "").localeCompare(String(a["created_at"] ?? ""))),
    [cotacoes, f],
  );

  const columns: Column[] = [
    { key: "numero", header: "Número", fields: ["numero"], render: (r) => <span className="font-semibold tabular-nums">{String(r["numero"] ?? "—")}</span> },
    { key: "abertura", header: "Abertura", fields: ["data_abertura"], render: (r) => formatDate(r["data_abertura"]) },
    {
      key: "titulo", header: "Origem", fields: ["titulo"],
      render: (r) => {
        const laudo = laudoById.get(String(r["laudo_id"] ?? ""));
        const cliente = laudo ? parceiroById.get(String(laudo["parceiro_id"])) : undefined;
        return (
          <div className="max-w-72 truncate">
            {String(r["titulo"] ?? "—")}
            {cliente && <div className="text-muted-foreground truncate text-xs">{String(pick(cliente, ["razao_social", "nome_fantasia"]) ?? "")}</div>}
          </div>
        );
      },
    },
    { key: "itens", header: "Itens", fields: [], render: (r) => deCot(itensCot, String(rowId(r))).length },
    {
      key: "forn", header: "Fornecedores", fields: [],
      render: (r) => {
        const fs = deCot(fornCot, String(rowId(r)));
        return `${fs.filter((x) => x["respondido"]).length}/${fs.length} responderam`;
      },
    },
    {
      key: "status", header: "Status", fields: ["status"],
      render: (r) => {
        const s = cotacaoStatusMeta(r["status"]);
        return <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", s.badge)}>{s.label}</span>;
      },
    },
  ];

  if (!perms.loading && !perms.canRead) {
    return <p className="text-muted-foreground text-sm">Você não tem acesso a esta página.</p>;
  }

  return (
    <>
      <DataTable
        title="Cotações de Compras"
        columns={columns}
        rows={rows}
        loading={isLoading}
        getValue={(row, keys) => pick(row, keys)}
        rowKey={(row, i) => String(rowId(row) ?? i)}
        onAdd={perms.canCreate ? novaCotacao : undefined}
        onEdit={(r) => setSelId(String(rowId(r)))}
        onDelete={perms.canDelete ? (r) => remove.mutate(r) : undefined}
        filters={
          <>
            <FilterInput label="Buscar" value={f.busca} onChange={(v) => setF({ ...f, busca: v })} placeholder="Número ou origem" />
            <FilterSelect label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[{ value: "todos", label: "Todos" }, ...COTACAO_STATUS]} />
          </>
        }
      />
      <Dialog open={novoTitulo !== null} onOpenChange={(o) => !o && setNovoTitulo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nova cotação avulsa</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cot-titulo">Título</Label>
            <Input id="cot-titulo" autoFocus value={novoTitulo ?? ""} onChange={(e) => setNovoTitulo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void criarCotacao()} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoTitulo(null)}>Cancelar</Button>
            <Button onClick={() => void criarCotacao()} disabled={criando}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CotacaoSheet
        open={!!sel}
        onOpenChange={(o) => !o && setSelId(null)}
        cotacao={sel}
        itensCot={deCot(itensCot, selId)}
        fornCot={deCot(fornCot, selId)}
        precos={deCot(precos, selId)}
        parceiros={parceiros}
        itens={itens}
        pedidos={pedidos}
        empresaId={empresaId}
        canUpdate={perms.canUpdate}
        aprovando={aprovando}
        onAprovar={aprovar}
      />
    </>
  );
}
