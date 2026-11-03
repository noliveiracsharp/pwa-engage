import { imprimirDre } from "@/components/relatorios/DreRelatorioPDF";
import { useEmpresaAtiva } from "@/hooks/useEmpresaAtiva";
import { PeriodoNavegavel } from "@/components/financeiro/PeriodoNavegavel";
import { buscarIpca12m } from "@/lib/indices.functions";
import { periodoPreset, type Periodo } from "@/lib/periodo-vencimento";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, ChevronDown, ChevronRight, Copy, CreditCard, FileText, FileUp, TrendingUp, Paperclip, Plus, QrCode, Receipt, Trash2, Undo2 } from "lucide-react";
import { ImportarFaturaDialog } from "@/components/financeiro/ImportarFaturaDialog";
import { ImportarContaDialog } from "@/components/financeiro/ImportarContaDialog";
import { DdaInbox } from "@/components/financeiro/DdaInbox";
import { ComissoesView } from "@/routes/_authenticated/comissoes";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Tags, Download } from "lucide-react";
import { ReciboDialog } from "@/components/financeiro/ReciboDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ParceiroSheet } from "@/components/parceiros/ParceiroSheet";
import { buildTree } from "@/lib/hierarchy";
import { useCategoriasItens } from "@/lib/itens-categorias";
import { QuickCreateDialog, type QuickField } from "@/components/itens/QuickCreateDialog";
import { formatCpfCnpj } from "@/lib/input-masks";
import { ContasBancarias } from "@/components/financeiro/ContasBancarias";
import { SaldosBancarios } from "@/components/financeiro/SaldosBancarios";
import { contasDaEmpresa, somarSaldos } from "@/lib/saldos-bancarios";
import { CartoesCredito } from "@/components/financeiro/CartoesCredito";
import { ControllerPainel } from "@/components/financeiro/ControllerPainel";
import { VereditoFluxo } from "@/components/financeiro/VereditoFluxo";
import { ReguaCobranca } from "@/components/financeiro/ReguaCobranca";
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
import { useSecoes } from "@/hooks/useSecoes";
import { ConteudoAbaFilha, useAbasFilhas } from "@/components/layout/SubmenuTabs";
import { useAuth } from "@/hooks/useAuth";
import { useAudit } from "@/lib/audit";
import { rowId, text, useTableRows } from "@/lib/crud";
import { mascaraMoeda, matchesAny, moedaDeNumero } from "@/lib/input-masks";
import { calcularTarifa, modalidadeTarifa } from "@/lib/financeiro-tarifas";
import { formatBRL, formatDate, num, round2 } from "@/lib/orcamentos";
import { uploadFoto } from "@/lib/laudos";
import { erroFinanceiro } from "@/lib/financeiro-db";
import { alvosOferta, alvosRecorrencia, parcelasDaOferta, parcelasLegadas, patchRecorrencia, planoPosicaoSerie, planoTamanhoSerie, serieLegada, type EscopoRecorrencia } from "@/lib/financeiro-recorrencia";
import {
  fluxoPeriodo,
  periodoVisao,
  type ModoCaixa,
  type VisaoCaixa,
  CATEGORIAS_FINANCEIRO,
  FORMAS_PAGAMENTO,
  hojeISO,
  resumoTitulos,
  casaSituacao,
  reajusteEmCarencia,
  infoReajuste,
  valorReajustado,
  CARENCIA_REAJUSTE_MESES,
  SITUACAO_META,
  distribuirPagamento,
  saldoTitulo,
  situacaoTitulo,
  valorBaixa,
  parcelasManuais,
  parcelasCartao, parcelasItensCartao, vencimentoFatura, serieParcelas, vencParcela1Cartao, vencParcela1De, limiteGrupoCartao, type ItemCartao,
  type ModoLancamento,
  type Situacao,
  type TipoTitulo,
} from "@/lib/financeiro";
import type { Row } from "@/lib/row";
import { ParceiroSituacaoAlerta, problemaParceiro } from "@/components/financeiro/ParceiroSituacaoAlerta";
import { cn } from "@/lib/utils";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { confirmar, perguntar } from "@/components/layout/DialogoGlobal";
import { OfertaConsultaSheet, VincularOfertaDialog, ofertaDoTitulo } from "@/components/financeiro/OfertaVinculo";
import { camposFiscais, rotulosFiscais } from "@/lib/titulo-fiscal";
import { RateioTitulo, type RateioApi } from "@/components/financeiro/RateioTitulo";
import { ItensChip, ItensTituloDialog, useItensPorTitulo } from "@/components/financeiro/ItensTituloResumo";
import { ApoioCrud } from "@/components/itens/ApoioCrud";
import { centroCustoConfig, planoContasConfig } from "@/components/itens/apoio-config";

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

const SECOES_FIN = [
  { key: "receber", label: "Contas a Receber" },
  { key: "pagar", label: "Contas a Pagar" },
  { key: "caixa", label: "Fluxo de Caixa" },
  { key: "controller", label: "Controller" },
  { key: "regua", label: "Cobrança automática" },
  { key: "bancos", label: "Contas Bancárias" },
  { key: "plano", label: "Plano de Contas" },
  { key: "centros", label: "Centros de Custo" },
  { key: "comissoes", label: "Comissões" },
];

function FinanceiroPage() {
  const perms = usePagePermissions("/financeiro");
  const secoes = useSecoes("/financeiro", SECOES_FIN);
  const filhas = useAbasFilhas();
  // Sem leitura no Financeiro, mostra só as abas filhas liberadas (ex.: Reembolsos).
  const visiveis = [...(perms.canRead ? SECOES_FIN.filter((s) => secoes[s.key]?.canRead) : []), ...filhas.map((a) => ({ key: a.path, label: a.label }))];
  const [abaSel, setAba] = useState<string>("receber");
  const aba = visiveis.some((s) => s.key === abaSel) ? abaSel : (visiveis[0]?.key ?? "");
  // Histórico completo só para as visões que realmente precisam dele (caixa e controller).
  const { data: titulos = [] } = useTableRows("financeiro_titulos", aba === "caixa" || aba === "controller");
  if (!perms.loading && visiveis.length === 0) return <p className="text-muted-foreground text-sm">Você não tem acesso a esta página.</p>;
  const p = (k: string) => ({ ...(secoes[k] ?? perms) });
  return (
    <Tabs value={aba} onValueChange={setAba} className="min-w-0 space-y-4">
      <div className="min-w-0 overflow-x-auto">
      <TabsList className="w-max min-w-full justify-start">
        {visiveis.map((s) => <TabsTrigger key={s.key} value={s.key}>{s.label}</TabsTrigger>)}
      </TabsList>
      </div>
      {["receber", "pagar", "caixa"].includes(aba) && <SaldosBancarios />}
      <TabsContent value="receber">{aba === "receber" && <Titulos tipo="receber" perms={p("receber")} />}</TabsContent>
      <TabsContent value="pagar">
        <Tabs defaultValue="titulos" className="space-y-4">
          <TabsList><TabsTrigger value="titulos">Títulos a pagar</TabsTrigger><TabsTrigger value="dda">Inbox DDA</TabsTrigger></TabsList>
          <TabsContent value="titulos">{aba === "pagar" && <Titulos tipo="pagar" perms={p("pagar")} />}</TabsContent>
          <TabsContent value="dda"><DdaComTitulos perms={p("pagar")} /></TabsContent>
        </Tabs>
      </TabsContent>
      <TabsContent value="caixa"><Caixa titulos={titulos} /></TabsContent>
      <TabsContent value="controller"><ControllerPainel titulos={titulos} /></TabsContent>
      <TabsContent value="regua"><ReguaCobranca canEdit={p("regua").canUpdate || p("regua").canCreate} /></TabsContent>
      <TabsContent value="bancos" className="space-y-8"><ContasBancarias perms={p("bancos")} /><CartoesCredito perms={p("bancos")} /></TabsContent>
      <TabsContent value="plano">{aba === "plano" && <ApoioCrud {...planoContasConfig} permsOverride={p("plano")} />}</TabsContent>
      <TabsContent value="centros">{aba === "centros" && <ApoioCrud {...centroCustoConfig} permsOverride={p("centros")} />}</TabsContent>
      <TabsContent value="comissoes">{aba === "comissoes" && <ComissoesView perms={p("comissoes")} />}</TabsContent>
      {filhas.map((a) => <TabsContent key={a.id} value={a.path}>{aba === a.path && <ConteudoAbaFilha path={a.path} />}</TabsContent>)}
    </Tabs>
  );
}

const ORIGEM_LABEL: Record<string, string> = { manual: "Manual", oferta: "Oferta", pedido: "Pedido", despesa: "Despesa", comissao: "Comissão", reembolso: "Reembolso" };

function FiltroMulti({ label, selecionadas, options, onChange }: { label: string; selecionadas: string[]; options: Array<{ value: string; label: string }>; onChange: (v: string[]) => void }) {
  const resumo = !selecionadas.length ? "Todas" : selecionadas.length === 1 ? options.find((o) => o.value === selecionadas[0])?.label ?? "1 selecionada" : `${selecionadas.length} selecionadas`;
  const alternar = (v: string) => onChange(selecionadas.includes(v) ? selecionadas.filter((x) => x !== v) : [...selecionadas, v]);
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between font-normal"><span className="truncate">{resumo}</span><ChevronDown className="h-4 w-4 opacity-60" /></Button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-2" align="start">
          <button type="button" className="hover:bg-muted w-full rounded px-2 py-1.5 text-left text-sm" onClick={() => onChange([])}>Todas</button>
          {options.map((o) => (
            <label key={o.value} className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm">
              <Checkbox checked={selecionadas.includes(o.value)} onCheckedChange={() => alternar(o.value)} />{o.label}
            </label>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function RelatorioTitulos({ tipo, rows, hoje, filtros, resumo, nomeParc, nomeCentro, onClose }: {
  tipo: TipoTitulo; rows: Row[]; hoje: string; filtros: string[]; resumo: ReturnType<typeof resumoTitulos>;
  nomeParc: (id: unknown) => string; nomeCentro: (id: unknown) => string; onClose: () => void;
}) {
  const titulo = tipo === "receber" ? "Relatório de Contas a Receber" : "Relatório de Contas a Pagar";
  const pago = tipo === "receber" ? "Recebido" : "Pago";
  const emp = useEmpresaAtiva();
  const cards = [["Total", resumo.total, resumo.qtd.total], ["A vencer", resumo.aVencer, resumo.qtd.aVencer], ["Vencidos", resumo.vencidos, resumo.qtd.vencidos],
    [pago, resumo.pagoMes, resumo.qtd.pago], ["Em aberto", resumo.emAberto, resumo.qtd.emAberto]] as const;
  const total = round2(rows.reduce((s, t) => s + num(t["valor"]), 0));
  const cab = ["Vencimento", "Descrição", tipo === "receber" ? "Cliente" : "Fornecedor", "Categoria", "Centro de custo", "Situação"];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-5xl">
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
        <div className="overflow-auto rounded border">
          <div id="dre-print" className="dre-doc p-4">
            <header className="dre-head">
              <div className="dre-emp">
                {emp.logo && <img src={String(emp.logo)} alt="" data-no-zoom />}
                <div>
                  <div className="dre-emp-nome">{emp.nome}</div>
                  <div className="dre-rot">Relatório financeiro • Confidencial</div>
                </div>
              </div>
              <div className="dre-head-dir"><div className="dre-rot">Emitido em</div><div>{new Date().toLocaleString("pt-BR")}</div></div>
            </header>
            <div className="dre-titulo">
              <h1>{titulo}</h1>
              <p>{rows.length} título(s) • {filtros.join(" • ") || "Sem filtros"}</p>
            </div>
            <table className="dre-kpis"><tbody><tr>
              {cards.map(([l, v, q], i) => (
                <td key={l} className={i === cards.length - 1 ? "dre-kpi-res" : ""}><span>{l}</span><strong>{formatBRL(v)}</strong><small>{q} título(s)</small></td>
              ))}
            </tr></tbody></table>
            <h2>1. Títulos</h2>
            <table className="dre-tab">
              <thead><tr>{cab.map((c) => <th key={c}>{c}</th>)}<th className="r">Valor (R$)</th></tr></thead>
              <tbody>
                {rows.map((t) => { const s = situacaoTitulo(t, hoje); return (
                  <tr key={text(rowId(t))}>
                    <td>{formatDate(t["vencimento"])}</td><td>{text(t["descricao"])}</td><td>{nomeParc(t["parceiro_id"])}</td>
                    <td>{text(t["categoria"])}</td><td>{nomeCentro(t["centro_custo_id"])}</td><td>{SITUACAO_META[s].label(tipo)}</td>
                    <td className="r">{formatBRL(t["valor"])}</td>
                  </tr>); })}
                {!rows.length && <tr><td colSpan={7}>Nenhum título encontrado.</td></tr>}
                <tr className="tot"><td colSpan={6}>Total • {rows.length} título(s)</td><td className="r">{formatBRL(total)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button><Button onClick={imprimirDre}><FileText className="mr-1 h-4 w-4" />Imprimir / PDF</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Titulos({ tipo, perms }: { tipo: TipoTitulo; perms: Perms }) {
  const qc = useQueryClient();
  const { data: parceiros = [] } = useTableRows("parceiros");
  const parceiroById = useMemo(() => new Map(parceiros.map((p) => [text(rowId(p)), p])), [parceiros]);
  const nomeParc = (id: unknown) => {
    const p = parceiroById.get(text(id));
    return p ? text(p["nome_fantasia"] || p["razao_social"]) : "";
  };
  const { data: cartoes = [] } = useTableRows("despesas_cartoes");
  const categorias = useCategoriasFinanceiro(tipo);
  const [catAberto, setCatAberto] = useState(false);
  const { data: centrosCusto = [] } = useTableRows("centro_custo");
  const nomeCentro = (id: unknown) => {
    const c = centrosCusto.find((x) => text(rowId(x)) === text(id));
    return c ? [text(c["codigo"]), text(c["descricao"])].filter(Boolean).join(" - ") : "";
  };
  const [f, setF] = useState({ busca: "", situacao: "todos", categoria: "todos", cartao: "todos", centro: "todos", per: periodoPreset("mes") });
  const situacoesSel = f.situacao === "todos" ? [] : f.situacao.split(",").filter(Boolean);
  const [relatorio, setRelatorio] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const periodoF = f.per;
  const [editar, setEditar] = useState<Row | null | undefined>(undefined);
  const [novoNoCartao, setNovoNoCartao] = useState<string>("");
  const [baixar, setBaixar] = useState<Row | null>(null);
  const [cobrar, setCobrar] = useState<Row | null>(null);
  const hoje = hojeISO();

  // Só os títulos deste tipo e do período vêm do banco (antes vinha todo o histórico).
  const { data: todos = [], isLoading: loading } = useTableRows("financeiro_titulos", true, undefined, {
    key: `${tipo}|${periodoF.de}|${periodoF.ate}`,
    apply: (q) => {
      let x = q.eq("tipo", tipo);
      if (periodoF.de) x = x.gte("vencimento", periodoF.de);
      if (periodoF.ate) x = x.lte("vencimento", periodoF.ate);
      return x;
    },
  });
  const doTipo = useMemo(() => todos.filter((t) => t["tipo"] === tipo), [todos, tipo]);
  // Série completa (só colunas leves) para numerar n/total mesmo com parcelas fora do período.
  const seriesIds = useMemo(() => [...new Set(doTipo.filter((t) => t["origem_tipo"] === "manual" && t["origem_id"]).map((t) => text(t["origem_id"])))].sort(), [doTipo]);
  const { data: serieRows = [] } = useQuery({
    queryKey: ["table", "financeiro_titulos", "series", tipo, seriesIds.join(",")],
    enabled: seriesIds.length > 0,
    queryFn: async () => {
      const out: Row[] = [];
      for (let i = 0; i < seriesIds.length; i += 150) {
        const { data, error } = await supabase.from("financeiro_titulos").select("id,origem_tipo,origem_id,descricao,vencimento").eq("tipo", tipo).eq("origem_tipo", "manual").in("origem_id", seriesIds.slice(i, i + 150));
        if (error) throw error;
        out.push(...((data ?? []) as Row[]));
      }
      return out;
    },
  });
  // Posição real na série (n/total) pelo vínculo origem_id, independente do texto da descrição.
  const posSerie = useMemo(() => {
    const grupos = new Map<string, Row[]>();
    const fonte = serieRows.length ? serieRows : doTipo;
    for (const t of fonte) {
      if (t["origem_tipo"] !== "manual" || !t["origem_id"]) continue;
      // Mesma série = mesmo vínculo E mesma descrição base (evita "parcelas" entre compras diferentes do cartão).
      const k = `${text(t["origem_id"])}|${text(t["descricao"]).replace(/\s*\(\d+\/\d+\)\s*$/, "").trim().toLowerCase()}`;
      grupos.set(k, [...(grupos.get(k) ?? []), t]);
    }
    const mapa = new Map<string, string>();
    for (const l of grupos.values()) {
      if (l.length < 2) continue;
      l.sort((a, b) => text(a["vencimento"]).localeCompare(text(b["vencimento"])));
      l.forEach((t, i) => mapa.set(text(rowId(t)), `${i + 1}/${l.length}`));
    }
    return mapa;
  }, [doTipo, serieRows]);
  // Base = todos os filtros menos a situação (os cards do topo não zeram ao filtrar uma situação).
  const base = useMemo(
    () =>
      doTipo
        .filter((t) => {
          const v = text(t["vencimento"]).slice(0, 10);
          return (
            matchesAny([t["descricao"], nomeParc(t["parceiro_id"]), nomeParc(t["cliente_atendido_id"]), t["categoria"], moedaDeNumero(num(t["valor"])), num(t["valor"]).toFixed(2)], f.busca) &&
            (f.categoria === "todos" || t["categoria"] === f.categoria) &&
            (f.cartao === "todos" || text(t["cartao_id"]) === f.cartao) &&
            (f.centro === "todos" || (f.centro === "sem" ? !t["centro_custo_id"] : text(t["centro_custo_id"]) === f.centro)) &&
            (!periodoF.de || v >= periodoF.de) && (!periodoF.ate || v <= periodoF.ate)
          );
        })
        .sort((a, b) => text(a["vencimento"]).localeCompare(text(b["vencimento"]))),
    [doTipo, f.busca, f.categoria, f.cartao, f.centro, periodoF, parceiroById], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const rows = useMemo(() => base.filter((t) => casaSituacao(t, situacoesSel, hoje)), [base, f.situacao, hoje]); // eslint-disable-line react-hooks/exhaustive-deps
  const resumo = resumoTitulos(base, hoje, periodoF);
  const totalFiltrado = round2(rows.reduce((s, t) => s + num(t["valor"]), 0));
  // Visão geral de Contas a Pagar: compras no cartão aparecem agrupadas como uma fatura por cartão/vencimento.
  const [faturaSel, setFatura] = useState<Row | null>(null);
  const [novaCompra, setNovaCompra] = useState<Row | null>(null);
  const [importar, setImportar] = useState(false);
  const [importarConta, setImportarConta] = useState(false);
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const exibidos: Row[] = useMemo(() => {
    if (tipo !== "pagar" || f.cartao !== "todos") return rows;
    const grupos = new Map<string, Row[]>();
    const out: Row[] = [];
    for (const t of rows) {
      if (!text(t["cartao_id"])) { out.push(t); continue; }
      const k = `${text(t["cartao_id"])}|${text(t["vencimento"]).slice(0, 10)}`;
      if (!grupos.has(k)) { grupos.set(k, []); out.push({ id: `fatura:${k}`, __k: k }); }
      grupos.get(k)!.push(t);
    }
    return out.map((r) => {
      if (!r["__k"]) return r;
      const itens = grupos.get(text(r["__k"]))!;
      const c = cartoes.find((x) => text(rowId(x)) === text(itens[0]!["cartao_id"]));
      const todosPagos = itens.every((t) => t["status"] === "pago" || t["status"] === "cancelado") && itens.some((t) => t["status"] === "pago");
      const pagoParcial = round2(itens.reduce((s, t) => s + (t["status"] === "pago" ? num(t["valor_pago"]) || num(t["valor"]) : num(t["valor_pago"])), 0));
      return { id: r["id"], __fatura: true, __itens: itens, cartao_id: itens[0]!["cartao_id"], vencimento: itens[0]!["vencimento"],
        descricao: `Fatura ${nomeCartao(c)}`, categoria: "Cartão de crédito", origem_tipo: "cartao",
        valor: round2(itens.reduce((s, t) => s + num(t["valor"]), 0)),
        status: todosPagos ? "pago" : itens.some((t) => t["status"] === "cancelado") && itens.every((t) => t["status"] === "cancelado") ? "cancelado" : "aberto",
        valor_pago: todosPagos || pagoParcial > 0 ? pagoParcial : null,
        pago_em: todosPagos ? itens[0]!["pago_em"] : itens.find((t) => t["pago_em"])?.["pago_em"] ?? null } as Row;
    }).flatMap((r) => (r["__fatura"] && abertas.has(text(r["id"]))
      ? [r, ...[...(r["__itens"] as Row[])].sort((a, b) => text(a["data_compra"]).localeCompare(text(b["data_compra"]))).map((t) => ({ ...t, __filho: true, __pai: r }))]
      : [r]));
  }, [rows, tipo, f.cartao, cartoes, abertas]);
  const baixarItensFatura = async (itens: Row[]) => {
    const abertos = itens.filter((t) => t["status"] !== "pago" && t["status"] !== "cancelado");
    if (!abertos.length) return void toast.error("Essa fatura já está paga.");
    const total = round2(abertos.reduce((s, t) => s + num(t["valor"]), 0));
    if (!await confirmar(`Baixar a fatura com ${abertos.length} item(ns), total ${formatBRL(total)}?`)) return;
    const { error } = await supabase.from("financeiro_titulos").update({ status: "pago", pago_em: hoje, juros: 0, desconto: 0, agendado_para: null, forma_pagamento: "Cartão de crédito" } as never).in("id", abertos.map((t) => text(rowId(t))));
    if (error) return void toast.error(erroFinanceiro(error));
    for (const t of abertos) await supabase.from("financeiro_titulos").update({ valor_pago: num(t["valor"]) } as never).eq("id", text(rowId(t)));
    toast.success("Fatura baixada."); setFatura(null); invalidar();
  };
  const invalidar = () => qc.invalidateQueries({ queryKey: ["table", "financeiro_titulos"] });
  const estornarFatura = async (itens: Row[]) => {
    if (!await confirmar("Estornar todos os pagamentos desta fatura?")) return;
    const { error } = await supabase.from("financeiro_titulos").update({ status: "aberto", pago_em: null, valor_pago: null, juros: 0, desconto: 0 } as never).in("id", itens.map((t) => text(rowId(t))));
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success("Pagamentos da fatura estornados."); setFatura(null); invalidar();
  };
  const pagarParcialFatura = async (itens: Row[], valor: number, data: string) => {
    const ordem = [...itens].sort((a, b) => text(a["data_compra"]).localeCompare(text(b["data_compra"])));
    const plano = distribuirPagamento(ordem, valor);
    if (!plano.length) return void toast.error("Informe um valor maior que zero.");
    for (const p of plano) {
      const { error } = await supabase.from("financeiro_titulos").update((p.quitado
        ? { status: "pago", pago_em: data, valor_pago: p.valor_pago, agendado_para: null, forma_pagamento: "Cartão de crédito" }
        : { pago_em: data, valor_pago: p.valor_pago }) as never).eq("id", p.id);
      if (error) return void toast.error(erroFinanceiro(error));
    }
    toast.success(`Pagamento de ${formatBRL(valor)} registrado na fatura.`); setFatura(null); invalidar();
  };
  const mudarVencimentoFatura = async (itens: Row[], venc: string) => {
    if (!venc) return;
    const { error } = await supabase.from("financeiro_titulos").update({ vencimento: venc } as never).in("id", itens.map((t) => text(rowId(t))));
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success("Vencimento da fatura atualizado."); setFatura(null); invalidar();
  };
  const [excluirFat, setExcluirFatRaw] = useState<Row | null>(null);
  const [alcFat, setAlcFat] = useState<"atual" | "seguintes" | "todas">("atual");
  const setExcluirFat = (r: Row | null) => { setAlcFat("atual"); setExcluirFatRaw(r); };
  const excluirFaturaAlcance = async (alcance: "atual" | "seguintes" | "todas") => {
    const fat = excluirFat; if (!fat) return;
    setExcluirFat(null);
    const itens = fat["__itens"] as Row[];
    const ids = new Set(itens.map((t) => text(rowId(t))));
    if (alcance !== "atual") {
      const series = [...new Set(itens.map((t) => text(t["origem_id"])).filter(Boolean))];
      if (series.length) {
        const { data, error } = await supabase.from("financeiro_titulos").select("*").eq("tipo", tipo).in("origem_id", series);
        if (error) return void toast.error(erroFinanceiro(error));
        for (const x of (data ?? []) as Row[]) {
          if (alcance === "seguintes" && (text(x["vencimento"]) < text(fat["vencimento"]) || x["status"] === "pago")) continue;
          ids.add(text(rowId(x)));
        }
      }
    }
    const { error } = await supabase.from("financeiro_titulos").delete().in("id", [...ids]);
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success(`${ids.size} lançamento(s) excluído(s).`); setFatura(null); invalidar();
  };
  const excluirItemFatura = async (t: Row) => {
    if (ehSerie(t)) { setFatura(null); return void setExcluirSerie(t); }
    if (!await confirmar({ title: "Excluir este item da fatura?", description: `${text(t["descricao"])} — ${formatBRL(t["valor"])}`, confirmText: "Excluir", destructive: true })) return;
    const { error } = await supabase.from("financeiro_titulos").delete().eq("id", text(rowId(t)));
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success("Item excluído."); setFatura(null); invalidar();
  };
  const faturaAberta = rows.filter((t) => t["status"] === "aberto");

  const baixarFatura = async () => {
    const total = round2(faturaAberta.reduce((s, t) => s + num(t["valor"]), 0));
    if (!await confirmar(`Baixar ${faturaAberta.length} parcela(s) da fatura, total ${formatBRL(total)}?`)) return;
    for (const t of faturaAberta) {
      const { error } = await supabase.from("financeiro_titulos").update({
        status: "pago", pago_em: hoje, valor_pago: num(t["valor"]), juros: 0, desconto: 0, forma_pagamento: "Cartão de crédito",
      } as never).eq("id", text(rowId(t)));
      if (error) return void toast.error(erroFinanceiro(error));
    }
    toast.success("Fatura baixada."); invalidar();
  };

  const estornar = async (t: Row) => {
    if (!await confirmar("Estornar a baixa deste título?")) return;
    const { error } = await supabase.from("financeiro_titulos")
      .update({ status: "aberto", pago_em: null, valor_pago: null, juros: 0, desconto: 0 } as never).eq("id", text(rowId(t)));
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success("Baixa estornada."); invalidar();
  };
  const [clonar, setClonar] = useState<Row | null>(null);
  const [recibo, setRecibo] = useState<Row | null>(null);
  const [vincOferta, setVincOferta] = useState<Row | null>(null);
  const [consultaOferta, setConsultaOferta] = useState("");
  const [consultaTitulo, setConsultaTitulo] = useState<Row | null>(null);
  const [verItens, setVerItens] = useState<Row | null>(null);
  const idsTela = useMemo(() => doTipo.map((t) => text(rowId(t))), [doTipo]);
  const itensPorTitulo = useItensPorTitulo(idsTela);
  // Só as Ofertas vinculadas aos títulos da tela (número para o link), não a tabela inteira.
  const ofertaIds = useMemo(() => [...new Set(doTipo.map((t) => ofertaDoTitulo(t)).filter(Boolean))].sort(), [doTipo]);
  const { data: ofertasFin = [] } = useTableRows("orcamentos", ofertaIds.length > 0, undefined, {
    key: `ids|${ofertaIds.join(",")}`,
    apply: (q) => q.in("id", ofertaIds),
  });
  const numOferta = (id: string) => text(ofertasFin.find((o) => text(rowId(o)) === id)?.["numero"]);
  const ehSerie = (t: Row) => t["origem_tipo"] === "manual" && (!!t["origem_id"] || !!serieLegada(t));
  const ehRecorrente = (t: Row) => ehSerie(t) || (t["origem_tipo"] === "oferta" && !!t["origem_id"]);
  const [excluirAlvo, setExcluirAlvo] = useState<Row[] | null>(null);
  const [escopoExc, setEscopoExc] = useState<EscopoRecorrencia>("atual");
  const [excluindo, setExcluindo] = useState(false);
  const pedirExclusao = (ts: Row[]) => { if (!ts.length) return; setEscopoExc("atual"); setExcluirAlvo(ts); };
  const setExcluirSerie = (t: Row | null) => (t ? pedirExclusao([t]) : setExcluirAlvo(null));
  const excluir = (t: Row) => pedirExclusao([t]);
  /** Irmãs da série (manual, legada ou de Oferta), normalizadas para as regras de alcance. */
  const alvosExclusao = async (t: Row, escopo: EscopoRecorrencia): Promise<string[]> => {
    const id = text(rowId(t));
    if (escopo === "atual" || !ehRecorrente(t)) return [id];
    const oferta = t["origem_tipo"] === "oferta";
    let q = supabase.from("financeiro_titulos").select("*").eq("origem_tipo", oferta ? "oferta" : "manual").eq("tipo", tipo).eq("empresa_id", text(t["empresa_id"]));
    q = t["origem_id"] ? q.eq("origem_id", text(t["origem_id"])) : q.is("origem_id", null);
    const { data, error } = await q;
    if (error) throw error;
    const todas = (data ?? []) as Row[];
    const irmas = oferta ? parcelasDaOferta(t, todas) : t["origem_id"] ? todas : parcelasLegadas(t, todas);
    const norm = (x: Row) => ({ ...x, origem_tipo: "manual", origem_id: "serie" });
    return [id, ...alvosRecorrencia(norm(t), irmas.map(norm), escopo, hojeISO()).map((x) => text(rowId(x)))];
  };
  const confirmarExclusao = async () => {
    const ts = excluirAlvo; if (!ts) return;
    setExcluindo(true);
    try {
      const ids = new Set<string>();
      for (const t of ts) for (const i of await alvosExclusao(t, escopoExc)) ids.add(i);
      const { error } = await supabase.from("financeiro_titulos").delete().in("id", [...ids]);
      if (error) throw error;
      toast.success(`${ids.size} título(s) excluído(s).`); setExcluirAlvo(null); setSel(new Set()); invalidar();
    } catch (e) { toast.error(erroFinanceiro(e)); } finally { setExcluindo(false); }
  };

  const selecionados = rows.filter((t) => sel.has(text(rowId(t))));
  const todosMarcados = rows.length > 0 && selecionados.length === rows.length;
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const [loteAcao, setLoteAcao] = useState<null | { acao: "pagar" | "agendar" | "reajustar"; itens: Row[] }>(null);
  const [loteForm, setLoteForm] = useState({ data: hojeISO(), forma: "", percentual: "", whats: true, email: true });
  const [ipcaCarregando, setIpcaCarregando] = useState(false);
  const [ipcaRef, setIpcaRef] = useState("");
  const abrirLote = (acao: "pagar" | "agendar" | "reajustar", itens: Row[]) => {
    if (!itens.length) return void toast.error("Nenhum título elegível na seleção.");
    setLoteForm({ data: hojeISO(), forma: "", percentual: "", whats: tipo === "receber", email: tipo === "receber" }); setLoteAcao({ acao, itens });
  };
  const sit = (t: Row) => situacaoTitulo(t, hoje);
  const abertosSel = selecionados.filter((t) => ["aberto", "atrasado", "agendado", "parcial"].includes(sit(t)));
  const pagosSel = selecionados.filter((t) => sit(t) === "pago" || sit(t) === "parcial");
  const reajustaveisSel = selecionados.filter((t) => sit(t) !== "pago" && sit(t) !== "cancelado");
  const estornarLote = async () => {
    if (!pagosSel.length) return void toast.error("Nenhum título baixado na seleção.");
    if (!await confirmar(`Estornar a baixa de ${pagosSel.length} título(s)?`)) return;
    const { error } = await supabase.from("financeiro_titulos")
      .update({ status: "aberto", pago_em: null, valor_pago: null, juros: 0, desconto: 0 } as never).in("id", pagosSel.map((t) => text(rowId(t))));
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success(`${pagosSel.length} baixa(s) estornada(s).`); setSel(new Set()); invalidar();
  };
  const desagendar = async (t: Row) => {
    const { error } = await supabase.from("financeiro_titulos").update({ agendado_para: null } as never).eq("id", text(rowId(t)));
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success("Agendamento removido."); invalidar();
  };
  const executarLote = async () => {
    if (!loteAcao) return;
    const { acao, itens } = loteAcao;
    if (acao === "reajustar") {
      const pct = num(String(loteForm.percentual).replace(",", "."));
      if (!pct) return void toast.error("Informe o percentual do reajuste.");
      const emCarencia = itens.filter((t) => infoReajuste(t, hoje).emCarencia);
      if (emCarencia.length && !await confirmar(`${emCarencia.length} título(s) já foram reajustados há menos de ${CARENCIA_REAJUSTE_MESES} meses. Deseja reajustar mesmo assim?`)) return;
      for (const t of itens) {
        const { error } = await supabase.from("financeiro_titulos").update({ valor: valorReajustado(num(t["valor"]), pct), reajustado_em: hoje, reajuste_percentual: pct } as never).eq("id", text(rowId(t)));
        if (error) return void toast.error(erroFinanceiro(error));
      }
      toast.success(`${itens.length} título(s) reajustado(s) em ${pct}%.`);
      const canais = [loteForm.whats && "whatsapp", loteForm.email && "email"].filter(Boolean);
      if (tipo === "receber" && canais.length) {
        const { data, error } = await supabase.functions.invoke("cobranca-regua", { body: {
          acao: "reajuste_aviso", percentual: pct, referencia: ipcaRef.replace(/^IPCA acumulado 12 meses: [^(]*\(/, "IPCA 12m, ").replace(/\)$/, ""), canais,
          itens: itens.map((t) => ({ id: text(rowId(t)), valor_anterior: num(t["valor"]) })) } });
        const log = ((data as { log?: Array<{ ok: boolean; cliente: string; canal: string; erro?: string }> } | null)?.log) ?? [];
        if (error || (data as { erro?: string } | null)?.erro) toast.error(`Reajuste salvo, mas a comunicação falhou: ${(data as { erro?: string } | null)?.erro ?? "atualize a função cobranca-regua (v3)."}`);
        else {
          const ok = log.filter((l) => l.ok).length, falhas = log.filter((l) => !l.ok);
          toast.success(`Comunicação enviada: ${ok} envio(s).`);
          if (falhas.length) toast.error(`${falhas.length} envio(s) não realizados: ${falhas.slice(0, 3).map((f) => `${f.cliente} (${f.erro})`).join("; ")}`, { duration: 10000 });
        }
      }
    } else if (acao === "pagar") {
      for (const t of itens) {
        const { error } = await supabase.from("financeiro_titulos").update({
          status: "pago", pago_em: loteForm.data, valor_pago: num(t["valor"]), juros: 0, desconto: 0, agendado_para: null,
          ...(loteForm.forma ? { forma_pagamento: loteForm.forma } : {}),
        } as never).eq("id", text(rowId(t)));
        if (error) return void toast.error(erroFinanceiro(error));
      }
      toast.success(`${itens.length} baixa(s) registrada(s).`);
    } else {
      const { error } = await supabase.from("financeiro_titulos").update({ agendado_para: loteForm.data } as never).in("id", itens.map((t) => text(rowId(t))));
      if (error) return void toast.error(erroFinanceiro(error));
      toast.success(`${itens.length} título(s) agendado(s) para ${formatDate(loteForm.data)}.`);
    }
    setLoteAcao(null); setSel(new Set()); invalidar();
  };

  const pagoLabel = tipo === "receber" ? "Recebido" : "Pago";
  const cards: Array<{ label: string; valor: number; qtd: number; sit: string; cls: string }> = [
    { label: "Total do período", valor: resumo.total, qtd: resumo.qtd.total, sit: "todos", cls: "border-l-muted-foreground" },
    { label: "A vencer", valor: resumo.aVencer, qtd: resumo.qtd.aVencer, sit: "aberto", cls: "border-l-primary" },
    { label: "Vencidos", valor: resumo.vencidos, qtd: resumo.qtd.vencidos, sit: "atrasado", cls: "border-l-destructive" },
    { label: `${pagoLabel} ${periodoF.de || periodoF.ate ? "no período" : "no mês"}`, valor: resumo.pagoMes, qtd: resumo.qtd.pago, sit: "pago", cls: "border-l-success" },
    { label: "Total em aberto", valor: resumo.emAberto, qtd: resumo.qtd.emAberto, sit: "em_aberto", cls: "border-l-warning" },
  ];

  const columns: Column[] = [
    ...(perms.canDelete || perms.canUpdate ? [{ key: "sel", header: "", fields: [], sortable: false, className: "w-8", render: (t: Row) => t["__fatura"] || t["__filho"] ? null : (
      <Checkbox aria-label="Selecionar" checked={sel.has(text(rowId(t)))} onCheckedChange={() => alternar(text(rowId(t)))} />
    ) } as Column] : []),
    { key: "venc", header: "Vencimento", fields: ["vencimento"], render: (t) => t["__filho"] ? <span className="text-muted-foreground text-xs tabular-nums">Compra {formatDate(t["data_compra"]) || "—"}</span> : <span className="tabular-nums">{formatDate(t["vencimento"])}</span> },
    { key: "desc", header: "Descrição", fields: ["descricao"], render: (t) => (
      <div className={cn("min-w-0", !!t["__filho"] && "border-primary/40 ml-4 border-l-2 pl-3")}>
        {(() => {
          const txt = text(t["descricao"]).match(/^(.*?)\s*\((\d+\/\d+)\)\s*$/);
          const pos = posSerie.get(text(rowId(t)));
          const m = pos ? [null, txt ? txt[1] : text(t["descricao"]), pos] as const : txt;
          return (
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate font-medium">{m ? m[1] : text(t["descricao"])}</p>
              {m && <span className="bg-muted text-foreground border-border shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">{m[2]}</span>}
            </div>
          );
        })()}
        {!!t["__fatura"] && (
          <button type="button" className="text-primary mb-1 flex items-center gap-1 text-xs font-medium" onClick={(e) => { e.stopPropagation(); setAbertas((s) => { const n = new Set(s); const k = text(t["id"]); if (n.has(k)) n.delete(k); else n.add(k); return n; }); }}>
            {abertas.has(text(t["id"])) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}<CreditCard className="h-3.5 w-3.5" /> {abertas.has(text(t["id"])) ? "Ocultar itens" : "Mostrar itens"}
          </button>
        )}
        {!t["__fatura"] && ofertaDoTitulo(t) ? (
          <button type="button" className="text-primary flex items-center gap-1 text-xs font-semibold hover:underline" onClick={(e) => { e.stopPropagation(); setConsultaTitulo(t); setConsultaOferta(ofertaDoTitulo(t)); }}>
            <FileText className="h-3.5 w-3.5" /> Oferta #{numOferta(ofertaDoTitulo(t)) || "…"}
          </button>
        ) : null}
        {!t["__fatura"] && (t["nfe_numero"] || t["nfse_numero"] || t["nfse_rps"]) ? (
          <div className="flex flex-wrap gap-1">
            {rotulosFiscais(t).map((r) => <span key={r} className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-semibold">{r}</span>)}
          </div>
        ) : null}
        <p className="text-muted-foreground text-xs">{t["__fatura"] ? `Cartão de crédito • ${(t["__itens"] as Row[]).length} item(ns) — clique para ver` : <>{ORIGEM_LABEL[text(t["origem_tipo"])] ?? "Manual"}{t["categoria"] ? ` • ${text(t["categoria"])}` : ""}</>}</p>
      </div>
    ) },
    { key: "parc", header: tipo === "receber" ? "Cliente" : "Fornecedor", fields: [], render: (t) => t["__fatura"] ? ([...new Set((t["__itens"] as Row[]).map((x) => nomeParc(x["parceiro_id"])).filter(Boolean))].join(", ") || "—") : (Boolean(t["cliente_atendido_id"]) ? <span>{nomeParc(t["parceiro_id"]) || "—"}<span className="text-muted-foreground block text-xs">Ref.: {nomeParc(t["cliente_atendido_id"])}</span></span> : nomeParc(t["parceiro_id"]) || "—") },
    { key: "valor", header: "Valor", fields: ["valor"], render: (t) => (
      <div className="flex flex-col items-start gap-1">
        <span className="font-semibold tabular-nums">{formatBRL(t["valor"])}</span>
        {!t["__fatura"] && <ItensChip qtd={(itensPorTitulo.get(text(rowId(t))) ?? []).length} onClick={() => setVerItens(t)} />}
      </div>
    ) },
    { key: "sit", header: "Situação", fields: [], render: (t) => {
      if (t["__filho"]) return <span className="text-muted-foreground text-xs">na fatura</span>;
      const s = situacaoTitulo(t, hoje);
      return (
        <div>
          <span className={cn("rounded px-2 py-0.5 text-xs font-medium", SITUACAO_META[s].badge)}>{SITUACAO_META[s].label(tipo)}</span>
          {s === "pago" && <p className="text-muted-foreground mt-1 text-xs">{formatDate(t["pago_em"])} • {formatBRL(t["valor_pago"])}</p>}
          {s === "parcial" && <p className="text-muted-foreground mt-1 text-xs">Pago {formatBRL(t["valor_pago"])} • saldo {formatBRL(round2(num(t["valor"]) - num(t["valor_pago"])))}</p>}
          {s === "agendado" && <p className="text-muted-foreground mt-1 text-xs">para {formatDate(t["agendado_para"])}</p>}
          {t["reajustado_em"] ? <p className="text-muted-foreground mt-1 text-xs">Reajustado em {formatDate(t["reajustado_em"])}</p> : null}
        </div>
      );
    } },
  ];

  const fatura = faturaSel ? (exibidos.find((x) => x["id"] === faturaSel["id"] && x["__fatura"]) ?? faturaSel) : null;
  const rowMenu = (t: Row) => {
    if (t["__fatura"]) return (
      <>
        <DropdownMenuItem onClick={() => setFatura(t)}><CreditCard className="h-4 w-4" /> Editar fatura e itens</DropdownMenuItem>
        {perms.canUpdate && t["status"] !== "pago" && <DropdownMenuItem onClick={() => void baixarItensFatura(t["__itens"] as Row[])}><CheckCircle2 className="text-success h-4 w-4" /> Baixar fatura (total)</DropdownMenuItem>}
        {perms.canUpdate && t["status"] !== "pago" && <DropdownMenuItem onClick={() => setFatura(t)}><CheckCircle2 className="h-4 w-4" /> Pagamento parcial / mínimo</DropdownMenuItem>}
        {perms.canDelete && <DropdownMenuItem onClick={() => setExcluirFat(t)}><Trash2 className="text-destructive h-4 w-4" /> Excluir fatura</DropdownMenuItem>}
        {perms.canUpdate && num(t["valor_pago"]) > 0 && <DropdownMenuItem onClick={() => void estornarFatura(t["__itens"] as Row[])}><Undo2 className="h-4 w-4" /> Estornar pagamentos da fatura</DropdownMenuItem>}
      </>
    );
    if (t["__filho"]) return (
      <DropdownMenuItem onClick={() => setFatura(t["__pai"] as Row)}><CreditCard className="h-4 w-4" /> Abrir fatura</DropdownMenuItem>
    );
    const s = situacaoTitulo(t, hoje);
    const aberto = s === "aberto" || s === "atrasado" || s === "agendado" || s === "parcial";
    return (
      <>
        {perms.canUpdate && aberto && (
          <DropdownMenuItem onClick={() => setBaixar(t)}><CheckCircle2 className="text-success h-4 w-4" /> {tipo === "receber" ? "Registrar recebimento" : "Registrar pagamento"}</DropdownMenuItem>
        )}
        {perms.canUpdate && aberto && s !== "agendado" && (
          <DropdownMenuItem onClick={() => abrirLote("agendar", [t])}><CalendarClock className="h-4 w-4" /> Agendar pagamento</DropdownMenuItem>
        )}
        {perms.canUpdate && s === "agendado" && (
          <DropdownMenuItem onClick={() => void desagendar(t)}><CalendarClock className="h-4 w-4" /> Remover agendamento</DropdownMenuItem>
        )}
        {perms.canUpdate && aberto && (
          <DropdownMenuItem onClick={() => abrirLote("reajustar", [t])}><TrendingUp className="h-4 w-4" /> Reajustar valor</DropdownMenuItem>
        )}
        {perms.canUpdate && (s === "pago" || s === "parcial") && (
          <DropdownMenuItem onClick={() => estornar(t)}><Undo2 className="h-4 w-4" /> Estornar baixa</DropdownMenuItem>
        )}
        {tipo === "receber" && perms.canUpdate && aberto && (
          <DropdownMenuItem onClick={() => setCobrar(t)}><QrCode className="h-4 w-4" /> Cobrança Boleto + Pix</DropdownMenuItem>
        )}
        {tipo === "receber" && perms.canUpdate && (
          <DropdownMenuItem onClick={() => setVincOferta(t)}><FileText className="h-4 w-4" /> {ofertaDoTitulo(t) ? "Trocar Oferta de referência" : "Gerar / vincular Oferta"}</DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => setRecibo(t)}><Receipt className="h-4 w-4" /> Emitir recibo</DropdownMenuItem>
        {t["comprovante"] ? (
          <DropdownMenuItem onClick={() => window.open(text(t["comprovante"]), "_blank", "noopener")}><Paperclip className="h-4 w-4" /> Ver comprovante</DropdownMenuItem>
        ) : null}
        {perms.canCreate && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setClonar(t)}><Copy className="h-4 w-4" /> Duplicar lançamento</DropdownMenuItem>
          </>
        )}
      </>
    );
  };

  const exportarCsv = () => {
    const linhas = [["Vencimento", "Descrição", "Parceiro", "Categoria", "Centro de custo", "Valor", "Situação", "Pago em", "Valor pago"]];
    for (const t of rows) {
      const s = situacaoTitulo(t, hoje);
      linhas.push([formatDate(t["vencimento"]), text(t["descricao"]), nomeParc(t["parceiro_id"]), text(t["categoria"]), nomeCentro(t["centro_custo_id"]),
        num(t["valor"]).toFixed(2).replace(".", ","), SITUACAO_META[s].label(tipo), formatDate(t["pago_em"]), t["valor_pago"] ? num(t["valor_pago"]).toFixed(2).replace(".", ",") : ""]);
    }
    const csv = "\uFEFF" + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `contas-a-${tipo}.csv`; a.click();
  };

  const situacoesOpts = [{ value: "em_aberto", label: "Em aberto (todos)" }, ...(["aberto", "parcial", "atrasado", "pago", "cancelado"] as Situacao[]).map((s) => ({ value: s, label: SITUACAO_META[s].label(tipo) }))];
  const centroOpts = [{ value: "todos", label: "Todos" }, { value: "sem", label: "Sem centro de custo" },
    ...centrosCusto.map((c) => ({ value: text(rowId(c)), label: nomeCentro(rowId(c)) })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))];
  const filtrosTexto = [
    `Período: ${periodoF.de || periodoF.ate ? `${formatDate(periodoF.de) || "início"} a ${formatDate(periodoF.ate) || "fim"}` : "Todo o período"}`,
    `Situação: ${situacoesSel.length ? situacoesSel.map((s) => situacoesOpts.find((o) => o.value === s)?.label ?? s).join(", ") : "Todas"}`,
    `Categoria: ${f.categoria === "todos" ? "Todas" : f.categoria}`,
    `Centro de custo: ${centroOpts.find((o) => o.value === f.centro)?.label ?? "Todos"}`,
    ...(f.busca ? [`Busca: "${f.busca}"`] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <button key={c.label} type="button" onClick={() => setF((s) => ({ ...s, situacao: s.situacao === c.sit ? "todos" : c.sit }))}
            className={cn("bg-card rounded-lg border border-l-4 p-3 text-left transition hover:shadow-sm", c.cls, f.situacao === c.sit && c.sit !== "todos" && "ring-primary ring-2")}>
            <p className="text-muted-foreground text-xs">{c.label}</p>
            <p className="text-lg font-bold tabular-nums">{formatBRL(c.valor)}</p>
            <p className="text-muted-foreground text-xs">{c.qtd} título(s)</p>
          </button>
        ))}
      </div>

      <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
        <span><strong>{rows.length}</strong> título(s) encontrado(s) de {doTipo.length} cadastrados • Total filtrado: <strong className="tabular-nums">{formatBRL(totalFiltrado)}</strong></span>
        <Button variant="outline" size="sm" onClick={() => setRelatorio(true)}><FileText className="mr-1 h-4 w-4" />Relatório</Button>
      </div>
      {relatorio && (
        <RelatorioTitulos tipo={tipo} rows={rows} hoje={hoje} filtros={filtrosTexto} resumo={resumoTitulos(rows, hoje, periodoF)}
          nomeParc={nomeParc} nomeCentro={nomeCentro} onClose={() => setRelatorio(false)} />
      )}


      {(perms.canDelete || perms.canUpdate) && rows.length > 0 && (
        <div className={cn("bg-card flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3", selecionados.length > 0 && "border-primary")}>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={todosMarcados} onCheckedChange={() => setSel(todosMarcados ? new Set() : new Set(rows.map((t) => text(rowId(t)))))} />
            {selecionados.length > 0
              ? <span><strong>{selecionados.length}</strong> selecionado(s) • <strong className="tabular-nums">{formatBRL(selecionados.reduce((s, t) => s + num(t["valor"]), 0))}</strong></span>
              : <span className="text-muted-foreground">Selecionar todos ({rows.length})</span>}
          </label>
          {selecionados.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setSel(new Set())}>Desmarcar</Button>
              {perms.canUpdate && <>
                <Button variant="outline" size="sm" disabled={!abertosSel.length} onClick={() => abrirLote("pagar", abertosSel)}><CheckCircle2 className="mr-1 h-4 w-4" />{tipo === "receber" ? "Registrar recebimento" : "Registrar pagamento"} ({abertosSel.length})</Button>
                <Button variant="outline" size="sm" disabled={!abertosSel.length} onClick={() => abrirLote("agendar", abertosSel)}><CalendarClock className="mr-1 h-4 w-4" />Agendar ({abertosSel.length})</Button>
                <Button variant="outline" size="sm" disabled={!pagosSel.length} onClick={() => void estornarLote()}><Undo2 className="mr-1 h-4 w-4" />Estornar baixa ({pagosSel.length})</Button>
                <Button variant="outline" size="sm" disabled={!reajustaveisSel.length} onClick={() => abrirLote("reajustar", reajustaveisSel)}><TrendingUp className="mr-1 h-4 w-4" />Reajustar ({reajustaveisSel.length})</Button>
              </>}
              {perms.canDelete && <Button variant="destructive" size="sm" onClick={() => pedirExclusao(selecionados)}><Trash2 className="mr-1 h-4 w-4" />Excluir selecionados</Button>}
            </div>
          )}
        </div>
      )}

      <Dialog open={!!loteAcao} onOpenChange={(o) => !o && setLoteAcao(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>
            {loteAcao?.acao === "pagar" ? (tipo === "receber" ? "Registrar recebimento" : "Registrar pagamento") : loteAcao?.acao === "agendar" ? "Agendar pagamento" : "Reajustar valores"} — {loteAcao?.itens.length} título(s)
          </DialogTitle></DialogHeader>
          {loteAcao && (
            <div className="space-y-3">
              <p className="text-sm">Total atual: <strong className="tabular-nums">{formatBRL(loteAcao.itens.reduce((s, t) => s + num(t["valor"]), 0))}</strong></p>
              {loteAcao.acao !== "reajustar" && (
                <div className="space-y-1"><Label>{loteAcao.acao === "pagar" ? "Data do pagamento" : "Agendar para"}</Label>
                  <Input type="date" value={loteForm.data} onChange={(e) => setLoteForm((s) => ({ ...s, data: e.target.value }))} /></div>
              )}
              {loteAcao.acao === "pagar" && (
                <div className="space-y-1"><Label>Forma de pagamento (opcional)</Label>
                  <SearchSelect value={loteForm.forma} onChange={(v) => setLoteForm((s) => ({ ...s, forma: v }))} options={FORMAS_PAGAMENTO.map((x) => ({ value: x, label: x }))} placeholder="Manter a de cada título" /></div>
              )}
              {loteAcao.acao === "reajustar" && (() => {
                const pct = num(String(loteForm.percentual).replace(",", "."));
                const carencia = loteAcao.itens.filter((t) => infoReajuste(t, hoje).emCarencia).length;
                const fmt = (d: string) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
                return (<>
                  <div className="space-y-1"><Label>Percentual de reajuste (ex.: IPCA acumulado 4,5)</Label>
                    <div className="flex gap-2">
                      <Input inputMode="decimal" value={loteForm.percentual} onChange={(e) => setLoteForm((s) => ({ ...s, percentual: e.target.value }))} placeholder="0,00 %" />
                      <Button type="button" variant="outline" disabled={ipcaCarregando} onClick={async () => {
                        setIpcaCarregando(true);
                        try {
                          const r = await buscarIpca12m();
                          if (!r.ok) return void toast.error("Não foi possível consultar o IPCA no Banco Central agora. Informe o percentual manualmente.");
                          setLoteForm((s) => ({ ...s, percentual: r.valor.toFixed(2).replace(".", ",") }));
                          const [, m, a] = r.data.split("/");
                          setIpcaRef(`IPCA acumulado 12 meses: ${r.valor.toFixed(2).replace(".", ",")}% (ref. ${m}/${a} — fonte: Banco Central)`);
                        } finally { setIpcaCarregando(false); }
                      }}><TrendingUp className="h-4 w-4" />{ipcaCarregando ? "Buscando..." : "Buscar IPCA 12m"}</Button>
                    </div>
                    {ipcaRef && <p className="text-xs text-muted-foreground">{ipcaRef}</p>}</div>
                  {tipo === "receber" && (
                    <div className="space-y-1 rounded-md border p-2"><p className="text-sm font-medium">Comunicar clientes do reajuste</p>
                      <div className="flex flex-wrap gap-4 text-sm">
                        <label className="flex items-center gap-2"><Switch checked={loteForm.whats} onCheckedChange={(x) => setLoteForm((s) => ({ ...s, whats: x }))} /> WhatsApp</label>
                        <label className="flex items-center gap-2"><Switch checked={loteForm.email} onCheckedChange={(x) => setLoteForm((s) => ({ ...s, email: x }))} /> E-mail (modelo do aviso de boleto)</label>
                      </div>
                      <p className="text-xs text-muted-foreground">Uma mensagem por cliente, com valor anterior, novo valor, índice aplicado e as parcelas reajustadas.</p>
                    </div>
                  )}
                  {pct !== 0 && <p className="text-sm">Novo total: <strong className="tabular-nums">{formatBRL(loteAcao.itens.reduce((s, t) => s + valorReajustado(num(t["valor"]), pct), 0))}</strong></p>}
                  {carencia > 0 && <p className="text-destructive text-sm font-medium">Atenção: {carencia} título(s) ainda não completaram {CARENCIA_REAJUSTE_MESES} meses desde o início do contrato ou do último reajuste.</p>}
                  <div className="max-h-72 overflow-auto rounded border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0"><tr className="text-left">
                        <th className="p-2">Vencimento</th><th className="p-2">Descrição</th><th className="p-2">Data-base</th>
                        <th className="p-2 text-right">Atual</th><th className="p-2 text-right">Novo</th><th className="p-2"></th></tr></thead>
                      <tbody>
                        {loteAcao.itens.map((t) => {
                          const inf = infoReajuste(t, hoje);
                          return (<tr key={String(t["id"])} className="border-t align-top">
                            <td className="p-2 whitespace-nowrap">{fmt(String(t["vencimento"] ?? ""))}</td>
                            <td className="p-2">{String(t["descricao"] ?? "")}</td>
                            <td className="p-2">
                              <div>{inf.origem === "reajuste" ? "Reajustado em " : inf.origem === "competencia" ? "Início " : ""}{fmt(inf.base)}</div>
                              {inf.origem === null ? <span className="text-muted-foreground">Sem competência</span>
                                : inf.emCarencia ? <span className="text-destructive font-medium">Faltam {inf.faltam} mes(es)</span>
                                : <span className="text-primary font-medium">{inf.meses} meses — apto</span>}
                            </td>
                            <td className="p-2 text-right tabular-nums">{formatBRL(num(t["valor"]))}</td>
                            <td className="p-2 text-right tabular-nums">{formatBRL(valorReajustado(num(t["valor"]), pct))}</td>
                            <td className="p-2"><Button type="button" variant="ghost" size="sm" className="h-6 px-2" aria-label="Remover"
                              onClick={() => setLoteAcao((s) => s && ({ ...s, itens: s.itens.filter((x) => x["id"] !== t["id"]) }))}>×</Button></td>
                          </tr>);
                        })}
                      </tbody>
                    </table>
                  </div>
                </>);
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoteAcao(null)}>Cancelar</Button>
            <Button onClick={() => void executarLote()}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={!!fatura} onOpenChange={(o) => !o && setFatura(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{text(fatura?.["descricao"])} — vence {formatDate(fatura?.["vencimento"])}</DialogTitle></DialogHeader>
          {fatura && (() => {
            const itens = [...(fatura["__itens"] as Row[])].sort((a, b) => text(a["data_compra"]).localeCompare(text(b["data_compra"])));
            return (<>
              <div className="max-h-[60vh] overflow-auto rounded border">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0"><tr className="text-left">
                    <th className="p-2">Compra</th><th className="p-2">Descrição</th><th className="p-2">Categoria</th><th className="p-2 text-right">Valor</th><th className="p-2">Situação</th><th className="p-2"></th></tr></thead>
                  <tbody>
                    {itens.map((t) => {
                      const st = situacaoTitulo(t, hoje); const pos = posSerie.get(text(rowId(t)));
                      return (<tr key={text(rowId(t))} className="border-t">
                        <td className="p-2 whitespace-nowrap tabular-nums">{formatDate(t["data_compra"]) || "—"}</td>
                        <td className="p-2">{text(t["descricao"]).replace(/\s*\(\d+\/\d+\)\s*$/, "")}{pos && <span className="bg-muted text-foreground border-border ml-1.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">{pos}</span>}
                          {nomeParc(t["parceiro_id"]) && <p className="text-muted-foreground text-xs">{nomeParc(t["parceiro_id"])}</p>}{Boolean(t["cliente_atendido_id"]) && <p className="text-muted-foreground text-xs">Ref.: {nomeParc(t["cliente_atendido_id"])}</p>}</td>
                        <td className="p-2">{text(t["categoria"]) || "—"}</td>
                        <td className="p-2 text-right font-medium tabular-nums">{formatBRL(t["valor"])}</td>
                        <td className="p-2"><span className={cn("rounded px-2 py-0.5 text-xs font-medium", SITUACAO_META[st].badge)}>{SITUACAO_META[st].label(tipo)}</span></td>
                        <td className="p-2 whitespace-nowrap">
                          {num(t["valor_pago"]) > 0 && t["status"] !== "pago" && <p className="text-muted-foreground text-[10px]">pago {formatBRL(t["valor_pago"])}</p>}
                          {perms.canUpdate && <Button size="sm" variant="ghost" onClick={() => { setFatura(null); setEditar(t); }}>Editar</Button>}
                          {perms.canDelete && <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Excluir item" onClick={() => void excluirItemFatura(t)}><Trash2 className="text-destructive h-4 w-4" /></Button>}</td>
                      </tr>);
                    })}
                  </tbody>
                </table>
              </div>
              {perms.canUpdate && <FaturaAcoes key={text(fatura["id"])} fatura={fatura} itens={itens}
                onVencimento={(d) => void mudarVencimentoFatura(itens, d)} onParcial={(val, d) => void pagarParcialFatura(itens, val, d)}
                onEstornar={() => void estornarFatura(itens)} />}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">{itens.length} item(ns) • Total <strong className="tabular-nums">{formatBRL(fatura["valor"])}</strong>
                  {num(fatura["valor_pago"]) > 0 && fatura["status"] !== "pago" && <> • Pago {formatBRL(fatura["valor_pago"])} • Saldo <strong>{formatBRL(round2(num(fatura["valor"]) - num(fatura["valor_pago"])))}</strong></>}</p>
                <div className="flex flex-wrap gap-2">
                  {perms.canDelete && <Button variant="outline" className="text-destructive" onClick={() => { const f = fatura; setFatura(null); setExcluirFat(f); }}><Trash2 className="mr-1 h-4 w-4" />Excluir fatura</Button>}
                  <Button variant="outline" onClick={() => setFatura(null)}>Fechar</Button>
                  {perms.canCreate && <Button variant="outline" onClick={() => setNovaCompra(fatura)}><Plus className="mr-1 h-4 w-4" />Adicionar itens</Button>}
                  {perms.canUpdate && fatura["status"] !== "pago" && <Button onClick={() => void baixarItensFatura(itens)}><CheckCircle2 className="mr-1 h-4 w-4" />Baixar fatura (total)</Button>}
                </div>
              </div>
            </>);
          })()}
        </DialogContent>
      </Dialog>

      {novaCompra && <NovaCompraCartao tipo={tipo} fatura={novaCompra} cartoes={cartoes} parceiros={parceiros} categorias={categorias.ativas}
        onClose={() => setNovaCompra(null)} onSaved={invalidar} />}
      {importar && <ImportarFaturaDialog cartoes={cartoes} parceiros={parceiros} categorias={categorias.ativas}
        onClose={() => setImportar(false)} onSaved={invalidar} />}
      {importarConta && <ImportarContaDialog parceiros={parceiros} categorias={categorias.ativas}
        onClose={() => setImportarConta(false)} onSaved={invalidar} />}
      <DataTable
        rowActions={(r) => (r["__fatura"] ? { edit: false, delete: false } : { edit: true, delete: true })}
        title={tipo === "receber" ? "Contas a Receber" : "Contas a Pagar"}
        columns={columns}
        rows={exibidos}
        loading={loading}
        getValue={(r, fs) => r[fs[0] ?? ""]}
        rowKey={(r, i) => text(rowId(r)) || String(i)}
        onAdd={perms.canCreate ? () => { setNovoNoCartao(""); setEditar(null); } : undefined}
        onEdit={(r) => (r["__fatura"] ? setFatura(r) : setEditar(r))}
        rowMenu={rowMenu}
        editReadOnly={!perms.canUpdate}
        skipDeleteConfirm
        onDelete={perms.canDelete ? (r) => (r["__fatura"] ? setExcluirFat(r) : r["__filho"] ? void excluirItemFatura(r) : excluir(r)) : undefined}
        filters={
          <>
            <FilterInput label="Busca" value={f.busca} onChange={(v) => setF((s) => ({ ...s, busca: v }))} placeholder="Descrição, parceiro, categoria" />
            <FiltroMulti label="Situação" selecionadas={situacoesSel} options={situacoesOpts}
              onChange={(l) => setF((s) => ({ ...s, situacao: l.length ? l.join(",") : "todos" }))} />
            <div className="space-y-1"><Label className="text-xs">Centro de custo</Label>
              <SearchSelect value={f.centro} options={centroOpts} placeholder="Todos" onChange={(v) => setF((s) => ({ ...s, centro: v || "todos" }))} /></div>
            <FilterSelect label="Categoria" value={f.categoria} onChange={(v) => setF((s) => ({ ...s, categoria: v }))}
              options={[{ value: "todos", label: "Todas" }, ...categorias.todas.map((c) => ({ value: c, label: c }))]} />
            {tipo === "pagar" && cartoes.length > 0 && (
              <FilterSelect label="Cartão" value={f.cartao} onChange={(v) => setF((s) => ({ ...s, cartao: v }))}
                options={[{ value: "todos", label: "Todos" }, ...cartoes.map((c) => ({ value: text(rowId(c)), label: nomeCartao(c) }))]} />
            )}
            <PeriodoNavegavel value={f.per} onChange={(p) => setF((s) => ({ ...s, per: p }))} />
            <div className="flex items-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline"><MoreHorizontal className="mr-1 h-4 w-4" />Ações<ChevronDown className="ml-1 h-4 w-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {tipo === "pagar" && perms.canCreate && <>
                    <DropdownMenuItem onClick={() => setImportar(true)}><FileUp className="h-4 w-4" /> Importar fatura do cartão (PDF)</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setImportarConta(true)}><FileUp className="h-4 w-4" /> Importar boleto / NF</DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>}
                  <DropdownMenuItem onClick={() => setCatAberto(true)}><Tags className="h-4 w-4" /> Gerenciar categorias</DropdownMenuItem>
                  <DropdownMenuItem onClick={exportarCsv}><Download className="h-4 w-4" /> Exportar CSV</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <CategoriasDialog tipo={tipo} podeEditar={perms.canCreate || perms.canUpdate} open={catAberto} onOpenChange={setCatAberto} /></div>
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
        <TituloSheet key={novoNoCartao || "x"} tipo={tipo} registro={editar} presetCartao={novoNoCartao} parceiros={parceiros} cartoes={cartoes} readOnly={!!editar && !perms.canUpdate}
          onDelete={editar && perms.canDelete ? () => { const t = editar; setEditar(undefined); setNovoNoCartao(""); pedirExclusao([t]); } : undefined}
          onClose={() => { setEditar(undefined); setNovoNoCartao(""); }} onSaved={invalidar} />
      )}
      {clonar && (
        <TituloSheet tipo={tipo} registro={null} modelo={clonar} parceiros={parceiros} cartoes={cartoes} readOnly={false}
          onClose={() => setClonar(null)} onSaved={invalidar} />
      )}
      {vincOferta && <VincularOfertaDialog titulo={vincOferta} onClose={() => setVincOferta(null)} />}
      {consultaOferta && <OfertaConsultaSheet ofertaId={consultaOferta} titulo={consultaTitulo} onClose={() => { setConsultaOferta(""); setConsultaTitulo(null); }} />}
      <ItensTituloDialog titulo={verItens} itens={verItens ? itensPorTitulo.get(text(rowId(verItens))) ?? [] : []} nomeParceiro={verItens ? nomeParc(verItens["parceiro_id"]) : ""}
        onClose={() => setVerItens(null)} onEditar={() => { const t = verItens; setVerItens(null); if (t) setEditar(t); }} />
      {recibo && <ReciboDialog tipo={tipo} titulo={recibo} parceiro={parceiroById.get(text(recibo["parceiro_id"]))} onClose={() => setRecibo(null)} />}
      <Dialog open={!!excluirFat} onOpenChange={(o) => !o && setExcluirFat(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader><DialogTitle>Excluir fatura</DialogTitle></DialogHeader>
          {excluirFat && (() => {
            const itens = [...(excluirFat["__itens"] as Row[])].sort((a, b) => text(a["data_compra"]).localeCompare(text(b["data_compra"])));
            const parcelados = itens.filter((t) => posSerie.get(text(rowId(t)))).length;
            return (<>
              <p className="text-sm">{text(excluirFat["descricao"])} — vence {formatDate(excluirFat["vencimento"])}. Estes lançamentos serão excluídos:</p>
              <div className="max-h-[40vh] overflow-auto rounded border">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0"><tr className="text-left">
                    <th className="p-2">Compra</th><th className="p-2">Descrição</th><th className="p-2">Categoria</th><th className="p-2">Parcela</th><th className="p-2 text-right">Valor</th></tr></thead>
                  <tbody>
                    {itens.map((t) => (<tr key={text(rowId(t))} className="border-t">
                      <td className="p-2 whitespace-nowrap tabular-nums">{formatDate(t["data_compra"]) || "—"}</td>
                      <td className="p-2">{text(t["descricao"]).replace(/\s*\(\d+\/\d+\)\s*$/, "")}
                        {nomeParc(t["parceiro_id"]) && <p className="text-muted-foreground text-xs">{nomeParc(t["parceiro_id"])}</p>}{Boolean(t["cliente_atendido_id"]) && <p className="text-muted-foreground text-xs">Ref.: {nomeParc(t["cliente_atendido_id"])}</p>}</td>
                      <td className="p-2">{text(t["categoria"]) || "—"}</td>
                      <td className="p-2">{posSerie.get(text(rowId(t))) || "—"}</td>
                      <td className="p-2 text-right font-medium tabular-nums">{formatBRL(t["valor"])}</td>
                    </tr>))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm">{itens.length} item(ns) • Total <strong className="tabular-nums">{formatBRL(excluirFat["valor"])}</strong></p>
              <div role="radiogroup" aria-label="Alcance da exclusão" className="space-y-3 py-1">
                {([
                  ["atual", "Somente os lançamentos desta fatura"],
                  ["seguintes", "Esta fatura e as parcelas seguintes em aberto (sem baixas)"],
                  ["todas", "Todas as parcelas das compras desta fatura"],
                ] as const).map(([valor, label]) => <label key={valor} className="flex cursor-pointer items-start gap-3 text-sm">
                  <input type="radio" name="alcance-fatura" checked={alcFat === valor} onChange={() => setAlcFat(valor)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
                  <span>{label}</span>
                </label>)}
              </div>
              {alcFat !== "atual" && <p className="text-sm text-warning">{parcelados > 0 ? `${parcelados} compra(s) parcelada(s) também terão parcelas excluídas em outros meses.` : "Nenhuma compra desta fatura é parcelada; só estes itens serão excluídos."}{alcFat === "todas" && parcelados > 0 && " Inclui parcelas já pagas."}</p>}
            </>);
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluirFat(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => void excluirFaturaAlcance(alcFat)}>Confirmar exclusão</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!excluirAlvo} onOpenChange={(o) => !o && !excluindo && setExcluirAlvo(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{excluirAlvo?.some(ehRecorrente) ? "Exclusão de lançamento recorrente" : "Confirmar exclusão"}</DialogTitle></DialogHeader>
          {excluirAlvo && <>
            <p className="text-sm">{excluirAlvo.length === 1 ? `"${text(excluirAlvo[0]!["descricao"])}"` : `${excluirAlvo.length} título(s)`} — total <strong>{formatBRL(excluirAlvo.reduce((s, t) => s + num(t["valor"]), 0))}</strong>. Esta ação não pode ser desfeita.</p>
            {excluirAlvo.some((t) => situacaoTitulo(t, hoje) === "pago") && <p className="text-destructive text-sm font-medium">Atenção: há título(s) já baixados na seleção.</p>}
            {excluirAlvo.some(ehRecorrente) && <>
              <p className="text-sm">A exclusão deve ser refletida:</p>
              <div role="radiogroup" aria-label="Alcance da exclusão" className="space-y-4 py-2">
                {([
                  ["atual", "Somente o lançamento atual"],
                  ["nao_vencidos", "Lançamento atual e todos os não vencidos que não possuam baixas"],
                  ["abertos", "Lançamento atual e todos os em aberto (vencidos + a vencer) que não possuam baixas"],
                  ["todos", "Todos os lançamentos"],
                ] as const).map(([valor, label]) => <label key={valor} className="flex cursor-pointer items-start gap-3 text-sm">
                  <input type="radio" name="escopo-exclusao" checked={escopoExc === valor} disabled={excluindo} onChange={() => setEscopoExc(valor)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
                  <span>{label}</span>
                </label>)}
              </div>
              {escopoExc === "todos" && <p className="text-sm text-warning">Inclui lançamentos já pagos, recebidos e cancelados da série.</p>}
            </>}
          </>}
          <DialogFooter>
            <Button variant="outline" disabled={excluindo} onClick={() => setExcluirAlvo(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={excluindo} onClick={() => void confirmarExclusao()}>{excluindo ? "Excluindo…" : "Excluir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {cobrar && <CobrancaDialog titulo={cobrar} parceiro={parceiroById.get(text(cobrar["parceiro_id"]))} onClose={() => setCobrar(null)} onSaved={invalidar} />}
      {baixar && <BaixaDialog tipo={tipo} titulo={baixar} onClose={() => setBaixar(null)} onSaved={invalidar} />}
    </div>
  );
}

function FaturaAcoes({ fatura, itens, onVencimento, onParcial, onEstornar }: {
  fatura: Row; itens: Row[]; onVencimento: (d: string) => void; onParcial: (valor: number, data: string) => void; onEstornar: () => void;
}) {
  const saldo = round2(itens.reduce((s, t) => s + saldoTitulo(t), 0));
  const [venc, setVenc] = useState(text(fatura["vencimento"]).slice(0, 10));
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeISO());
  return (
    <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
      <div className="space-y-1"><Label>Vencimento da fatura</Label>
        <div className="flex gap-2"><Input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} />
          <Button variant="outline" disabled={!venc || venc === text(fatura["vencimento"]).slice(0, 10)} onClick={() => onVencimento(venc)}>Aplicar</Button></div>
        <p className="text-muted-foreground text-xs">Muda o vencimento de todos os itens desta fatura.</p></div>
      {saldo > 0 ? (
        <div className="space-y-1"><Label>Pagamento parcial / mínimo</Label>
          <div className="flex gap-2">
            <Input inputMode="decimal" placeholder={`até ${formatBRL(saldo)}`} value={valor} onChange={(e) => setValor(mascaraMoeda(e.target.value))} />
            <Input type="date" className="w-40" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <Button size="sm" className="w-full" disabled={num(valor) <= 0} onClick={() => {
            const v = round2(num(valor));
            if (v > saldo) return void toast.error(`O valor passa do saldo da fatura (${formatBRL(saldo)}).`);
            onParcial(v, data);
          }}>Registrar pagamento</Button>
          <p className="text-muted-foreground text-xs">Abate os itens mais antigos primeiro; o restante fica como saldo em aberto.</p></div>
      ) : (
        <div className="flex items-end"><Button variant="outline" onClick={onEstornar}><Undo2 className="mr-1 h-4 w-4" />Estornar pagamentos</Button></div>
      )}
    </div>
  );
}

type ModoForm = ModoLancamento | "cartao";

function TituloSheet({ tipo, registro, modelo, presetCartao, parceiros, cartoes, readOnly, onClose, onSaved, onDelete }: {
  tipo: TipoTitulo; registro: Row | null; modelo?: Row | null; presetCartao?: string; parceiros: Row[]; cartoes: Row[]; readOnly: boolean; onClose: () => void; onSaved: () => void; onDelete?: (() => void) | undefined;
}) {
  const { isMaster, empresa } = useAuth();
  const { empresaId } = useAudit();
  const categorias = useCategoriasFinanceiro(tipo);
  const src = registro ?? modelo ?? null;
  const [v, setV] = useState({
    descricao: modelo && !registro ? `${text(modelo["descricao"]).replace(/\s*\(\d+\/\d+\)\s*$/, "")} (cópia)` : text(src?.["descricao"]),
    categoria: text(src?.["categoria"]),
    parceiro_id: text(src?.["parceiro_id"]),
    vencimento: text(src?.["vencimento"]).slice(0, 10) || hojeISO(),
    valor: src ? moedaDeNumero(num(src["valor"])) : "",
    repetir: "1",
    modo: (presetCartao && !registro ? "cartao" : "unico") as ModoForm,
    cartao_id: presetCartao && !registro ? presetCartao : modelo && !registro ? text(modelo["cartao_id"]) : "",
    data_compra: text(registro?.["data_compra"]).slice(0, 10),
    status: registro ? text(registro["status"]) || "aberto" : "aberto",
    observacao: text(src?.["observacao"]),
    data_competencia: text(src?.["data_competencia"]).slice(0, 10) || hojeISO(),
    centro_custo_id: text(src?.["centro_custo_id"]),
    plano_contas_id: text(src?.["plano_contas_id"]),
    codigo_referencia: text(src?.["codigo_referencia"]),
    conta_bancaria_id: text(src?.["conta_bancaria_id"]),
    forma_pagamento: text(src?.["forma_pagamento"]),
    nsu: registro ? text(registro["nsu"]) : "",
    nfe_numero: text(registro?.["nfe_numero"]), nfe_serie: text(registro?.["nfe_serie"]),
    nfe_valor: registro?.["nfe_valor"] != null ? moedaDeNumero(num(registro["nfe_valor"])) : "",
    nfse_numero: text(registro?.["nfse_numero"]), nfse_rps: text(registro?.["nfse_rps"]),
    nfse_valor: registro?.["nfse_valor"] != null ? moedaDeNumero(num(registro["nfse_valor"])) : "",
    ja_pago: false,
    pago_em: registro ? text(registro["pago_em"]).slice(0, 10) : "",
    valor_pago: registro && registro["valor_pago"] != null ? moedaDeNumero(num(registro["valor_pago"])) : "",
    desvincular: false,
  });
  const { data: centros = [] } = useTableRows("centro_custo");
  const { data: planoContas = [] } = useTableRows("plano_contas");
  const { cadastradas: catsItens } = useCategoriasItens();
  const planoOpts = useMemo(() => buildTree(planoContas.filter((c) => c["status"] !== false || text(rowId(c)) === v.plano_contas_id), "plano_contas_pai_id").map((n) => {
    const parts = n.path.split(" > ");
    return { value: text(rowId(n.row)), label: parts[parts.length - 1] ?? n.path, depth: n.depth, keywords: [n.path] };
  }), [planoContas, v.plano_contas_id]);
  /** Ao escolher a categoria, sugere centro de custo e conta gerencial padrão dela (sem apagar o que já foi escolhido). */
  const escolherCategoria = (x: string) => {
    const cat = catsItens.find((c) => c.descricao.trim().toLowerCase() === x.trim().toLowerCase());
    setV((s) => ({ ...s, categoria: x,
      centro_custo_id: s.centro_custo_id || cat?.centro_custo_id || "",
      plano_contas_id: s.plano_contas_id || cat?.plano_contas_id || "" }));
  };
  const { data: contas = [] } = useTableRows("financeiro_contas_bancarias");
  const { data: titulosCartao = [] } = useTableRows("financeiro_titulos");
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
  const [irmasOferta, setIrmasOferta] = useState<Row[]>([]);
  useEffect(() => {
    if (!registro || registro["origem_tipo"] !== "oferta" || !registro["origem_id"]) return;
    let vivo = true;
    void supabase.from("financeiro_titulos").select("*").eq("origem_tipo", "oferta").eq("origem_id", text(registro["origem_id"]))
      .eq("tipo", tipo).eq("empresa_id", text(registro["empresa_id"]))
      .then(({ data }) => { if (vivo) setIrmasOferta(parcelasDaOferta(registro, (data ?? []) as Row[])); });
    return () => { vivo = false; };
  }, [registro, tipo]);
  const serieOferta = irmasOferta.length > 1;
  const qc = useQueryClient();
  const [novoParc, setNovoParc] = useState(false);
  const [novoCentro, setNovoCentro] = useState(false);
  const camposCentro: QuickField[] = useMemo(() => [
    { key: "centro_custo_pai_id", label: "Centro de Custo Pai", type: "select",
      options: centroOpts.map((o) => ({ value: o.value, label: `${"— ".repeat(o.depth)}${o.label}` })) },
    { key: "codigo", label: "Código" },
    { key: "descricao", label: "Descrição" },
    { key: "status", label: "Status", type: "boolean" },
  ], [centroOpts]);
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
  // Na edição, um lançamento avulso manual (aberto ou já pago) pode virar parcelado/recorrente;
  // se já estiver pago, a baixa permanece só na 1ª parcela.
  const podeConverter = !registro || (!temSerie && text(registro["origem_tipo"] || "manual") === "manual"
    && !text(registro["cartao_id"]));
  const cartao = cartoes.find((c) => text(rowId(c)) === v.cartao_id);
  const cartaoReg = registro && text(registro["cartao_id"]) ? cartoes.find((c) => text(rowId(c)) === text(registro["cartao_id"])) : undefined;
  const [parcItem, setParcItem] = useState("1");
  const [inicio, setInicio] = useState("1");
  const [porItem, setPorItem] = useState(!!presetCartao && !registro);
  const [itens, setItens] = useState<{ descricao: string; categoria: string; valor: string; parcelas: string; inicio: string; data: string }[]>([{ descricao: "", categoria: "", valor: "", parcelas: "1", inicio: "1", data: hojeISO() }]);
  const itensModo = cartaoModo && porItem;
  const cartaoOk = !!(cartao && cartao["dia_fechamento"] && cartao["dia_vencimento"]);
  const optsCartao = { dataCompra: v.vencimento, diaFechamento: num(cartao?.["dia_fechamento"]), diaVencimento: num(cartao?.["dia_vencimento"]) };
  // Parcela inicial: permite lançar só o que falta (ex.: começar na 2/10).
  const totParc = Math.max(1, Math.floor(num(v.repetir)) || 1);
  const ini = Math.min(totParc, Math.max(1, Math.floor(num(inicio)) || 1));
  const restam = totParc - ini + 1;
  void restam;
  // Parcelas anteriores à atual (ex.: 1/10 quando começa na 2/10): só em lançamento novo.
  const [incluirAnt, setIncluirAnt] = useState(true);
  const [statusAnt, setStatusAnt] = useState<"pago" | "aberto">("pago");
  const comAnt = incluirAnt;
  const algumMeio = ini > 1 || (cartaoModo && porItem && itens.some((i) => Math.floor(num(i.inicio)) > 1));
  const fC = num(cartao?.["dia_fechamento"]); const vC = num(cartao?.["dia_vencimento"]);
  type Prev = { vencimento: string; valor: number; descricao?: string; categoria?: string; rotulo?: string; grupo?: number; n?: number; total?: number; dataCompra?: string; anterior?: boolean };
  const previa: Prev[] = !podeConverter ? [] : cartaoModo
    ? (!cartaoOk ? [] : itensModo
      ? itens.filter((i) => num(i.valor) > 0).flatMap((i, grupo) => {
          const desc = i.descricao.trim() || v.descricao.trim();
          const dc = i.data || v.vencimento;
          return serieParcelas({ total: num(i.parcelas), inicio: num(i.inicio), valorParcela: num(i.valor), incluirAnteriores: comAnt, vencParcela1: vencParcela1De(vencParcela1Cartao(dc, fC, vC), num(i.inicio)) })
            .map((p) => ({ grupo, n: p.n, total: p.total, dataCompra: dc, vencimento: p.vencimento, valor: p.valor, anterior: p.anterior, categoria: i.categoria,
              descricao: p.total > 1 ? `${desc} (${p.n}/${p.total})` : desc, rotulo: `${desc} ${p.n}/${p.total}` }));
        })
      : serieParcelas({ total: totParc, inicio: ini, valorParcela: num(v.valor), incluirAnteriores: comAnt, vencParcela1: vencParcela1De(vencParcela1Cartao(v.vencimento, fC, vC), ini) }))
    : v.modo === "unico" ? parcelasManuais({ modo: v.modo as ModoLancamento, valor: num(v.valor), quantidade: 1, primeira: v.vencimento })
    : serieParcelas({ total: totParc, inicio: ini, incluirAnteriores: comAnt, vencParcela1: vencParcela1De(v.vencimento, ini),
        ...(v.modo === "parcelado" ? { valorTotal: num(v.valor) } : { valorParcela: num(v.valor) }) });
  const totalItens = round2(itens.reduce((s, i) => {
    const tot = Math.max(1, Math.floor(num(i.parcelas)) || 1);
    const ii = Math.min(tot, Math.max(1, Math.floor(num(i.inicio)) || 1));
    return s + num(i.valor) * (tot - ii + 1);
  }, 0));
  const grupoCartao = cartao ? limiteGrupoCartao(cartoes, titulosCartao, text(rowId(cartao))) : null;
  const usadoCartao = grupoCartao?.usadoGrupo ?? 0;
  const limiteCartao = grupoCartao?.limite ?? 0;
  const dispCartao = grupoCartao?.disponivel ?? 0;
  const papel = tipo === "receber" ? "cliente" : "fornecedor";

  const [novoTotal, setNovoTotal] = useState(() => {
    const m = text(registro?.["descricao"]).match(/\((\d+)\/(\d+)\)\s*$/);
    return m ? m[2]! : "";
  });
  const [serie, setSerie] = useState<Row[]>([]);
  const [posAtual, setPosAtual] = useState("1");
  const [statusAntSerie, setStatusAntSerie] = useState<"pago" | "aberto">("pago");
  useEffect(() => {
    if (!temSerie || !registro) return;
    let vivo = true;
    (async () => {
      let q = supabase.from("financeiro_titulos").select("*").eq("origem_tipo", "manual").eq("tipo", tipo).eq("empresa_id", text(registro["empresa_id"]));
      q = registro["origem_id"] ? q.eq("origem_id", text(registro["origem_id"])) : q.is("origem_id", null);
      const { data } = await q;
      let l = (data ?? []) as Row[];
      if (!registro["origem_id"]) l = parcelasLegadas(registro, l);
      l.sort((a, b) => text(a["vencimento"]).localeCompare(text(b["vencimento"])));
      if (vivo) {
        setSerie(l); if (l.length > 1) setNovoTotal(String(l.length));
        const pn = num(registro["parcela_n"]); const idx = l.findIndex((t) => t["id"] === registro["id"]);
        setPosAtual(String(pn > 0 ? pn : idx + 1));
      }
    })();
    return () => { vivo = false; };
  }, [temSerie, registro, tipo]);
  const previaSerie = useMemo(() => {
    const total = Math.floor(num(novoTotal));
    if (!serie.length || total <= serie.length || total > 120) return [];
    const ult = serie[serie.length - 1]!;
    const [y, m, d] = text(ult["vencimento"]).slice(0, 10).split("-").map(Number);
    return Array.from({ length: total - serie.length }, (_, i) => {
      const dt = new Date(Date.UTC(y!, m! - 1 + i + 1, 1));
      const fim = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
      dt.setUTCDate(Math.min(d!, fim));
      return { vencimento: dt.toISOString().slice(0, 10), valor: num(ult["valor"]) };
    });
  }, [serie, novoTotal]);
  const carregarSerie = async (): Promise<Row[]> => {
    const reg = registro!;
    const serieId = text(reg["origem_id"]);
    if (serieId) {
      const { data, error } = await supabase.from("financeiro_titulos").select("*").eq("origem_tipo", "manual").eq("origem_id", serieId)
        .eq("empresa_id", text(reg["empresa_id"])).eq("tipo", tipo);
      if (error) throw error;
      return (data ?? []) as Row[];
    }
    const { data, error } = await supabase.from("financeiro_titulos").select("*").eq("origem_tipo", "manual").is("origem_id", null)
      .eq("empresa_id", text(reg["empresa_id"])).eq("tipo", tipo);
    if (error) throw error;
    const irmas = parcelasLegadas(reg, (data ?? []) as Row[]);
    const novoId = crypto.randomUUID();
    const { error: e2 } = await supabase.from("financeiro_titulos").update({ origem_id: novoId } as never).in("id", irmas.map((t) => text(t["id"])));
    if (e2) throw e2;
    return irmas.map((t) => ({ ...t, origem_id: novoId }));
  };
  // Divide um valor total entre as parcelas da série (ex.: R$ 2.230,00 em 5x R$ 446,00); a última absorve os centavos.
  const dividirTotal = async () => {
    if (!registro || serie.length < 2) return;
    const resp = await perguntar({ title: "Dividir valor total", description: `Informe o valor TOTAL a ser dividido entre as ${serie.length} parcelas.`, defaultValue: num(registro["valor"]).toFixed(2).replace(".", ","), confirmText: "Dividir" });
    if (resp == null) return;
    const total = round2(Number(String(resp).replace(/\./g, "").replace(",", ".")));
    if (!(total > 0)) return void toast.error("Valor total inválido.");
    const n = serie.length;
    const parte = Math.floor((total / n) * 100) / 100;
    setSalvando(true);
    try {
      for (let i = 0; i < n; i++) {
        const t = serie[i]!;
        const valor = i === n - 1 ? round2(total - parte * (n - 1)) : parte;
        const patch: Record<string, unknown> = { valor };
        if (t["status"] === "pago") patch["valor_pago"] = valor;
        const { error } = await supabase.from("financeiro_titulos").update(patch as never).eq("id", text(rowId(t)));
        if (error) throw error;
      }
      toast.success(`Total de ${formatBRL(total)} dividido em ${n} parcelas.`); onSaved(); onClose();
    } catch (e) { toast.error(erroFinanceiro(e)); } finally { setSalvando(false); }
  };
  const aplicarTamanho = async () => {
    if (!registro) return;
    const total = Math.floor(num(novoTotal));
    if (total < 1 || total > 120) return void toast.error("Informe entre 1 e 120 parcelas.");
    setSalvando(true);
    try {
      const titulos = await carregarSerie();
      const plano = planoTamanhoSerie(titulos, total);
      if (plano.bloqueio) return void toast.error(plano.bloqueio);
      if (!plano.criar.length && !plano.remover.length) return void toast.info(`A série já tem ${total} parcelas.`);
      const msg = plano.criar.length ? `Serão criadas ${plano.criar.length} novas parcelas futuras.` : `Serão removidas ${plano.remover.length} parcelas em aberto do final.`;
      if (!await confirmar({ title: `Alterar série para ${total} parcelas?`, description: `${msg} As demais terão a numeração atualizada.`, confirmText: "Alterar", destructive: plano.remover.length > 0 })) return;
      const modelo = titulos.find((t) => t["id"] === plano.renomear[plano.renomear.length - 1]?.id) ?? titulos[0]!;
      if (plano.remover.length) {
        const { error } = await supabase.from("financeiro_titulos").delete().in("id", plano.remover as never);
        if (error) throw error;
      }
      for (const r of plano.renomear) {
        const { error } = await supabase.from("financeiro_titulos").update({ descricao: r.descricao, parcela_n: r.parcela_n } as never).eq("id", r.id as never);
        if (error) throw error;
      }
      if (plano.criar.length) {
        const copia = ["tipo", "categoria", "parceiro_id", "observacao", "centro_custo_id", "plano_contas_id", "codigo_referencia", "conta_bancaria_id", "forma_pagamento", "empresa_id", "origem_tipo", "origem_id"];
        const lote = plano.criar.map((c) => ({ ...Object.fromEntries(copia.map((k) => [k, modelo[k] ?? null])), ...c, data_competencia: c.vencimento, status: "aberto" }));
        const { error } = await supabase.from("financeiro_titulos").insert(lote as never);
        if (error) throw error;
      }
      toast.success(`Série ajustada para ${total} parcelas.`); onSaved(); onClose();
    } catch (e) { toast.error(erroFinanceiro(e)); } finally { setSalvando(false); }
  };
  const aplicarPosicao = async () => {
    if (!registro) return;
    const total = Math.floor(num(novoTotal)); const pos = Math.floor(num(posAtual));
    setSalvando(true);
    try {
      const titulos = await carregarSerie();
      const plano = planoPosicaoSerie(titulos, registro["id"], pos, total);
      if (plano.bloqueio) return void toast.error(plano.bloqueio);
      const nAnt = plano.criar.filter((c) => c.anterior).length; const nPos = plano.criar.length - nAnt;
      const partes = [nAnt && `${nAnt} parcela(s) anterior(es) como ${statusAntSerie === "pago" ? "pagas" : "em aberto"}`, nPos && `${nPos} parcela(s) futura(s)`, plano.remover.length && `remove ${plano.remover.length} em aberto do final`].filter(Boolean);
      if (!await confirmar({ title: `Esta passa a ser a parcela ${pos} de ${total}?`, description: `${partes.length ? `Serão criadas/ajustadas: ${partes.join("; ")}.` : "Só a numeração será ajustada."}`, confirmText: "Aplicar", destructive: plano.remover.length > 0 })) return;
      if (plano.remover.length) {
        const { error } = await supabase.from("financeiro_titulos").delete().in("id", plano.remover as never);
        if (error) throw error;
      }
      for (const r of plano.renomear) {
        const { error } = await supabase.from("financeiro_titulos").update({ descricao: r.descricao, parcela_n: r.parcela_n } as never).eq("id", r.id as never);
        if (error) throw error;
      }
      if (plano.criar.length) {
        const modelo = titulos[0]!;
        const copia = ["tipo", "categoria", "parceiro_id", "observacao", "centro_custo_id", "plano_contas_id", "codigo_referencia", "conta_bancaria_id", "forma_pagamento", "empresa_id", "origem_tipo", "origem_id"];
        const lote = plano.criar.map(({ anterior, ...c }) => ({ ...Object.fromEntries(copia.map((k) => [k, modelo[k] ?? null])), ...c, data_competencia: c.vencimento,
          ...(anterior && statusAntSerie === "pago" ? { status: "pago", pago_em: c.vencimento, valor_pago: c.valor } : { status: "aberto" }) }));
        const { error } = await supabase.from("financeiro_titulos").insert(lote as never);
        if (error) throw error;
      }
      toast.success(`Série ajustada: esta é a parcela ${pos} de ${total}.`); onSaved(); onClose();
    } catch (e) { toast.error(erroFinanceiro(e)); } finally { setSalvando(false); }
  };

  const rateioRef = useRef<RateioApi | null>(null);
  const salvar = async (alcance?: EscopoRecorrencia) => {
    const valor = itensModo ? totalItens : round2(num(v.valor));
    const rateio = rateioRef.current;
    if (rateio?.temLinhas && round2(rateio.soma) !== valor) return void toast.error(`A soma dos itens (${formatBRL(rateio.soma)}) não bate com o valor da conta (${formatBRL(valor)}). Ajuste os itens ou use "Ajustar valor da conta".`);
    if (!v.descricao.trim()) return void toast.error("Informe a descrição.");
    if (!v.parceiro_id) return void toast.error(`Escolha o ${papel}.`);
    if (valor <= 0) return void toast.error(itensModo ? "Informe o valor de pelo menos um item." : "Informe o valor.");
    if (cartaoModo && !cartao) return void toast.error("Escolha o cartão utilizado.");
    if (cartaoModo && !previa.length) return void toast.error("Informe o dia de fechamento e de vencimento do cartão.");
    if (cartaoModo && limiteCartao > 0 && valor > dispCartao && !await confirmar(`Esta compra (${formatBRL(valor)}) passa do limite disponível do cartão (${formatBRL(dispCartao)}). Lançar mesmo assim?`)) return;
    { const prob = problemaParceiro(parceiros.find((p) => text(rowId(p)) === v.parceiro_id));
      if (prob && !registro && !await confirmar({ title: `Lançar para ${papel} irregular?`, description: `Este ${papel} está com ${prob}. Deseja lançar mesmo assim?`, confirmText: "Lançar mesmo assim", destructive: true })) return; }
    if ((temSerie || serieOferta) && !alcance && !v.desvincular) { setEscopo("atual"); setConfirmarSerie(true); return; }
    if (registro && v.status === "pago" && !v.pago_em) return void toast.error("Informe a data do pagamento.");
    setSalvando(true);
    try {
      const statusBase = v.status === "pago" ? (text(registro?.["status"]) === "pago" ? "pago" : "aberto") : v.status;
      const base = { tipo, descricao: v.descricao.trim(), categoria: v.categoria || (categorias.ativas[0] ?? ""), parceiro_id: v.parceiro_id || null,
        vencimento: v.vencimento, valor, observacao: v.observacao || null, status: statusBase,
        data_competencia: v.data_competencia || null, centro_custo_id: v.centro_custo_id || null, plano_contas_id: v.plano_contas_id || null,
        codigo_referencia: v.codigo_referencia.trim() || null, conta_bancaria_id: v.conta_bancaria_id || null,
        nsu: v.nsu.trim() || null, ...(v.forma_pagamento ? { forma_pagamento: v.forma_pagamento } : {}),
        ...(registro && text(registro["cartao_id"]) && v.data_compra ? { data_compra: v.data_compra } : {}),
        ...camposFiscais(v, registro) };
      // Compra no cartão: mudar a data da compra recalcula em qual fatura ela cai.
      const diasCartao = cartaoReg && cartaoReg["dia_fechamento"] && cartaoReg["dia_vencimento"] ? { f: num(cartaoReg["dia_fechamento"]), v: num(cartaoReg["dia_vencimento"]) } : null;
      if (registro && diasCartao && !temSerie && v.data_compra && v.data_compra !== text(registro["data_compra"]).slice(0, 10)) {
        base.vencimento = vencimentoFatura(v.data_compra, diasCartao.f, diasCartao.v);
      }
      const nItem = Math.floor(num(parcItem)) || 1;
      if (registro && cartaoReg && !temSerie && nItem > 1) {
        if (!diasCartao) throw new Error("Informe o dia de fechamento e vencimento do cartão em Financeiro → Bancos.");
        const ps = parcelasCartao({ valor: round2(valor * nItem), parcelas: nItem, dataCompra: v.data_compra || text(registro["data_compra"]).slice(0, 10) || v.vencimento, diaFechamento: diasCartao.f, diaVencimento: diasCartao.v });
        const serieId = crypto.randomUUID();
        const { error } = await supabase.from("financeiro_titulos").update({ ...base, origem_tipo: "manual", origem_id: serieId, parcela_n: 1,
          descricao: `${base.descricao} (1/${ps.length})`, vencimento: ps[0]!.vencimento, valor: ps[0]!.valor } as never).eq("id", text(rowId(registro)));
        if (error) throw error;
        const resto = ps.slice(1).map((p, i) => ({ ...base, empresa_id: registro["empresa_id"], cartao_id: registro["cartao_id"], forma_pagamento: "Cartão de crédito",
          data_compra: v.data_compra || registro["data_compra"], origem_tipo: "manual", origem_id: serieId, parcela_n: i + 2,
          descricao: `${base.descricao} (${i + 2}/${ps.length})`, vencimento: p.vencimento, valor: p.valor, status: "aberto" }));
        const { error: e2 } = await supabase.from("financeiro_titulos").insert(resto as never);
        if (e2) throw e2;
        toast.success(`Compra dividida em ${ps.length} parcelas no cartão.`); onSaved(); onClose(); return;
      }
      if (registro) {
        if (serieOferta && alcance && !v.desvincular) {
          const alvos = alvosOferta(registro, irmasOferta, alcance, hojeISO());
          for (const t of alvos) {
            const patch = t["id"] === registro["id"] ? base : patchRecorrencia(registro, t, base);
            if (!Object.keys(patch).length) continue;
            const { error } = await supabase.from("financeiro_titulos").update(patch as never).eq("id", text(t["id"]));
            if (error) throw error;
          }
        } else if (temSerie && alcance && !v.desvincular) {
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
        } else if (podeConverter && previa.length > 1) {
          // Converte um lançamento único em série: o atual vira a parcela inicial escolhida; anteriores e posteriores são criadas.
          const n = previa[0]?.total ?? previa.length;
          const iAtual = Math.max(0, previa.findIndex((p) => !p.anterior));
          const cur = previa[iAtual]!;
          const n0 = cur.n ?? 1;
          const serieId = crypto.randomUUID();
          const pago = v.ja_pago ? { status: "pago", pago_em: cur.vencimento, valor_pago: cur.valor } : {};
          const { error } = await supabase.from("financeiro_titulos").update({ ...base, origem_tipo: "manual", origem_id: serieId, parcela_n: n0,
            descricao: `${base.descricao} (${n0}/${n})`, vencimento: cur.vencimento, valor: cur.valor, ...pago } as never).eq("id", text(rowId(registro)));
          if (error) throw error;
          const resto = previa.filter((_, i) => i !== iAtual).map((p, i) => ({ ...base, empresa_id: registro["empresa_id"], origem_tipo: "manual", origem_id: serieId,
            parcela_n: p.n ?? i + 2, descricao: `${base.descricao} (${p.n ?? i + 2}/${n})`, vencimento: p.vencimento, valor: p.valor, data_competencia: p.vencimento,
            ...(p.anterior && statusAnt === "pago" ? { status: "pago", pago_em: p.vencimento, valor_pago: p.valor } : { status: "aberto" }) }));
          const { error: e2 } = await supabase.from("financeiro_titulos").insert(resto as never);
          if (e2) throw e2;
        } else {
          const pago = podeConverter && v.ja_pago ? { status: "pago", pago_em: v.vencimento, valor_pago: valor } : {};
          const solto = temSerie && v.desvincular
            ? { origem_id: null, parcela_n: null, descricao: base.descricao.replace(/\s*\(\d+\/\d+\)\s*$/, "") } : {};
          const { error } = await supabase.from("financeiro_titulos").update({ ...base, ...solto, ...pago } as never).eq("id", text(rowId(registro)));
          if (error) throw error;
        }
        // Situação/baixa sempre aplicada só a este lançamento.
        if (!(podeConverter && v.ja_pago)) {
          // Pagamento parcial (aberto com valor_pago > 0) é preservado ao editar outros campos.
          const parcialAnterior = v.status === "aberto" && registro["status"] !== "pago" && num(registro["valor_pago"]) > 0;
          const baixa = v.status === "pago"
            ? { status: "pago", pago_em: v.pago_em || hojeISO(), valor_pago: round2(num(v.valor_pago)) || valor }
            : parcialAnterior
              ? { status: "aberto" }
              : { status: v.status, pago_em: null, valor_pago: null };
          const { error: eb } = await supabase.from("financeiro_titulos").update(baixa as never).eq("id", text(rowId(registro)));
          if (eb) throw eb;
        }
      } else {
        const n = previa[0]?.total ?? previa.length;
        const emp = isMaster && empresa ? rowId(empresa) : empresaId;
        const extra = cartaoModo ? { cartao_id: v.cartao_id, forma_pagamento: "Cartão de crédito", data_compra: v.vencimento } : {};
        const serieId = n > 1 ? crypto.randomUUID() : null;
        // Item a item: cada item é uma compra própria (série só se tiver mais de 1 parcela).
        const seriesItem = new Map<number, string | null>();
        const lote = previa.map((p, i) => ({
          ...base, ...extra, empresa_id: emp, origem_tipo: "manual",
          ...(p.grupo !== undefined
            ? { origem_id: (seriesItem.has(p.grupo) ? seriesItem.get(p.grupo) : (seriesItem.set(p.grupo, (p.total ?? 1) > 1 ? crypto.randomUUID() : null), seriesItem.get(p.grupo))) ?? null,
                parcela_n: p.n ?? 1, data_compra: p.dataCompra ?? v.vencimento }
            : { origem_id: serieId, parcela_n: p.n ?? i + 1 }),
          descricao: p.descricao ?? (n > 1 ? `${base.descricao} (${p.n ?? i + 1}/${n})` : base.descricao),
          ...(p.categoria ? { categoria: p.categoria } : {}),
          vencimento: p.vencimento, valor: p.valor,
          ...(v.ja_pago && !cartaoModo && i === 0 ? { status: "pago", pago_em: p.vencimento, valor_pago: p.valor } : {}),
          ...(p.anterior ? (statusAnt === "pago" ? { status: "pago", pago_em: p.vencimento, valor_pago: p.valor } : { status: "aberto" }) : {}),
        }));
        const { error } = await supabase.from("financeiro_titulos").insert(lote as never);
        if (error) throw error;
      }
      if (registro && rateio?.temLinhas && rateio.pendente) await rateio.salvar();
      toast.success(previa.length > 1 ? `${previa.length} parcelas salvas.` : "Conta salva."); onSaved(); onClose();
    } catch (e) {
      toast.error(erroFinanceiro(e));
    } finally { setSalvando(false); }
  };

  return (
    <>
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{registro ? "Editar" : "Nova"} conta a {tipo}</SheetTitle>
          <SheetDescription>{registro ? `Origem: ${ORIGEM_LABEL[text(registro["origem_tipo"])] ?? "Manual"}` : "Lançamento manual"}</SheetDescription>
        </SheetHeader>
        <div className="grid flex-1 content-start gap-4 overflow-y-auto p-4 sm:grid-cols-2">
          {temSerie && (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm sm:col-span-2">
              <p>Esta conta faz parte de uma série de parcelas. Ao salvar, você escolhe se as alterações valem também para as demais parcelas.</p>
              {!readOnly && (
                <div className="flex items-center gap-2">
                  <Switch checked={v.desvincular} onCheckedChange={(x) => setV({ ...v, desvincular: x })} />
                  <Label>Desvincular desta série (vira uma conta avulsa, sem alterar as demais)</Label>
                </div>
              )}
              {!readOnly && !v.desvincular && (
                <div className="flex flex-wrap items-end gap-2 border-t border-primary/20 pt-2">
                  <div className="space-y-1"><Label>Quantidade de parcelas/meses da série</Label>
                    <Input type="number" min={1} max={120} className="w-32" value={novoTotal} onChange={(e) => setNovoTotal(e.target.value)} /></div>
                  <Button type="button" variant="outline" disabled={salvando || !num(novoTotal)} onClick={() => void aplicarTamanho()}>Alterar quantidade</Button>
                  <Button type="button" variant="outline" disabled={salvando || serie.length < 2} onClick={() => void dividirTotal()}>Dividir valor total entre as parcelas</Button>
                  <div className="space-y-1"><Label>Esta é a parcela nº</Label>
                    <Input type="number" min={1} max={Math.max(1, num(novoTotal))} className="w-24" value={posAtual} onChange={(e) => setPosAtual(e.target.value)} /></div>
                  <div className="space-y-1"><Label>Anteriores criadas como</Label>
                    <Select value={statusAntSerie} onValueChange={(x) => setStatusAntSerie(x as "pago" | "aberto")}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="aberto">Em aberto</SelectItem><SelectItem value="pago">Pago</SelectItem></SelectContent>
                    </Select></div>
                  <Button type="button" disabled={salvando || !num(novoTotal) || !num(posAtual)} onClick={() => void aplicarPosicao()}>Aplicar {posAtual || "?"} de {novoTotal || "?"}</Button>
                  <p className="w-full text-xs text-muted-foreground">Aumentar cria novas parcelas mensais após a última; reduzir remove só parcelas em aberto do final. Parcelas pagas são preservadas.</p>
                </div>
              )}
              {serie.length > 0 && (() => {
                const total = Math.max(serie.length, Math.floor(num(novoTotal)) || serie.length);
                const quitado = serie.filter((t) => t["status"] === "pago").reduce((s, t) => s + num(t["valor_pago"] ?? t["valor"]), 0);
                const soma = serie.reduce((s, t) => s + num(t["valor"]), 0) + previaSerie.reduce((s, p) => s + p.valor, 0);
                return (
                  <div className="rounded-md border border-primary/20 bg-background">
                    <div className="text-muted-foreground grid grid-cols-4 px-3 pt-2 text-xs font-medium">
                      <span>Parcela</span><span>Vencimento</span><span className="text-right">Valor</span><span className="text-right">Situação</span>
                    </div>
                    <div className="max-h-56 overflow-y-auto px-3">
                      {serie.map((t, i) => {
                        const s = situacaoTitulo(t, hojeISO());
                        const atual = text(rowId(t)) === text(rowId(registro!));
                        return (
                          <div key={text(rowId(t))} className={cn("grid grid-cols-4 items-center py-0.5 tabular-nums", atual && "font-semibold text-primary")}>
                            <span>{i + 1}/{total}{atual ? " • esta" : ""}</span><span>{formatDate(t["vencimento"])}</span>
                            <span className="text-right">{formatBRL(t["valor"])}</span>
                            <span className="text-right"><span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", SITUACAO_META[s].badge)}>{SITUACAO_META[s].label(tipo)}</span></span>
                          </div>
                        );
                      })}
                      {previaSerie.map((p, i) => (
                        <div key={`n${i}`} className="text-muted-foreground grid grid-cols-4 py-0.5 italic tabular-nums">
                          <span>{serie.length + i + 1}/{total}</span><span>{formatDate(p.vencimento)}</span><span className="text-right">{formatBRL(p.valor)}</span><span className="text-right text-xs">nova</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between border-t border-primary/20 px-3 py-2 text-xs font-semibold">
                      <span>Total {formatBRL(soma)}</span><span>Quitado {formatBRL(quitado)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          <div className="space-y-1 sm:col-span-2"><Label>Descrição</Label>
            <Input value={v.descricao} disabled={readOnly} onChange={(e) => setV({ ...v, descricao: e.target.value })} /></div>
          <div className="space-y-1"><Label>{tipo === "receber" ? "Cliente" : "Fornecedor"} *</Label>
            <div className="flex gap-2">
              <SearchSelect value={v.parceiro_id} disabled={readOnly} options={opcoes} placeholder={`Escolha o ${papel}`} searchPlaceholder="Nome ou CPF/CNPJ…"
                emptyText={`Não encontrado. Use o + para cadastrar.`} onChange={(x) => setV({ ...v, parceiro_id: x })} />
              {!readOnly && <Button type="button" variant="outline" size="icon" title={`Cadastrar ${papel}`} aria-label={`Cadastrar ${papel}`} onClick={() => setNovoParc(true)}><Plus className="h-4 w-4" /></Button>}
            </div></div>
          {!readOnly && <ParceiroSituacaoAlerta key={v.parceiro_id} papel={papel} parceiro={parceiros.find((p) => text(rowId(p)) === v.parceiro_id)} />}
          <div className="space-y-1"><Label>Categoria</Label>
            <div className="flex gap-2">
              <Select value={v.categoria} disabled={readOnly} onValueChange={escolherCategoria}>
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
            <div className="flex gap-2">
              <SearchSelect value={v.centro_custo_id} disabled={readOnly} options={centroOpts} placeholder="Escolha o centro de custo" emptyText="Não encontrado. Use o + para cadastrar." onChange={(x) => setV({ ...v, centro_custo_id: x })} />
              {!readOnly && <Button type="button" variant="outline" size="icon" title="Cadastrar centro de custo" aria-label="Cadastrar centro de custo" onClick={() => setNovoCentro(true)}><Plus className="h-4 w-4" /></Button>}
            </div>
            {novoCentro && <QuickCreateDialog open onOpenChange={(o) => !o && setNovoCentro(false)} title="Novo centro de custo" table="centro_custo"
              fields={camposCentro} onCreated={(id) => setV((s) => ({ ...s, centro_custo_id: id }))} />}
          </div>
          <div className="space-y-1 sm:col-span-2"><Label>Plano de contas (conta gerencial)</Label>
            <SearchSelect value={v.plano_contas_id} disabled={readOnly} options={planoOpts} placeholder="Escolha a conta gerencial" emptyText="Não encontrado. Cadastre em Plano de Contas." onChange={(x) => setV({ ...v, plano_contas_id: x })} />
          </div>
          {registro && rowId(registro) && (
            <RateioTitulo tituloId={text(rowId(registro))} empresaId={text(registro["empresa_id"])} valorTitulo={round2(num(v.valor))} readOnly={readOnly} tipoTitulo={tipo} apiRef={rateioRef}
              onAjustarValor={(s) => setV((x) => ({ ...x, valor: moedaDeNumero(s) }))}
              formaPagamento={v.forma_pagamento} contaBancariaId={v.conta_bancaria_id} />
          )}
          <div className="space-y-1"><Label>Forma de pagamento</Label>
            <SearchSelect value={v.forma_pagamento} disabled={readOnly || cartaoModo} options={FORMAS_PAGAMENTO.map((x) => ({ value: x, label: x }))} placeholder="Escolha" onChange={(x) => setV({
              ...v, forma_pagamento: x,
              ...(!registro && tipo === "pagar" && /cart[ãa]o de cr[ée]dito/i.test(x) ? { modo: "cartao" as ModoForm, repetir: v.repetir === "1" ? "1" : v.repetir } : {}),
            })} /></div>
          <div className="space-y-1"><Label>{tipo === "receber" ? "Conta de recebimento" : "Conta de pagamento"}</Label>
            <SearchSelect value={v.conta_bancaria_id} disabled={readOnly} options={contaOpts} placeholder="Escolha a conta" onChange={(x) => setV({ ...v, conta_bancaria_id: x })} /></div>
          {tipo === "receber" && (
            <div className="space-y-1"><Label>NSU / autorização do cartão</Label>
              <Input value={v.nsu} disabled={readOnly} placeholder="Opcional" onChange={(e) => setV({ ...v, nsu: e.target.value })} /></div>
          )}
          {tipo === "receber" && (
            <div className="border-border space-y-3 rounded-lg border p-3 sm:col-span-2">
              <div>
                <p className="text-sm font-semibold">Documentos fiscais</p>
                <p className="text-muted-foreground text-xs">Um único boleto pode ter NF-e (produtos) e NFS-e (serviços) separadas.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1"><Label>NF-e (produtos) nº</Label>
                  <Input value={v.nfe_numero} disabled={readOnly} placeholder="Opcional" onChange={(e) => setV({ ...v, nfe_numero: e.target.value })} /></div>
                <div className="space-y-1"><Label>Série</Label>
                  <Input value={v.nfe_serie} disabled={readOnly} placeholder="Opcional" onChange={(e) => setV({ ...v, nfe_serie: e.target.value })} /></div>
                <div className="space-y-1"><Label>Valor dos produtos (R$)</Label>
                  <Input inputMode="decimal" value={v.nfe_valor} disabled={readOnly} placeholder="0,00" onChange={(e) => setV({ ...v, nfe_valor: mascaraMoeda(e.target.value) })} /></div>
                <div className="space-y-1"><Label>NFS-e (serviços) nº</Label>
                  <Input value={v.nfse_numero} disabled={readOnly} placeholder="Opcional" onChange={(e) => setV({ ...v, nfse_numero: e.target.value })} /></div>
                <div className="space-y-1"><Label>RPS</Label>
                  <Input value={v.nfse_rps} disabled={readOnly} placeholder="Opcional" onChange={(e) => setV({ ...v, nfse_rps: e.target.value })} /></div>
                <div className="space-y-1"><Label>Valor dos serviços (R$)</Label>
                  <Input inputMode="decimal" value={v.nfse_valor} disabled={readOnly} placeholder="0,00" onChange={(e) => setV({ ...v, nfse_valor: mascaraMoeda(e.target.value) })} /></div>
              </div>
              {(v.nfe_valor || v.nfse_valor) && Math.abs(round2(num(v.nfe_valor) + num(v.nfse_valor)) - round2(num(v.valor))) > 0.009 && (
                <p className="text-destructive text-xs">A soma das notas ({moedaDeNumero(round2(num(v.nfe_valor) + num(v.nfse_valor)))}) difere do valor do lançamento ({moedaDeNumero(round2(num(v.valor)))}).</p>
              )}
            </div>
          )}
          {podeConverter && !cartaoModo && (
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch checked={v.ja_pago} onCheckedChange={(x) => setV({ ...v, ja_pago: x })} />
              <Label>{tipo === "receber" ? "Já recebido" : "Já pago"}{v.modo !== "unico" ? " (baixa só a 1ª parcela)" : ""}</Label>
            </div>
          )}
          {podeConverter && (
            <div className="space-y-1 sm:col-span-2"><Label>Repetir lançamento</Label>
              <Select value={v.modo} onValueChange={(x) => setV({ ...v, modo: x as ModoForm, repetir: x === "unico" ? "1" : v.repetir === "1" ? (x === "cartao" ? "3" : "12") : v.repetir })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unico">Único</SelectItem>
                  <SelectItem value="parcelado">Parcelado (divide o valor total)</SelectItem>
                  <SelectItem value="recorrente">Mensal recorrente (mesmo valor todo mês)</SelectItem>
                  {tipo === "pagar" && !registro && <SelectItem value="cartao">Cartão de crédito parcelado (vence na fatura)</SelectItem>}
                </SelectContent>
              </Select></div>
          )}
          {cartaoModo && (
            <div className="space-y-1 sm:col-span-2"><Label>Cartão utilizado *</Label>
              <Select value={v.cartao_id} onValueChange={(x) => setV({ ...v, cartao_id: x })}>
                <SelectTrigger><SelectValue placeholder={cartoes.length ? "Escolha o cartão" : "Cadastre um cartão em Financeiro → Bancos"} /></SelectTrigger>
                <SelectContent>{cartoes.map((c) => <SelectItem key={text(rowId(c))} value={text(rowId(c))}>{nomeCartao(c)}</SelectItem>)}</SelectContent>
              </Select>
              {cartao && !cartaoOk && (
                <p className="text-warning text-xs">Informe o dia de fechamento e de vencimento deste cartão em Financeiro → Bancos.</p>
              )}
              {cartao && limiteCartao > 0 && (
                <p className={cn("text-xs", round2(itensModo ? totalItens : num(v.valor)) > dispCartao ? "text-destructive" : "text-muted-foreground")}>
                  Limite disponível: {formatBRL(dispCartao)} de {formatBRL(limiteCartao)}
                </p>
              )}
            </div>
          )}
          {cartaoModo && (
            <div className="space-y-1 sm:col-span-2"><Label>Como lançar a compra</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={!porItem ? "default" : "outline"} onClick={() => setPorItem(false)}>Valor total</Button>
                <Button type="button" variant={porItem ? "default" : "outline"} onClick={() => setPorItem(true)}>Item a item</Button>
              </div></div>
          )}
          {registro && text(registro["cartao_id"]) && (
            <p className="text-muted-foreground text-sm sm:col-span-2">Cartão: {nomeCartao(cartoes.find((c) => text(rowId(c)) === text(registro["cartao_id"])))}</p>
          )}
          <div className="space-y-1"><Label>{itensModo ? "Data da compra (padrão dos itens)" : cartaoModo ? "Data da compra" : registro || v.modo === "unico" ? "Vencimento" : "1º vencimento"}</Label>
            <Input type="date" value={v.vencimento} disabled={readOnly} onChange={(e) => { const old = v.vencimento; const nv = e.target.value; setV({ ...v, vencimento: nv }); if (itensModo) setItens((l) => l.map((x) => (!x.data || x.data === old ? { ...x, data: nv } : x))); }} /></div>
          {registro && text(registro["cartao_id"]) && (
            <div className="space-y-1"><Label>Data da compra</Label>
              <Input type="date" value={v.data_compra} disabled={readOnly} onChange={(e) => setV({ ...v, data_compra: e.target.value })} />
              {!temSerie && <p className="text-muted-foreground text-xs">Ao mudar a data, o vencimento passa para a fatura correta do cartão.</p>}</div>
          )}
          {registro && text(registro["cartao_id"]) && !temSerie && !readOnly && (
            <div className="space-y-1"><Label>Parcelas no cartão</Label>
              <Input type="number" min={1} max={48} value={parcItem} onChange={(e) => setParcItem(e.target.value)} />
              <p className="text-muted-foreground text-xs">O valor informado é o de cada parcela; mais de 1 repete nas próximas faturas.</p></div>
          )}
          {!itensModo && (
            <div className="space-y-1"><Label>{cartaoModo && podeConverter ? "Valor da parcela (R$)" : v.modo === "parcelado" && podeConverter ? "Valor total (R$)" : v.modo === "recorrente" && podeConverter ? "Valor mensal (R$)" : "Valor (R$)"}</Label>
              <Input inputMode="decimal" value={v.valor} disabled={readOnly} onChange={(e) => setV({ ...v, valor: mascaraMoeda(e.target.value) })} placeholder="0,00" /></div>
          )}
          {podeConverter && v.modo !== "unico" && !itensModo && (<>
            <div className="space-y-1"><Label>{v.modo === "recorrente" ? "Nº total de meses" : "Nº total de parcelas"}</Label>
              <Input type="number" min={1} max={cartaoModo ? 48 : 120} value={v.repetir} onChange={(e) => setV({ ...v, repetir: e.target.value })} /></div>
            <div className="space-y-1"><Label>Começar na parcela</Label>
              <Input type="number" min={1} max={totParc} value={inicio} onChange={(e) => setInicio(e.target.value)} />
              <p className="text-muted-foreground text-xs">Ex.: 2 para lançar de 2/{totParc} em diante .</p></div>
          </>)}
          {podeConverter && algumMeio && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 sm:col-span-2">
              <Switch checked={incluirAnt} onCheckedChange={setIncluirAnt} id="incl-ant" />
              <Label htmlFor="incl-ant" className="flex-1">Incluir histórico das parcelas anteriores</Label>
              {incluirAnt && (
                <Select value={statusAnt} onValueChange={(x) => setStatusAnt(x as "pago" | "aberto")}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="aberto">Em aberto</SelectItem><SelectItem value="pago">Pago</SelectItem></SelectContent>
                </Select>)}
            </div>
          )}
          {itensModo && (
            <div className="space-y-2 rounded-lg border p-3 sm:col-span-2">
              <p className="text-sm font-semibold">Itens da compra</p>
              <div className="text-muted-foreground hidden grid-cols-[1fr_9rem_9rem_7rem_4rem_4rem_2.5rem] gap-2 text-xs font-medium sm:grid">
                <span>Descrição</span><span>Data da compra</span><span>Categoria</span><span>Valor parcela</span><span>Parcela atual</span><span>De (total)</span><span />
              </div>
              {itens.map((it, idx) => {
                const up = (patch: Partial<typeof it>) => setItens((l) => l.map((x, j) => (j === idx ? { ...x, ...patch } : x)));
                return (
                  <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_9rem_9rem_7rem_4rem_4rem_2.5rem]">
                    <Input value={it.descricao} placeholder="Ex.: Monitor 27''" onChange={(e) => up({ descricao: e.target.value })} />
                    <Input type="date" aria-label="Data da compra" value={it.data || v.vencimento} onChange={(e) => up({ data: e.target.value })} />
                    <Select value={it.categoria} onValueChange={(x) => up({ categoria: x })}>
                      <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                      <SelectContent>{categorias.ativas.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input inputMode="decimal" aria-label="Valor da parcela" value={it.valor} placeholder="0,00" onChange={(e) => up({ valor: mascaraMoeda(e.target.value) })} />
                    <Input type="number" aria-label="Parcela atual" min={1} max={num(it.parcelas) || 1} value={it.inicio} onChange={(e) => up({ inicio: e.target.value })} />
                    <Input type="number" aria-label="Total de parcelas" min={1} max={48} value={it.parcelas} onChange={(e) => up({ parcelas: e.target.value })} />
                    <Button type="button" variant="ghost" size="icon" aria-label="Remover item" disabled={itens.length === 1}
                      onClick={() => setItens((l) => l.filter((_, j) => j !== idx))}><Trash2 className="text-destructive h-4 w-4" /></Button>
                  </div>
                );
              })}
              <p className="text-muted-foreground text-xs">Informe o valor de cada parcela, como aparece na fatura. Para uma compra que já está na 2/10, coloque 2 em "Parcela atual" e 10 em "De".</p>
              <div className="flex items-center justify-between">
                <Button type="button" variant="outline" size="sm" onClick={() => setItens((l) => [...l, { descricao: "", categoria: v.categoria, valor: "", parcelas: "1", inicio: "1", data: l[l.length - 1]?.data || v.vencimento }])}>
                  <Plus className="mr-1 h-4 w-4" />Adicionar item</Button>
                <p className="text-sm">Valor final no cartão: <span className="text-base font-bold tabular-nums">{formatBRL(totalItens)}</span></p>
              </div>
            </div>
          )}
          {podeConverter && (previa.length > 1 || (cartaoModo && previa.length > 0)) && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 text-sm sm:col-span-2">
              <div className="border-b border-primary/20 px-3 py-2">
                <p className="font-semibold">Demonstrativo das {previa.length} parcelas que serão geradas</p>
                <p className="text-muted-foreground text-xs">Conferência apenas. Ao salvar, o sistema cria {previa.length} lançamentos separados.</p>
              </div>
              <div className="text-muted-foreground grid grid-cols-3 px-3 pt-2 text-xs font-medium">
                <span>Parcela</span><span>Vencimento</span><span className="text-right">Valor</span>
              </div>
              <div className="max-h-40 overflow-y-auto px-3">
                {previa.map((p, i) => (
                  <div key={i} className="grid grid-cols-3 py-0.5 tabular-nums">
                    <span className="truncate">{p.rotulo ?? (p.n ? `${p.n}/${p.total}` : `${i + 1}/${previa.length}`)}{p.anterior ? ` • ${statusAnt === "pago" ? "pago" : "em aberto"}` : ""}</span><span>{formatDate(p.vencimento)}</span><span className="text-right">{formatBRL(p.valor)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t border-primary/20 px-3 py-2 font-semibold">
                <span>Total</span><span>{formatBRL(previa.reduce((s, p) => s + p.valor, 0))}</span>
              </div>
            </div>
          )}
          {registro && (
            <div className="space-y-1"><Label>Situação</Label>
              <Select value={v.status} disabled={readOnly} onValueChange={(x) => setV({ ...v, status: x,
                ...(x === "pago" && !v.valor_pago ? { valor_pago: v.valor, pago_em: v.pago_em || hojeISO() } : {}) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberto">Em aberto</SelectItem>
                  <SelectItem value="pago">{tipo === "receber" ? "Recebido" : "Pago"}</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select></div>
          )}
          {registro && v.status === "pago" && (
            <>
              <div className="space-y-1"><Label>{tipo === "receber" ? "Data do recebimento" : "Data do pagamento"}</Label>
                <Input type="date" value={v.pago_em} disabled={readOnly} onChange={(e) => setV({ ...v, pago_em: e.target.value })} /></div>
              <div className="space-y-1"><Label>{tipo === "receber" ? "Valor recebido (R$)" : "Valor pago (R$)"}</Label>
                <Input inputMode="decimal" value={v.valor_pago} disabled={readOnly} placeholder="0,00" onChange={(e) => setV({ ...v, valor_pago: mascaraMoeda(e.target.value) })} /></div>
            </>
          )}
          <div className="space-y-1 sm:col-span-2"><Label>Observação</Label>
            <Textarea value={v.observacao} disabled={readOnly} onChange={(e) => setV({ ...v, observacao: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          {onDelete && <Button variant="destructive" className="mr-auto" disabled={salvando} onClick={onDelete}><Trash2 className="mr-1 h-4 w-4" />Excluir</Button>}
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {!readOnly && <Button disabled={salvando} onClick={() => void salvar()}>{salvando ? "Salvando…" : "Salvar"}</Button>}
        </div>
        <ParceiroSheet open={novoParc} onOpenChange={setNovoParc} record={null} parceiros={parceiros} readOnly={false} saving={salvandoParc} onSave={(vals) => void criarParceiro(vals)} />
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
  const [v, setV] = useState({ data: hojeISO(), juros: "", desconto: "", forma: FORMAS_PAGAMENTO[0] ?? "Pix", comprovante: "", pagoAgora: "" });
  const [enviando, setEnviando] = useState(false);
  const jaPago = num(titulo["valor_pago"]);
  const total = valorBaixa(saldoTitulo(titulo), num(v.juros), num(v.desconto));
  const pagoAgora = v.pagoAgora ? round2(num(v.pagoAgora)) : total;
  const parcial = pagoAgora > 0 && pagoAgora < total - 0.004;

  const anexar = async (file?: File) => {
    if (!file) return;
    setEnviando(true);
    try { setV((s) => ({ ...s, comprovante: "" })); const url = await uploadFoto(file); setV((s) => ({ ...s, comprovante: url })); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falha no envio."); }
    finally { setEnviando(false); }
  };
  const { data: contasBanc = [] } = useTableRows("financeiro_contas_bancarias");
  const { data: todosTitulos = [] } = useTableRows("financeiro_titulos");
  const conta = useMemo(() => {
    if (tipo !== "receber") return null;
    const id = text(titulo["conta_bancaria_id"]);
    return contasBanc.find((c) => text(rowId(c)) === id) ?? contasBanc.find((c) => c["padrao"]) ?? null;
  }, [tipo, titulo, contasBanc]);
  const tarifaInfo = useMemo(() => {
    const mod = modalidadeTarifa(v.forma);
    if (!conta || !mod) return calcularTarifa(null, v.forma, 0);
    const mes = v.data.slice(0, 7); const cid = text(rowId(conta));
    const usadas = todosTitulos.filter((t) => t["tipo"] === "receber" && t["status"] === "pago" && text(t["pago_em"]).slice(0, 7) === mes
      && modalidadeTarifa(text(t["forma_pagamento"])) === mod && text(t["conta_bancaria_id"] || "") === cid && text(rowId(t)) !== text(rowId(titulo))).length;
    return calcularTarifa(conta as never, v.forma, usadas);
  }, [conta, v.forma, v.data, todosTitulos, titulo]);
  const confirmar = async () => {
    if (pagoAgora <= 0) return void toast.error("Informe o valor pago.");
    if (pagoAgora > total + 0.004) return void toast.error(`O valor passa do saldo (${formatBRL(total)}).`);
    if (parcial) {
      const { error } = await supabase.from("financeiro_titulos").update({
        pago_em: v.data, valor_pago: round2(jaPago + pagoAgora), forma_pagamento: v.forma, comprovante: v.comprovante || titulo["comprovante"] || null, agendado_para: null,
      } as never).eq("id", text(rowId(titulo)));
      if (error) return void toast.error(erroFinanceiro(error));
      toast.success(`Pagamento parcial de ${formatBRL(pagoAgora)} registrado. Saldo: ${formatBRL(round2(total - pagoAgora))}.`);
      onSaved(); onClose(); return;
    }
    const tarifa = tarifaInfo.tarifa;
    const { error } = await supabase.from("financeiro_titulos").update({
      status: "pago", pago_em: v.data, valor_pago: round2(jaPago + total), juros: round2(num(v.juros)), desconto: round2(num(v.desconto)),
      forma_pagamento: v.forma, comprovante: v.comprovante || titulo["comprovante"] || null,
      ...(tipo === "receber" ? { tarifa_bancaria: tarifa, valor_liquido: round2(total - tarifa), conta_bancaria_id: conta ? text(rowId(conta)) : titulo["conta_bancaria_id"] ?? null } : {}),
    } as never).eq("id", text(rowId(titulo)));
    if (error) return void toast.error(erroFinanceiro(error));
    if (tipo === "receber" && conta && tarifa > 0 && conta["gerar_despesa_tarifa"] !== false) {
      const { error: e2 } = await supabase.from("financeiro_titulos").insert({
        empresa_id: titulo["empresa_id"], tipo: "pagar", categoria: "Tarifas Bancárias",
        descricao: `Tarifa ${v.forma} — ${text(titulo["descricao"])} (${text(conta["descricao"])})`,
        vencimento: v.data, valor: tarifa, status: "pago", pago_em: v.data, valor_pago: tarifa,
        forma_pagamento: "Débito em conta", conta_bancaria_id: text(rowId(conta)),
      } as never);
      if (e2) toast.error(`Recebimento salvo, mas a tarifa não foi lançada: ${erroFinanceiro(e2)}`);
    }
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
          <div className="space-y-1"><Label>Juros / multa (R$)</Label><Input inputMode="decimal" value={v.juros} onChange={(e) => setV({ ...v, juros: mascaraMoeda(e.target.value) })} placeholder="0,00" /></div>
          <div className="space-y-1"><Label>Desconto (R$)</Label><Input inputMode="decimal" value={v.desconto} onChange={(e) => setV({ ...v, desconto: mascaraMoeda(e.target.value) })} placeholder="0,00" /></div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="flex items-center gap-1">Comprovante (foto) <UploadInfo perfil="laudo" /></Label>
            <Input type="file" accept="image/*" disabled={enviando} onChange={(e) => anexar(e.target.files?.[0])} />
            {v.comprovante && <img src={v.comprovante} alt="Comprovante" className="mt-2 h-20 rounded border object-cover" />}
          </div>
        </div>
        <div className="space-y-1"><Label>Valor pago agora (R$)</Label>
          <Input inputMode="decimal" value={v.pagoAgora} placeholder={moedaDeNumero(total)} onChange={(e) => setV({ ...v, pagoAgora: mascaraMoeda(e.target.value) })} />
          <p className="text-muted-foreground text-xs">Deixe em branco para quitar. Valor menor registra pagamento parcial e mantém o saldo em aberto.</p></div>
        {jaPago > 0 && <p className="text-muted-foreground text-sm">Já pago antes: {formatBRL(jaPago)}</p>}
        <p className="text-sm">{parcial ? <>Pagamento parcial: <strong>{formatBRL(pagoAgora)}</strong> • saldo restante <strong>{formatBRL(round2(total - pagoAgora))}</strong></> : <>Valor da baixa: <strong>{formatBRL(total)}</strong></>}</p>
        {tipo === "receber" && conta && modalidadeTarifa(v.forma) && (
          <p className="text-muted-foreground text-sm">
            Tarifa {text(conta["descricao"])} ({tarifaInfo.sequencia}ª {v.forma.toLowerCase()} do mês):{" "}
            <strong>{tarifaInfo.isento ? "Isento pelo pacote" : formatBRL(tarifaInfo.tarifa)}</strong> • Líquido: <strong>{formatBRL(total - tarifaInfo.tarifa)}</strong>
          </p>
        )}
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
  const { empresa } = useAuth();
  const empresaIdCaixa = empresa ? text(rowId(empresa)) : "";
  const { data: contasCaixa = [] } = useTableRows("financeiro_contas_bancarias", !!empresaIdCaixa);
  const somaBancos = somarSaldos(contasDaEmpresa(contasCaixa, empresaIdCaixa));
  const preenchido = useRef(false);
  useEffect(() => {
    if (preenchido.current || somaBancos.total === null) return;
    preenchido.current = true;
    setSaldoInicial((s) => s || moedaDeNumero(somaBancos.total ?? 0));
  }, [somaBancos.total]);
  const [per, setPer] = useState<Periodo>(() => periodoPreset("proximos12m"));
  const [modo, setModo] = useState<ModoCaixa>("ambos");
  const periodo = useMemo(() => {
    if (per.preset !== "todo") return { de: per.de, ate: per.ate };
    const datas = titulos.flatMap((t) => [text(t["vencimento"]).slice(0, 10), text(t["pago_em"]).slice(0, 10)]).filter(Boolean).sort();
    return { de: datas[0] ?? "", ate: datas.at(-1) ?? "" };
  }, [per, titulos]);
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
        <PeriodoNavegavel label="Período" value={per} onChange={setPer} />
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
          <div className="flex items-center gap-2">
            <Input className="h-9 w-36" inputMode="decimal" value={saldoInicial} onChange={(e) => setSaldoInicial(mascaraMoeda(e.target.value))} placeholder="0,00" />
            {somaBancos.total !== null && <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" title={`Bancos: ${formatBRL(somaBancos.total)}${somaBancos.pendentes ? ` • ${somaBancos.pendentes} conta(s) sem consulta` : ""}`} onClick={() => setSaldoInicial(moedaDeNumero(somaBancos.total ?? 0))}>Puxar bancos</Button>}
          </div>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">Realizado = baixas pela data do pagamento. Previsto = contas em aberto pelo vencimento.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="bg-card rounded-lg border p-3"><p className="text-muted-foreground text-xs">Entradas</p><p className="text-success text-lg font-semibold tabular-nums">{formatBRL(tot.e)}</p></div>
        <div className="bg-card rounded-lg border p-3"><p className="text-muted-foreground text-xs">Saídas</p><p className="text-destructive text-lg font-semibold tabular-nums">{formatBRL(tot.s)}</p></div>
        <div className="bg-card rounded-lg border p-3"><p className="text-muted-foreground text-xs">Saldo final</p><p className={cn("text-lg font-semibold tabular-nums", (linhas.at(-1)?.acumulado ?? 0) < 0 && "text-destructive")}>{formatBRL(linhas.at(-1)?.acumulado ?? 0)}</p></div>
      </div>
      {linhas.length > 0 && <VereditoFluxo contexto={() => JSON.stringify({ periodo, modo, saldoInicial: num(saldoInicial), totalEntradas: tot.e, totalSaidas: tot.s, meses: linhas.map((l) => ({ mes: l.mes, entradas: l.entradas, saidas: l.saidas, saldoAcumulado: l.acumulado })) })} />}
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

function NovaCompraCartao({ tipo, fatura, cartoes, parceiros, categorias, onClose, onSaved }: {
  tipo: TipoTitulo; fatura: Row; cartoes: Row[]; parceiros: Row[]; categorias: string[]; onClose: () => void; onSaved: () => void;
}) {
  const itens = (fatura["__itens"] as Row[]) ?? [];
  const ref = itens[0] ?? {};
  const cartao = cartoes.find((c) => text(rowId(c)) === text(fatura["cartao_id"]));
  const [v, setV] = useState({ data: hojeISO(), descricao: "", parceiro_id: text(ref["parceiro_id"]), categoria: "", valor: "", parcelas: "1", inicio: "1" });
  const [salvando, setSalvando] = useState(false);
  const opts = parceiros.filter((p) => p["is_fornecedor"] === true || text(rowId(p)) === v.parceiro_id)
    .map((p) => ({ value: text(rowId(p)), label: text(p["nome_fantasia"] || p["razao_social"]) || "—", keywords: [text(p["documento"])] }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const fech = num(cartao?.["dia_fechamento"]); const venc = num(cartao?.["dia_vencimento"]);
  const totP = Math.max(1, Math.floor(num(v.parcelas)) || 1);
  const iniP = Math.min(totP, Math.max(1, Math.floor(num(v.inicio)) || 1));
  const restP = totP - iniP + 1;
  void restP;
  const [incluirAnt, setIncluirAnt] = useState(true);
  const [statusAnt, setStatusAnt] = useState<"pago" | "aberto">("pago");
  const parcelas = fech && venc && num(v.valor) > 0 ? serieParcelas({ total: totP, inicio: iniP, valorParcela: num(v.valor), incluirAnteriores: incluirAnt, vencParcela1: vencParcela1De(vencParcela1Cartao(v.data, fech, venc), iniP) }) : [];
  const atual = parcelas.find((p) => !p.anterior);
  const salvar = async () => {
    if (!v.descricao.trim()) return void toast.error("Informe a descrição.");
    if (!v.parceiro_id) return void toast.error("Escolha o fornecedor.");
    if (!parcelas.length) return void toast.error(fech ? "Informe o valor." : "Cadastre fechamento e vencimento do cartão.");
    setSalvando(true);
    const n = totP; const serie = n > 1 ? crypto.randomUUID() : null;
    const i_ = 0;
    const lote = parcelas.map((p) => ({
      tipo, empresa_id: ref["empresa_id"], origem_tipo: "manual", origem_id: serie, parcela_n: p.n,
      descricao: n > 1 ? `${v.descricao.trim()} (${p.n}/${n})` : v.descricao.trim(),
      parceiro_id: v.parceiro_id, categoria: v.categoria || null, centro_custo_id: ref["centro_custo_id"] ?? null,
      conta_bancaria_id: ref["conta_bancaria_id"] ?? null, cartao_id: fatura["cartao_id"], forma_pagamento: "Cartão de crédito",
      data_compra: v.data, data_competencia: v.data, vencimento: p.vencimento, valor: p.valor,
      ...(p.anterior && statusAnt === "pago" ? { status: "pago", pago_em: p.vencimento, valor_pago: p.valor } : { status: "aberto" }),
    }));
    void i_;
    const { error } = await supabase.from("financeiro_titulos").insert(lote as never);
    setSalvando(false);
    if (error) return void toast.error(erroFinanceiro(error));
    const fora = (atual ?? parcelas[0]!).vencimento !== text(fatura["vencimento"]).slice(0, 10);
    toast.success(fora ? `Compra salva na fatura de ${formatDate((atual ?? parcelas[0]!).vencimento)} (pela data da compra).` : "Compra adicionada à fatura.");
    onSaved(); onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>Adicionar compra — {text(fatura["descricao"])}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Data da compra</Label><Input type="date" value={v.data} onChange={(e) => setV({ ...v, data: e.target.value })} /></div>
          <div className="space-y-1"><Label>Valor da parcela (R$)</Label><Input inputMode="decimal" placeholder="0,00" value={v.valor} onChange={(e) => setV({ ...v, valor: mascaraMoeda(e.target.value) })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Descrição</Label><Input value={v.descricao} onChange={(e) => setV({ ...v, descricao: e.target.value })} /></div>
          <div className="space-y-1"><Label>Fornecedor *</Label>
            <SearchSelect value={v.parceiro_id} options={opts} placeholder="Escolha o fornecedor" searchPlaceholder="Nome ou CNPJ…" emptyText="Não encontrado." onChange={(x) => setV({ ...v, parceiro_id: x })} /></div>
          <div className="space-y-1"><Label>Categoria</Label>
            <Select value={v.categoria} onValueChange={(x) => setV({ ...v, categoria: x })}>
              <SelectTrigger><SelectValue placeholder="Escolha a categoria" /></SelectTrigger>
              <SelectContent>{[...categorias].sort((a, b) => a.localeCompare(b)).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1"><div className="grid grid-cols-2 gap-2"><div className="space-y-1"><Label>Parcela atual</Label><Input type="number" min={1} max={totP} value={v.inicio} onChange={(e) => setV({ ...v, inicio: e.target.value })} /></div><div className="space-y-1"><Label>De (total)</Label><Input type="number" min={1} max={48} value={v.parcelas} onChange={(e) => setV({ ...v, parcelas: e.target.value })} /></div></div></div>
          {atual && <p className="text-muted-foreground self-end text-xs sm:col-span-1">Parcela {iniP}/{totP} na fatura de {formatDate(atual.vencimento)} • {formatBRL(atual.valor)} cada</p>}
          {iniP > 1 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 sm:col-span-2">
              <Switch checked={incluirAnt} onCheckedChange={setIncluirAnt} id="nc-ant" />
              <Label htmlFor="nc-ant" className="flex-1">Incluir histórico das parcelas anteriores (1 a {iniP - 1})</Label>
              {incluirAnt && (
                <Select value={statusAnt} onValueChange={(x) => setStatusAnt(x as "pago" | "aberto")}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="aberto">Em aberto</SelectItem><SelectItem value="pago">Pago</SelectItem></SelectContent>
                </Select>)}
            </div>
          )}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={salvando} onClick={() => void salvar()}>Salvar compra</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
