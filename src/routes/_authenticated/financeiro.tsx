import { periodoMesVigente } from "@/lib/utils";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Paperclip, Plus, QrCode, Trash2, Undo2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ParceiroSheet } from "@/components/parceiros/ParceiroSheet";
import { buildTree } from "@/lib/hierarchy";
import { formatCpfCnpj } from "@/lib/input-masks";
import { ContasBancarias } from "@/components/financeiro/ContasBancarias";
import { ControllerPainel } from "@/components/financeiro/ControllerPainel";
import { CategoriasDialog, useCategoriasFinanceiro } from "@/components/financeiro/CategoriasFinanceiro";
import { CobrancaDialog } from "@/components/financeiro/CobrancaDialog";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UploadInfo } from "@/components/ui/upload-info";
import { supabase } from "@/integrations/supabase/client";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useAudit } from "@/lib/audit";
import { rowId, text, useTableRows } from "@/lib/crud";
import { matchesAny } from "@/lib/input-masks";
import { formatBRL, formatDate, num, round2 } from "@/lib/orcamentos";
import { uploadFoto } from "@/lib/laudos";
import { erroFinanceiro } from "@/lib/financeiro-db";
import { alvosRecorrencia, parcelasLegadas, patchRecorrencia, serieLegada, type EscopoRecorrencia } from "@/lib/financeiro-recorrencia";
import {
  fluxoPeriodo,
  periodoVisao,
  type ModoCaixa,
  type VisaoCaixa,
  CATEGORIAS_FINANCEIRO,
  FORMAS_PAGAMENTO,
  hojeISO,
  resumoTitulos,
  SITUACAO_META,
  situacaoTitulo,
  valorBaixa,
  parcelasManuais,
  parcelasCartao,
  type ModoLancamento,
  type Situacao,
  type TipoTitulo,
} from "@/lib/financeiro";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export const Route = createFileRoute("/_authenticated/financeiro")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Financeiro — Atende.ai" },
      { name: "description", content: "Contas a receber, contas a pagar e fluxo de caixa realizado da empresa." },
      { property: "og:title", content: "Financeiro — Atende.ai" },
      { property: "og:description", content: "Contas a receber, contas a pagar e fluxo de caixa realizado da empresa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FinanceiroPage,
});

type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };

function FinanceiroPage() {
  const perms = usePagePermissions("/financeiro");
  const { data: titulos = [], isLoading } = useTableRows("financeiro_titulos");
  if (!perms.loading && !perms.canRead) return <p className="text-muted-foreground text-sm">Você não tem acesso a esta página.</p>;
  return (
    <Tabs defaultValue="receber" className="space-y-4">
      <TabsList>
        <TabsTrigger value="receber">Contas a Receber</TabsTrigger>
        <TabsTrigger value="pagar">Contas a Pagar</TabsTrigger>
        <TabsTrigger value="caixa">Fluxo de Caixa</TabsTrigger>
        <TabsTrigger value="controller">Controller</TabsTrigger>
        <TabsTrigger value="bancos">Contas Bancárias</TabsTrigger>
      </TabsList>
      <TabsContent value="receber"><Titulos tipo="receber" todos={titulos} loading={isLoading} perms={perms} /></TabsContent>
      <TabsContent value="pagar"><Titulos tipo="pagar" todos={titulos} loading={isLoading} perms={perms} /></TabsContent>
      <TabsContent value="caixa"><Caixa titulos={titulos} /></TabsContent>
      <TabsContent value="controller"><ControllerPainel titulos={titulos} /></TabsContent>
      <TabsContent value="bancos"><ContasBancarias perms={perms} /></TabsContent>
    </Tabs>
  );
}

const ORIGEM_LABEL: Record<string, string> = { manual: "Manual", oferta: "Oferta", pedido: "Pedido", despesa: "Despesa", comissao: "Comissão", reembolso: "Reembolso" };

function Titulos({ tipo, todos, loading, perms }: { tipo: TipoTitulo; todos: Row[]; loading: boolean; perms: Perms }) {
  const qc = useQueryClient();
  const { data: parceiros = [] } = useTableRows("parceiros");
  const parceiroById = useMemo(() => new Map(parceiros.map((p) => [text(rowId(p)), p])), [parceiros]);
  const nomeParc = (id: unknown) => {
    const p = parceiroById.get(text(id));
    return p ? text(p["nome_fantasia"] || p["razao_social"]) : "";
  };
  const { data: cartoes = [] } = useTableRows("despesas_cartoes");
  const categorias = useCategoriasFinanceiro(tipo);
  const [f, setF] = useState({ busca: "", situacao: "todos", categoria: "todos", cartao: "todos", visao: "mes" as VisaoCaixa, ...periodoMesVigente() });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmarLote, setConfirmarLote] = useState(false);
  const periodoF = f.visao === "personalizado" ? { de: f.de, ate: f.ate } : periodoVisao(f.visao);
  const [editar, setEditar] = useState<Row | null | undefined>(undefined);
  const [baixar, setBaixar] = useState<Row | null>(null);
  const [cobrar, setCobrar] = useState<Row | null>(null);
  const hoje = hojeISO();

  const doTipo = useMemo(() => todos.filter((t) => t["tipo"] === tipo), [todos, tipo]);
  const rows = useMemo(
    () =>
      doTipo
        .filter((t) => {
          const v = text(t["vencimento"]).slice(0, 10);
          return (
            matchesAny([t["descricao"], nomeParc(t["parceiro_id"]), t["categoria"]], f.busca) &&
            (f.situacao === "todos" || situacaoTitulo(t, hoje) === f.situacao) &&
            (f.categoria === "todos" || t["categoria"] === f.categoria) &&
            (f.cartao === "todos" || text(t["cartao_id"]) === f.cartao) &&
            (!periodoF.de || v >= periodoF.de) && (!periodoF.ate || v <= periodoF.ate)
          );
        })
        .sort((a, b) => text(a["vencimento"]).localeCompare(text(b["vencimento"]))),
    [doTipo, f, hoje], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const resumo = resumoTitulos(rows, hoje);
  const invalidar = () => qc.invalidateQueries({ queryKey: ["table", "financeiro_titulos"] });
  const faturaAberta = rows.filter((t) => t["status"] === "aberto");

  const baixarFatura = async () => {
    const total = round2(faturaAberta.reduce((s, t) => s + num(t["valor"]), 0));
    if (!window.confirm(`Baixar ${faturaAberta.length} parcela(s) da fatura, total ${formatBRL(total)}?`)) return;
    for (const t of faturaAberta) {
      const { error } = await supabase.from("financeiro_titulos").update({
        status: "pago", pago_em: hoje, valor_pago: num(t["valor"]), juros: 0, desconto: 0, forma_pagamento: "Cartão de crédito",
      } as never).eq("id", text(rowId(t)));
      if (error) return void toast.error(erroFinanceiro(error));
    }
    toast.success("Fatura baixada."); invalidar();
  };

  const estornar = async (t: Row) => {
    if (!window.confirm("Estornar a baixa deste título?")) return;
    const { error } = await supabase.from("financeiro_titulos")
      .update({ status: "aberto", pago_em: null, valor_pago: null, juros: 0, desconto: 0 } as never).eq("id", text(rowId(t)));
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success("Baixa estornada."); invalidar();
  };
  const excluir = async (t: Row) => {
    const { error } = await supabase.from("financeiro_titulos").delete().eq("id", text(rowId(t)));
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success("Título excluído."); invalidar();
  };

  const selecionados = rows.filter((t) => sel.has(text(rowId(t))));
  const todosMarcados = rows.length > 0 && selecionados.length === rows.length;
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const excluirLote = async () => {
    const ids = selecionados.map((t) => text(rowId(t)));
    const { error } = await supabase.from("financeiro_titulos").delete().in("id", ids);
    setConfirmarLote(false);
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success(`${ids.length} título(s) excluído(s).`); setSel(new Set()); invalidar();
  };

  const pagoLabel = tipo === "receber" ? "Recebido" : "Pago";
  const cards: Array<{ label: string; valor: number; sit: string; cls: string }> = [
    { label: "A vencer", valor: resumo.aVencer, sit: "aberto", cls: "border-l-primary" },
    { label: "Vencidos", valor: resumo.vencidos, sit: "atrasado", cls: "border-l-destructive" },
    { label: `${pagoLabel} no mês`, valor: resumo.pagoMes, sit: "pago", cls: "border-l-success" },
    { label: "Total em aberto", valor: resumo.emAberto, sit: "todos", cls: "border-l-warning" },
  ];

  const columns: Column[] = [
    ...(perms.canDelete ? [{ key: "sel", header: "", fields: [], sortable: false, className: "w-8", render: (t: Row) => (
      <Checkbox aria-label="Selecionar" checked={sel.has(text(rowId(t)))} onCheckedChange={() => alternar(text(rowId(t)))} />
    ) } as Column] : []),
    { key: "venc", header: "Vencimento", fields: ["vencimento"], render: (t) => <span className="tabular-nums">{formatDate(t["vencimento"])}</span> },
    { key: "desc", header: "Descrição", fields: ["descricao"], render: (t) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{text(t["descricao"])}</p>
        <p className="text-muted-foreground text-xs">{ORIGEM_LABEL[text(t["origem_tipo"])] ?? "Manual"}{t["categoria"] ? ` • ${text(t["categoria"])}` : ""}</p>
      </div>
    ) },
    { key: "parc", header: tipo === "receber" ? "Cliente" : "Fornecedor", fields: [], render: (t) => nomeParc(t["parceiro_id"]) || "—" },
    { key: "valor", header: "Valor", fields: ["valor"], render: (t) => <span className="font-semibold tabular-nums">{formatBRL(t["valor"])}</span> },
    { key: "sit", header: "Situação", fields: [], render: (t) => {
      const s = situacaoTitulo(t, hoje);
      return (
        <div>
          <span className={cn("rounded px-2 py-0.5 text-xs font-medium", SITUACAO_META[s].badge)}>{SITUACAO_META[s].label(tipo)}</span>
          {s === "pago" && <p className="text-muted-foreground mt-1 text-xs">{formatDate(t["pago_em"])} • {formatBRL(t["valor_pago"])}</p>}
        </div>
      );
    } },
    { key: "acoes", header: "", fields: [], render: (t) => {
      const s = situacaoTitulo(t, hoje);
      return (
        <div className="flex justify-end gap-1">
          {t["comprovante"] ? (
            <Button variant="ghost" size="icon" asChild title="Comprovante"><a href={text(t["comprovante"])} target="_blank" rel="noreferrer"><Paperclip className="h-4 w-4" /></a></Button>
          ) : null}
          {tipo === "receber" && perms.canUpdate && (s === "aberto" || s === "atrasado") && (
            <Button variant="ghost" size="icon" title="Cobrança Boleto + Pix" aria-label="Cobrança Boleto + Pix" onClick={() => setCobrar(t)}>
              <QrCode className={cn("h-4 w-4", t["cobranca_enviada_em"] ? "text-primary" : "")} />
            </Button>
          )}
          {perms.canUpdate && (s === "aberto" || s === "atrasado") && (
            <Button variant="ghost" size="icon" title={tipo === "receber" ? "Receber" : "Pagar"} aria-label="Baixar" onClick={() => setBaixar(t)}>
              <CheckCircle2 className="text-success h-4 w-4" />
            </Button>
          )}
          {perms.canUpdate && s === "pago" && (
            <Button variant="ghost" size="icon" title="Estornar baixa" aria-label="Estornar baixa" onClick={() => estornar(t)}><Undo2 className="h-4 w-4" /></Button>
          )}
        </div>
      );
    } },
  ];

  const exportarCsv = () => {
    const linhas = [["Vencimento", "Descrição", "Parceiro", "Categoria", "Valor", "Situação", "Pago em", "Valor pago"]];
    for (const t of rows) {
      const s = situacaoTitulo(t, hoje);
      linhas.push([formatDate(t["vencimento"]), text(t["descricao"]), nomeParc(t["parceiro_id"]), text(t["categoria"]),
        num(t["valor"]).toFixed(2).replace(".", ","), SITUACAO_META[s].label(tipo), formatDate(t["pago_em"]), t["valor_pago"] ? num(t["valor_pago"]).toFixed(2).replace(".", ",") : ""]);
    }
    const csv = "\uFEFF" + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `contas-a-${tipo}.csv`; a.click();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <button key={c.label} type="button" onClick={() => setF((s) => ({ ...s, situacao: s.situacao === c.sit ? "todos" : c.sit }))}
            className={cn("bg-card rounded-lg border border-l-4 p-3 text-left transition hover:shadow-sm", c.cls, f.situacao === c.sit && "ring-primary ring-2")}>
            <p className="text-muted-foreground text-xs">{c.label}</p>
            <p className="text-lg font-bold tabular-nums">{formatBRL(c.valor)}</p>
          </button>
        ))}
      </div>

      {perms.canDelete && rows.length > 0 && (
        <div className={cn("bg-card flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3", selecionados.length > 0 && "border-destructive")}>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={todosMarcados} onCheckedChange={() => setSel(todosMarcados ? new Set() : new Set(rows.map((t) => text(rowId(t)))))} />
            {selecionados.length > 0
              ? <span><strong>{selecionados.length}</strong> selecionado(s) • <strong className="tabular-nums">{formatBRL(selecionados.reduce((s, t) => s + num(t["valor"]), 0))}</strong></span>
              : <span className="text-muted-foreground">Selecionar todos ({rows.length})</span>}
          </label>
          {selecionados.length > 0 && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSel(new Set())}>Desmarcar</Button>
              <Button variant="destructive" size="sm" onClick={() => setConfirmarLote(true)}><Trash2 className="mr-1 h-4 w-4" />Excluir selecionados</Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={confirmarLote} onOpenChange={setConfirmarLote}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir {selecionados.length} título(s)?</DialogTitle></DialogHeader>
          <p className="text-sm">Total: <strong>{formatBRL(selecionados.reduce((s, t) => s + num(t["valor"]), 0))}</strong>. Esta ação não pode ser desfeita.</p>
          {selecionados.some((t) => situacaoTitulo(t, hoje) === "pago") && (
            <p className="text-destructive text-sm font-medium">Atenção: {selecionados.filter((t) => situacaoTitulo(t, hoje) === "pago").length} título(s) já estão baixados.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarLote(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => void excluirLote()}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DataTable
        title={tipo === "receber" ? "Contas a Receber" : "Contas a Pagar"}
        columns={columns}
        rows={rows}
        loading={loading}
        getValue={(r, fs) => r[fs[0] ?? ""]}
        rowKey={(r, i) => text(rowId(r)) || String(i)}
        onAdd={perms.canCreate ? () => setEditar(null) : undefined}
        onEdit={(r) => setEditar(r)}
        editReadOnly={!perms.canUpdate}
        onDelete={perms.canDelete ? excluir : undefined}
        filters={
          <>
            <FilterInput label="Busca" value={f.busca} onChange={(v) => setF((s) => ({ ...s, busca: v }))} placeholder="Descrição, parceiro, categoria" />
            <FilterSelect label="Situação" value={f.situacao} onChange={(v) => setF((s) => ({ ...s, situacao: v }))}
              options={[{ value: "todos", label: "Todas" }, ...(["aberto", "atrasado", "pago", "cancelado"] as Situacao[]).map((s) => ({ value: s, label: SITUACAO_META[s].label(tipo) }))]} />
            <FilterSelect label="Categoria" value={f.categoria} onChange={(v) => setF((s) => ({ ...s, categoria: v }))}
              options={[{ value: "todos", label: "Todas" }, ...categorias.todas.map((c) => ({ value: c, label: c }))]} />
            {tipo === "pagar" && cartoes.length > 0 && (
              <FilterSelect label="Cartão" value={f.cartao} onChange={(v) => setF((s) => ({ ...s, cartao: v }))}
                options={[{ value: "todos", label: "Todos" }, ...cartoes.map((c) => ({ value: text(rowId(c)), label: nomeCartao(c) }))]} />
            )}
            <FilterSelect label="Visão" value={f.visao} onChange={(v) => setF((s) => ({ ...s, visao: v as VisaoCaixa, ...(v === "personalizado" ? periodoF : {}) }))}
              options={[{ value: "mes", label: "Mês atual" }, { value: "6m", label: "6 meses" }, { value: "12m", label: "12 meses" }, { value: "personalizado", label: "Personalizado" }]} />
            {f.visao === "personalizado" && (<>
              <div className="space-y-1"><Label className="text-xs">Data início</Label><Input type="date" value={f.de} onChange={(e) => setF((s) => ({ ...s, de: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-xs">Data fim</Label><Input type="date" value={f.ate} onChange={(e) => setF((s) => ({ ...s, ate: e.target.value }))} /></div>
            </>)}
            <div className="flex items-end gap-2"><Button variant="outline" onClick={exportarCsv}>CSV</Button>
              <CategoriasDialog tipo={tipo} podeEditar={perms.canCreate || perms.canUpdate} /></div>
          </>
        }
      />

      {tipo === "pagar" && f.cartao !== "todos" && faturaAberta.length > 0 && perms.canUpdate && (
        <div className="bg-card flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
          <p className="text-sm">Fatura do período: <strong>{faturaAberta.length}</strong> parcela(s) em aberto • <strong className="tabular-nums">{formatBRL(faturaAberta.reduce((s, t) => s + num(t["valor"]), 0))}</strong></p>
          <Button onClick={baixarFatura}><CheckCircle2 className="mr-1 h-4 w-4" />Baixar fatura</Button>
        </div>
      )}

      {editar !== undefined && (
        <TituloSheet tipo={tipo} registro={editar} parceiros={parceiros} cartoes={cartoes} readOnly={!!editar && !perms.canUpdate}
          onClose={() => setEditar(undefined)} onSaved={invalidar} />
      )}
      {cobrar && <CobrancaDialog titulo={cobrar} parceiro={parceiroById.get(text(cobrar["parceiro_id"]))} onClose={() => setCobrar(null)} onSaved={invalidar} />}
      {baixar && <BaixaDialog tipo={tipo} titulo={baixar} onClose={() => setBaixar(null)} onSaved={invalidar} />}
    </div>
  );
}

type ModoForm = ModoLancamento | "cartao";

function TituloSheet({ tipo, registro, parceiros, cartoes, readOnly, onClose, onSaved }: {
  tipo: TipoTitulo; registro: Row | null; parceiros: Row[]; cartoes: Row[]; readOnly: boolean; onClose: () => void; onSaved: () => void;
}) {
  const { isMaster, empresa } = useAuth();
  const { empresaId } = useAudit();
  const categorias = useCategoriasFinanceiro(tipo);
  const [v, setV] = useState({
    descricao: text(registro?.["descricao"]),
    categoria: text(registro?.["categoria"]),
    parceiro_id: text(registro?.["parceiro_id"]),
    vencimento: text(registro?.["vencimento"]).slice(0, 10) || hojeISO(),
    valor: registro ? String(num(registro["valor"])).replace(".", ",") : "",
    repetir: "1",
    modo: "unico" as ModoForm,
    cartao_id: "",
    status: text(registro?.["status"]) || "aberto",
    observacao: text(registro?.["observacao"]),
    data_competencia: text(registro?.["data_competencia"]).slice(0, 10) || hojeISO(),
    centro_custo_id: text(registro?.["centro_custo_id"]),
    codigo_referencia: text(registro?.["codigo_referencia"]),
    conta_bancaria_id: text(registro?.["conta_bancaria_id"]),
    forma_pagamento: text(registro?.["forma_pagamento"]),
    nsu: text(registro?.["nsu"]),
    ja_pago: false,
  });
  const { data: centros = [] } = useTableRows("centro_custo");
  const { data: contas = [] } = useTableRows("financeiro_contas_bancarias");
  const centroOpts = useMemo(() => buildTree(centros.filter((c) => c["status"] !== false || text(rowId(c)) === v.centro_custo_id), "centro_custo_pai_id").map((n) => {
    const parts = n.path.split(" > ");
    const pai = parts.length > 1 ? parts[parts.length - 2] : undefined;
    return { value: text(rowId(n.row)), label: parts[parts.length - 1] ?? n.path, depth: n.depth,
      hint: pai ? `em ${pai.split(" — ").pop()}` : undefined, keywords: [n.path] };
  }), [centros, v.centro_custo_id]);
  const contaOpts = contas.map((c) => ({ value: text(rowId(c)), label: text(c["descricao"]) || text(c["banco"]) || "—" }));
  const [salvando, setSalvando] = useState(false);
  const [confirmarSerie, setConfirmarSerie] = useState(false);
  const [escopo, setEscopo] = useState<EscopoRecorrencia>("atual");
  const temSerie = !!registro && registro["origem_tipo"] === "manual" && (!!registro["origem_id"] || !!serieLegada(registro));
  const qc = useQueryClient();
  const [novoParc, setNovoParc] = useState(false);
  const [salvandoParc, setSalvandoParc] = useState(false);
  const { stamp } = useAudit();
  const criarParceiro = async (values: Row) => {
    setSalvandoParc(true);
    const payload = stamp({ ...values, ...(tipo === "pagar" ? { is_fornecedor: true } : { is_cliente: true }) }, true);
    const { data, error } = await supabase.from("parceiros").insert(payload as never).select("id").maybeSingle();
    setSalvandoParc(false);
    if (error) return void toast.error(error.code === "23505" ? "Já existe um parceiro com este CPF/CNPJ." : error.message);
    await qc.invalidateQueries({ queryKey: ["table", "parceiros"] });
    if (data) setV((s) => ({ ...s, parceiro_id: text((data as Row)["id"]) }));
    setNovoParc(false); toast.success(`${tipo === "receber" ? "Cliente" : "Fornecedor"} cadastrado.`);
  };
  const opcoes = parceiros
    .filter((p) => (tipo === "receber" ? p["is_cliente"] !== false : p["is_fornecedor"] === true) || text(rowId(p)) === v.parceiro_id)
    .map((p) => ({ value: text(rowId(p)), label: text(p["nome_fantasia"] || p["razao_social"]) || "—",
      hint: p["documento"] ? formatCpfCnpj(text(p["documento"])) : undefined,
      keywords: [text(p["razao_social"]), text(p["nome_fantasia"]), text(p["documento"]), text(p["documento"]).replace(/\D/g, "")] }));
  const cartaoModo = !registro && v.modo === "cartao";
  const cartao = cartoes.find((c) => text(rowId(c)) === v.cartao_id);
  const previa = registro ? [] : cartaoModo
    ? (cartao && cartao["dia_fechamento"] && cartao["dia_vencimento"]
      ? parcelasCartao({ valor: num(v.valor), parcelas: num(v.repetir), dataCompra: v.vencimento, diaFechamento: num(cartao["dia_fechamento"]), diaVencimento: num(cartao["dia_vencimento"]) })
      : [])
    : parcelasManuais({ modo: v.modo as ModoLancamento, valor: num(v.valor), quantidade: num(v.repetir), primeira: v.vencimento });
  const papel = tipo === "receber" ? "cliente" : "fornecedor";

  const salvar = async (alcance?: EscopoRecorrencia) => {
    const valor = round2(num(v.valor));
    if (!v.descricao.trim()) return void toast.error("Informe a descrição.");
    if (!v.parceiro_id) return void toast.error(`Escolha o ${papel}.`);
    if (valor <= 0) return void toast.error("Informe o valor.");
    if (cartaoModo && !cartao) return void toast.error("Escolha o cartão utilizado.");
    if (cartaoModo && !previa.length) return void toast.error("Informe o dia de fechamento e de vencimento do cartão.");
    if (temSerie && !alcance) { setEscopo("atual"); setConfirmarSerie(true); return; }
    setSalvando(true);
    try {
      const base = { tipo, descricao: v.descricao.trim(), categoria: v.categoria || (categorias.ativas[0] ?? ""), parceiro_id: v.parceiro_id || null,
        vencimento: v.vencimento, valor, observacao: v.observacao || null, status: v.status,
        data_competencia: v.data_competencia || null, centro_custo_id: v.centro_custo_id || null,
        codigo_referencia: v.codigo_referencia.trim() || null, conta_bancaria_id: v.conta_bancaria_id || null,
        nsu: v.nsu.trim() || null, ...(v.forma_pagamento ? { forma_pagamento: v.forma_pagamento } : {}) };
      if (registro) {
        if (temSerie && alcance) {
          let reg: Row = registro;
          let serieId = text(reg["origem_id"]);
          if (!serieId) {
            // Série antiga: vincula as parcelas irmãs a um identificador novo antes de editar.
            const { data: irmas, error: e1 } = await supabase.from("financeiro_titulos").select("*")
              .eq("origem_tipo", "manual").is("origem_id", null)
              .eq("empresa_id", text(reg["empresa_id"])).eq("tipo", tipo);
            if (e1) throw e1;
            const ids = parcelasLegadas(reg, (irmas ?? []) as Row[]).map((t) => text(t["id"]));
            serieId = crypto.randomUUID();
            const { error: e2 } = await supabase.from("financeiro_titulos").update({ origem_id: serieId } as never).in("id", ids.length ? ids : [text(reg["id"])]);
            if (e2) throw e2;
            reg = { ...reg, origem_id: serieId };
          }
          const { data, error: leituraError } = await supabase.from("financeiro_titulos").select("*")
            .eq("origem_tipo", "manual").eq("origem_id", serieId)
            .eq("empresa_id", text(reg["empresa_id"])).eq("tipo", tipo);
          if (leituraError) throw leituraError;
          const titulos = (data ?? []) as Row[];
          const atual = titulos.find((t) => t["id"] === reg["id"]);
          if (!atual) throw new Error("Este lançamento não está mais disponível. Atualize a lista.");
          const patches = alvosRecorrencia(atual, titulos, alcance, hojeISO()).map((t) => ({ id: t["id"], valores: patchRecorrencia(reg, t, base) }));
          const { error } = await supabase.rpc("editar_serie_financeira", { p_atual: reg["id"], p_escopo: alcance, p_alteracoes: patches } as never);
          if (error) {
            if (error.code === "PGRST202" || error.code === "42883") throw new Error("Execute o script de edição recorrente no SQL Editor para ativar esta opção.");
            throw error;
          }
        } else {
          const { error } = await supabase.from("financeiro_titulos").update(base as never).eq("id", text(rowId(registro)));
          if (error) throw error;
        }
      } else {
        const n = previa.length;
        const emp = isMaster && empresa ? rowId(empresa) : empresaId;
        const extra = cartaoModo ? { cartao_id: v.cartao_id, forma_pagamento: "Cartão de crédito", data_compra: v.vencimento } : {};
        const serieId = n > 1 ? crypto.randomUUID() : null;
        const lote = previa.map((p, i) => ({
          ...base, ...extra, empresa_id: emp, origem_tipo: "manual", origem_id: serieId, parcela_n: i + 1,
          descricao: n > 1 ? `${base.descricao} (${i + 1}/${n})` : base.descricao,
          vencimento: p.vencimento, valor: p.valor,
          ...(v.ja_pago && !cartaoModo && i === 0 ? { status: "pago", pago_em: p.vencimento, valor_pago: p.valor } : {}),
        }));
        const { error } = await supabase.from("financeiro_titulos").insert(lote as never);
        if (error) throw error;
      }
      toast.success(previa.length > 1 ? `${previa.length} parcelas salvas.` : "Conta salva."); onSaved(); onClose();
    } catch (e) {
      toast.error(erroFinanceiro(e));
    } finally { setSalvando(false); }
  };

  return (
    <>
    <ParceiroSheet open={novoParc} onOpenChange={setNovoParc} record={null} parceiros={parceiros} readOnly={false} saving={salvandoParc} onSave={(vals) => void criarParceiro(vals)} />
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{registro ? "Editar" : "Nova"} conta a {tipo}</SheetTitle>
          <SheetDescription>{registro ? `Origem: ${ORIGEM_LABEL[text(registro["origem_tipo"])] ?? "Manual"}` : "Lançamento manual"}</SheetDescription>
        </SheetHeader>
        <div className="grid flex-1 content-start gap-4 overflow-y-auto p-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label>Descrição</Label>
            <Input value={v.descricao} disabled={readOnly} onChange={(e) => setV({ ...v, descricao: e.target.value })} /></div>
          <div className="space-y-1"><Label>{tipo === "receber" ? "Cliente" : "Fornecedor"} *</Label>
            <div className="flex gap-2">
              <SearchSelect value={v.parceiro_id} disabled={readOnly} options={opcoes} placeholder={`Escolha o ${papel}`} searchPlaceholder="Nome ou CPF/CNPJ…"
                emptyText={`Não encontrado. Use o + para cadastrar.`} onChange={(x) => setV({ ...v, parceiro_id: x })} />
              {!readOnly && <Button type="button" variant="outline" size="icon" title={`Cadastrar ${papel}`} aria-label={`Cadastrar ${papel}`} onClick={() => setNovoParc(true)}><Plus className="h-4 w-4" /></Button>}
            </div></div>
          <div className="space-y-1"><Label>Categoria</Label>
            <div className="flex gap-2">
              <Select value={v.categoria} disabled={readOnly} onValueChange={(x) => setV({ ...v, categoria: x })}>
                <SelectTrigger><SelectValue placeholder="Escolha a categoria" /></SelectTrigger>
                <SelectContent>{[...new Set([...categorias.ativas, v.categoria].filter(Boolean))].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              {!readOnly && <CategoriasDialog tipo={tipo} podeEditar compacto />}
            </div></div>
          <div className="space-y-1"><Label>Data de competência</Label>
            <Input type="date" value={v.data_competencia} disabled={readOnly} onChange={(e) => setV({ ...v, data_competencia: e.target.value })} /></div>
          <div className="space-y-1"><Label>Código de referência</Label>
            <Input value={v.codigo_referencia} disabled={readOnly} placeholder="Nº da NF, pedido…" onChange={(e) => setV({ ...v, codigo_referencia: e.target.value })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Centro de custo</Label>
            <SearchSelect value={v.centro_custo_id} disabled={readOnly} options={centroOpts} placeholder="Escolha o centro de custo" onChange={(x) => setV({ ...v, centro_custo_id: x })} /></div>
          <div className="space-y-1"><Label>Forma de pagamento</Label>
            <SearchSelect value={v.forma_pagamento} disabled={readOnly || cartaoModo} options={FORMAS_PAGAMENTO.map((x) => ({ value: x, label: x }))} placeholder="Escolha" onChange={(x) => setV({ ...v, forma_pagamento: x })} /></div>
          <div className="space-y-1"><Label>{tipo === "receber" ? "Conta de recebimento" : "Conta de pagamento"}</Label>
            <SearchSelect value={v.conta_bancaria_id} disabled={readOnly} options={contaOpts} placeholder="Escolha a conta" onChange={(x) => setV({ ...v, conta_bancaria_id: x })} /></div>
          {tipo === "receber" && (
            <div className="space-y-1"><Label>NSU / autorização do cartão</Label>
              <Input value={v.nsu} disabled={readOnly} placeholder="Opcional" onChange={(e) => setV({ ...v, nsu: e.target.value })} /></div>
          )}
          {!registro && !cartaoModo && (
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch checked={v.ja_pago} onCheckedChange={(x) => setV({ ...v, ja_pago: x })} />
              <Label>{tipo === "receber" ? "Já recebido" : "Já pago"}{v.modo !== "unico" ? " (baixa só a 1ª parcela)" : ""}</Label>
            </div>
          )}
          {!registro && (
            <div className="space-y-1 sm:col-span-2"><Label>Repetir lançamento</Label>
              <Select value={v.modo} onValueChange={(x) => setV({ ...v, modo: x as ModoForm, repetir: x === "unico" ? "1" : v.repetir === "1" ? (x === "cartao" ? "3" : "12") : v.repetir })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unico">Único</SelectItem>
                  <SelectItem value="parcelado">Parcelado (divide o valor total)</SelectItem>
                  <SelectItem value="recorrente">Mensal recorrente (mesmo valor todo mês)</SelectItem>
                  {tipo === "pagar" && <SelectItem value="cartao">Cartão de crédito parcelado (vence na fatura)</SelectItem>}
                </SelectContent>
              </Select></div>
          )}
          {cartaoModo && (
            <div className="space-y-1 sm:col-span-2"><Label>Cartão utilizado *</Label>
              <Select value={v.cartao_id} onValueChange={(x) => setV({ ...v, cartao_id: x })}>
                <SelectTrigger><SelectValue placeholder={cartoes.length ? "Escolha o cartão" : "Cadastre um cartão em Reembolsos → Cartões"} /></SelectTrigger>
                <SelectContent>{cartoes.map((c) => <SelectItem key={text(rowId(c))} value={text(rowId(c))}>{nomeCartao(c)}</SelectItem>)}</SelectContent>
              </Select>
              {cartao && (!cartao["dia_fechamento"] || !cartao["dia_vencimento"]) && (
                <p className="text-warning text-xs">Informe o dia de fechamento e de vencimento deste cartão em Reembolsos → Cartões.</p>
              )}
            </div>
          )}
          {registro && text(registro["cartao_id"]) && (
            <p className="text-muted-foreground text-sm sm:col-span-2">Cartão: {nomeCartao(cartoes.find((c) => text(rowId(c)) === text(registro["cartao_id"])))}</p>
          )}
          <div className="space-y-1"><Label>{cartaoModo ? "Data da compra" : registro || v.modo === "unico" ? "Vencimento" : "1º vencimento"}</Label>
            <Input type="date" value={v.vencimento} disabled={readOnly} onChange={(e) => setV({ ...v, vencimento: e.target.value })} /></div>
          <div className="space-y-1"><Label>{(v.modo === "parcelado" || cartaoModo) && !registro ? "Valor total (R$)" : v.modo === "recorrente" && !registro ? "Valor mensal (R$)" : "Valor (R$)"}</Label>
            <Input inputMode="decimal" value={v.valor} disabled={readOnly} onChange={(e) => setV({ ...v, valor: e.target.value })} placeholder="0,00" /></div>
          {!registro && v.modo !== "unico" && (
            <div className="space-y-1"><Label>{v.modo === "recorrente" ? "Nº de meses" : "Nº de parcelas"}</Label>
              <Input type="number" min={1} max={cartaoModo ? 48 : 120} value={v.repetir} onChange={(e) => setV({ ...v, repetir: e.target.value })} /></div>
          )}
          {!registro && (previa.length > 1 || (cartaoModo && previa.length > 0)) && (
            <div className="bg-muted/40 max-h-48 overflow-y-auto rounded-md border p-2 text-sm sm:col-span-2">
              {previa.map((p, i) => (
                <div key={i} className="flex justify-between py-0.5 tabular-nums">
                  <span>{i + 1}/{previa.length} — {formatDate(p.vencimento)}</span><span>{formatBRL(p.valor)}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
                <span>Total</span><span>{formatBRL(previa.reduce((s, p) => s + p.valor, 0))}</span>
              </div>
            </div>
          )}
          {registro && registro["status"] !== "pago" && (
            <div className="space-y-1"><Label>Situação</Label>
              <Select value={v.status} disabled={readOnly} onValueChange={(x) => setV({ ...v, status: x })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="aberto">Em aberto</SelectItem><SelectItem value="cancelado">Cancelado</SelectItem></SelectContent>
              </Select></div>
          )}
          <div className="space-y-1 sm:col-span-2"><Label>Observação</Label>
            <Textarea value={v.observacao} disabled={readOnly} onChange={(e) => setV({ ...v, observacao: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {!readOnly && <Button disabled={salvando} onClick={() => void salvar()}>{salvando ? "Salvando…" : "Salvar"}</Button>}
        </div>
      </SheetContent>
    </Sheet>
    <Dialog open={confirmarSerie} onOpenChange={(o) => !salvando && setConfirmarSerie(o)}>
      <DialogContent className="sm:max-w-2xl" aria-describedby="recorrencia-descricao">
        <DialogHeader><DialogTitle>Edição de lançamento recorrente</DialogTitle></DialogHeader>
        <p id="recorrencia-descricao" className="text-sm">As alterações neste lançamento devem ser refletidas:</p>
        <div role="radiogroup" aria-label="Alcance das alterações" className="space-y-4 py-2">
          {([
            ["atual", "Somente o lançamento atual"],
            ["nao_vencidos", "Lançamento atual e todos os não vencidos que não possuam baixas"],
            ["abertos", "Lançamento atual e todos os em aberto (vencidos + a vencer) que não possuam baixas"],
            ["todos", "Todos os lançamentos"],
          ] as const).map(([valor, label]) => <label key={valor} className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="radio" name="escopo-recorrencia" value={valor} checked={escopo === valor} disabled={salvando} onChange={() => setEscopo(valor)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
            <span>{label}</span>
          </label>)}
        </div>
        {escopo === "todos" && <p className="text-sm text-warning">Inclui pagos, recebidos e cancelados. Valores e datas das baixas já registradas serão preservados.</p>}
        <DialogFooter>
          <Button variant="outline" disabled={salvando} onClick={() => setConfirmarSerie(false)}>Cancelar</Button>
          <Button disabled={salvando} onClick={() => void salvar(escopo)}>{salvando ? "Salvando…" : "Confirmar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function BaixaDialog({ tipo, titulo, onClose, onSaved }: { tipo: TipoTitulo; titulo: Row; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ data: hojeISO(), juros: "", desconto: "", forma: FORMAS_PAGAMENTO[0] ?? "Pix", comprovante: "" });
  const [enviando, setEnviando] = useState(false);
  const total = valorBaixa(num(titulo["valor"]), num(v.juros), num(v.desconto));

  const anexar = async (file?: File) => {
    if (!file) return;
    setEnviando(true);
    try { setV((s) => ({ ...s, comprovante: "" })); const url = await uploadFoto(file); setV((s) => ({ ...s, comprovante: url })); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falha no envio."); }
    finally { setEnviando(false); }
  };
  const confirmar = async () => {
    const { error } = await supabase.from("financeiro_titulos").update({
      status: "pago", pago_em: v.data, valor_pago: total, juros: round2(num(v.juros)), desconto: round2(num(v.desconto)),
      forma_pagamento: v.forma, comprovante: v.comprovante || titulo["comprovante"] || null,
    } as never).eq("id", text(rowId(titulo)));
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success(tipo === "receber" ? "Recebimento registrado." : "Pagamento registrado.");
    onSaved(); onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{tipo === "receber" ? "Registrar recebimento" : "Registrar pagamento"}</DialogTitle></DialogHeader>
        <p className="text-muted-foreground text-sm">{text(titulo["descricao"])} — {formatBRL(titulo["valor"])}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Data</Label><Input type="date" value={v.data} onChange={(e) => setV({ ...v, data: e.target.value })} /></div>
          <div className="space-y-1"><Label>Forma</Label>
            <Select value={v.forma} onValueChange={(x) => setV({ ...v, forma: x })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FORMAS_PAGAMENTO.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1"><Label>Juros / multa (R$)</Label><Input inputMode="decimal" value={v.juros} onChange={(e) => setV({ ...v, juros: e.target.value })} placeholder="0,00" /></div>
          <div className="space-y-1"><Label>Desconto (R$)</Label><Input inputMode="decimal" value={v.desconto} onChange={(e) => setV({ ...v, desconto: e.target.value })} placeholder="0,00" /></div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="flex items-center gap-1">Comprovante (foto) <UploadInfo perfil="laudo" /></Label>
            <Input type="file" accept="image/*" disabled={enviando} onChange={(e) => anexar(e.target.files?.[0])} />
            {v.comprovante && <img src={v.comprovante} alt="Comprovante" className="mt-2 h-20 rounded border object-cover" />}
          </div>
        </div>
        <p className="text-sm">Valor da baixa: <strong>{formatBRL(total)}</strong></p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={enviando} onClick={confirmar}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const nomeMes = (k: string) => {
  const [y, m] = k.split("-").map(Number);
  return new Date(y ?? 2000, (m ?? 1) - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
};

function Caixa({ titulos }: { titulos: Row[] }) {
  const [saldoInicial, setSaldoInicial] = useState("");
  const [visao, setVisao] = useState<VisaoCaixa>("6m");
  const [modo, setModo] = useState<ModoCaixa>("ambos");
  const [custom, setCustom] = useState(() => periodoVisao("6m"));
  const periodo = visao === "personalizado" ? custom : periodoVisao(visao);
  const linhas = fluxoPeriodo(titulos, { ...periodo, modo, saldoInicial: num(saldoInicial) });
  const tot = linhas.reduce((a, l) => ({ e: a.e + l.entradas, s: a.s + l.saidas }), { e: 0, s: 0 });
  const dados = linhas.map((l) => ({ ...l, nome: nomeMes(l.mes) }));
  const config = {
    entradas: { label: "Entradas", color: "var(--success)" },
    saidas: { label: "Saídas", color: "var(--destructive)" },
    acumulado: { label: "Saldo acumulado", color: "var(--primary)" },
  } satisfies ChartConfig;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label>Visão</Label>
          <Select value={visao} onValueChange={(x) => setVisao(x as VisaoCaixa)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mes">Mês atual</SelectItem>
              <SelectItem value="6m">6 meses</SelectItem>
              <SelectItem value="12m">12 meses</SelectItem>
              <SelectItem value="personalizado">Personalizado</SelectItem>
            </SelectContent>
          </Select></div>
        {visao === "personalizado" && (
          <>
            <div className="space-y-1"><Label>Data início</Label><Input type="date" value={custom.de} onChange={(e) => setCustom({ ...custom, de: e.target.value })} /></div>
            <div className="space-y-1"><Label>Data fim</Label><Input type="date" value={custom.ate} onChange={(e) => setCustom({ ...custom, ate: e.target.value })} /></div>
          </>
        )}
        <div className="space-y-1"><Label>Mostrar</Label>
          <Select value={modo} onValueChange={(x) => setModo(x as ModoCaixa)}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="previsto">Previsto</SelectItem>
              <SelectItem value="realizado">Realizado</SelectItem>
              <SelectItem value="ambos">Previsto e realizado</SelectItem>
            </SelectContent>
          </Select></div>
        <div className="space-y-1"><Label>Saldo inicial (R$)</Label>
          <Input className="w-40" inputMode="decimal" value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} placeholder="0,00" /></div>
      </div>
      <p className="text-muted-foreground text-xs">Realizado = baixas pela data do pagamento. Previsto = contas em aberto pelo vencimento.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="bg-card rounded-lg border p-3"><p className="text-muted-foreground text-xs">Entradas</p><p className="text-success text-lg font-semibold tabular-nums">{formatBRL(tot.e)}</p></div>
        <div className="bg-card rounded-lg border p-3"><p className="text-muted-foreground text-xs">Saídas</p><p className="text-destructive text-lg font-semibold tabular-nums">{formatBRL(tot.s)}</p></div>
        <div className="bg-card rounded-lg border p-3"><p className="text-muted-foreground text-xs">Saldo final</p><p className={cn("text-lg font-semibold tabular-nums", (linhas.at(-1)?.acumulado ?? 0) < 0 && "text-destructive")}>{formatBRL(linhas.at(-1)?.acumulado ?? 0)}</p></div>
      </div>
      {linhas.length === 0 ? (
        <p className="text-muted-foreground text-sm">Informe um período válido.</p>
      ) : (
        <>
          <div className="bg-card rounded-lg border p-3">
            <ChartContainer config={config} className="h-72 w-full">
              <ComposedChart data={dados}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="nome" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={80} tickFormatter={(v: number) => formatBRL(v).replace(/,\d{2}$/, "")} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => <span className="flex w-full justify-between gap-3"><span>{config[n as keyof typeof config]?.label}</span><span className="font-mono tabular-nums">{formatBRL(Number(v))}</span></span>} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="entradas" fill="var(--color-entradas)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="saidas" fill="var(--color-saidas)" radius={[4, 4, 0, 0]} />
                <Line dataKey="acumulado" type="monotone" stroke="var(--color-acumulado)" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ChartContainer>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  {["Mês", "Entradas", "Saídas", "Saldo do mês", "Acumulado"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.mes} className={cn("border-t", l.acumulado < 0 && "bg-destructive/10")}>
                    <td className="px-3 py-2 font-medium capitalize">{nomeMes(l.mes)}</td>
                    <td className="text-success px-3 py-2 tabular-nums">{formatBRL(l.entradas)}</td>
                    <td className="text-destructive px-3 py-2 tabular-nums">{formatBRL(l.saidas)}</td>
                    <td className={cn("px-3 py-2 font-semibold tabular-nums", l.saldo < 0 && "text-destructive")}>{formatBRL(l.saldo)}</td>
                    <td className={cn("px-3 py-2 font-semibold tabular-nums", l.acumulado < 0 && "text-destructive")}>{formatBRL(l.acumulado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function nomeCartao(c: Row | undefined): string {
  if (!c) return "—";
  return [text(c["descricao"]), c["final4"] ? `final ${text(c["final4"])}` : ""].filter(Boolean).join(" • ");
}
