import { PeriodoNavegavel } from "@/components/financeiro/PeriodoNavegavel";
import { buscarIpca12m } from "@/lib/indices.functions";
import { periodoPreset, type Periodo } from "@/lib/periodo-vencimento";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, ChevronDown, ChevronRight, Copy, CreditCard, TrendingUp, Paperclip, Plus, QrCode, Receipt, Trash2, Undo2 } from "lucide-react";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ReciboDialog } from "@/components/financeiro/ReciboDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ParceiroSheet } from "@/components/parceiros/ParceiroSheet";
import { buildTree } from "@/lib/hierarchy";
import { formatCpfCnpj } from "@/lib/input-masks";
import { ContasBancarias } from "@/components/financeiro/ContasBancarias";
import { CartoesCredito } from "@/components/financeiro/CartoesCredito";
import { ControllerPainel } from "@/components/financeiro/ControllerPainel";
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
import { useAuth } from "@/hooks/useAuth";
import { useAudit } from "@/lib/audit";
import { rowId, text, useTableRows } from "@/lib/crud";
import { mascaraMoeda, matchesAny, moedaDeNumero } from "@/lib/input-masks";
import { calcularTarifa, modalidadeTarifa } from "@/lib/financeiro-tarifas";
import { formatBRL, formatDate, num, round2 } from "@/lib/orcamentos";
import { uploadFoto } from "@/lib/laudos";
import { erroFinanceiro } from "@/lib/financeiro-db";
import { alvosRecorrencia, parcelasLegadas, patchRecorrencia, planoTamanhoSerie, serieLegada, type EscopoRecorrencia } from "@/lib/financeiro-recorrencia";
import {
  fluxoPeriodo,
  periodoVisao,
  type ModoCaixa,
  type VisaoCaixa,
  CATEGORIAS_FINANCEIRO,
  FORMAS_PAGAMENTO,
  hojeISO,
  resumoTitulos,
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
  parcelasCartao, parcelasItensCartao, limiteUsadoCartao, limiteDisponivelCartao,
  type ModoLancamento,
  type Situacao,
  type TipoTitulo,
} from "@/lib/financeiro";
import type { Row } from "@/lib/row";
import { ParceiroSituacaoAlerta, problemaParceiro } from "@/components/financeiro/ParceiroSituacaoAlerta";
import { cn } from "@/lib/utils";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { confirmar } from "@/components/layout/DialogoGlobal";

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
        <TabsTrigger value="regua">Cobrança automática</TabsTrigger>
        <TabsTrigger value="bancos">Contas Bancárias</TabsTrigger>
      </TabsList>
      <TabsContent value="receber"><Titulos tipo="receber" todos={titulos} loading={isLoading} perms={perms} /></TabsContent>
      <TabsContent value="pagar"><Titulos tipo="pagar" todos={titulos} loading={isLoading} perms={perms} /></TabsContent>
      <TabsContent value="caixa"><Caixa titulos={titulos} /></TabsContent>
      <TabsContent value="controller"><ControllerPainel titulos={titulos} /></TabsContent>
      <TabsContent value="regua"><ReguaCobranca canEdit={perms.canUpdate || perms.canCreate} /></TabsContent>
      <TabsContent value="bancos" className="space-y-8"><ContasBancarias perms={perms} /><CartoesCredito perms={perms} /></TabsContent>
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
  const [f, setF] = useState({ busca: "", situacao: "todos", categoria: "todos", cartao: "todos", per: periodoPreset("mes") });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmarLote, setConfirmarLote] = useState(false);
  const periodoF = f.per;
  const [editar, setEditar] = useState<Row | null | undefined>(undefined);
  const [novoNoCartao, setNovoNoCartao] = useState<string>("");
  const [baixar, setBaixar] = useState<Row | null>(null);
  const [cobrar, setCobrar] = useState<Row | null>(null);
  const hoje = hojeISO();

  const doTipo = useMemo(() => todos.filter((t) => t["tipo"] === tipo), [todos, tipo]);
  // Posição real na série (n/total) pelo vínculo origem_id, independente do texto da descrição.
  const posSerie = useMemo(() => {
    const grupos = new Map<string, Row[]>();
    for (const t of doTipo) {
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
  }, [doTipo]);
  const rows = useMemo(
    () =>
      doTipo
        .filter((t) => {
          const v = text(t["vencimento"]).slice(0, 10);
          return (
            matchesAny([t["descricao"], nomeParc(t["parceiro_id"]), t["categoria"], moedaDeNumero(num(t["valor"])), num(t["valor"]).toFixed(2)], f.busca) &&
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
  // Visão geral de Contas a Pagar: compras no cartão aparecem agrupadas como uma fatura por cartão/vencimento.
  const [fatura, setFatura] = useState<Row | null>(null);
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const exibidos = useMemo(() => {
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
    }).flatMap((r) => (r["__fatura"] && abertas.has(text(r["id"])) ? [r, ...(r["__itens"] as Row[]).map((t) => ({ ...t, __filho: true, __pai: r }))] : [r]));
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
  const excluirItemFatura = async (t: Row) => {
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
  const [excluirSerie, setExcluirSerie] = useState<Row | null>(null);
  const ehSerie = (t: Row) => t["origem_tipo"] === "manual" && (!!t["origem_id"] || !!serieLegada(t));
  const excluir = async (t: Row) => {
    if (ehSerie(t)) return void setExcluirSerie(t);
    const { error } = await supabase.from("financeiro_titulos").delete().eq("id", text(rowId(t)));
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success("Título excluído."); invalidar();
  };
  const excluirAlcance = async (alcance: "atual" | "seguintes" | "todas") => {
    const t = excluirSerie; if (!t) return;
    setExcluirSerie(null);
    let ids = [text(rowId(t))];
    if (alcance !== "atual") {
      let q = supabase.from("financeiro_titulos").select("*").eq("origem_tipo", "manual").eq("tipo", tipo).eq("empresa_id", text(t["empresa_id"]));
      q = t["origem_id"] ? q.eq("origem_id", text(t["origem_id"])) : q.is("origem_id", null);
      const { data, error } = await q;
      if (error) return void toast.error(erroFinanceiro(error));
      let irmas = (data ?? []) as Row[];
      if (!t["origem_id"]) irmas = parcelasLegadas(t, irmas);
      if (alcance === "seguintes") irmas = irmas.filter((x) => text(x["vencimento"]) >= text(t["vencimento"]) && x["status"] !== "pago");
      ids = [...new Set([text(rowId(t)), ...irmas.map((x) => text(rowId(x)))])];
    }
    const { error } = await supabase.from("financeiro_titulos").delete().in("id", ids);
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success(`${ids.length} parcela(s) excluída(s).`); invalidar();
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
  const cards: Array<{ label: string; valor: number; sit: string; cls: string }> = [
    { label: "Total do período", valor: resumo.total, sit: "todos", cls: "border-l-muted-foreground" },
    { label: "A vencer", valor: resumo.aVencer, sit: "aberto", cls: "border-l-primary" },
    { label: "Vencidos", valor: resumo.vencidos, sit: "atrasado", cls: "border-l-destructive" },
    { label: `${pagoLabel} no mês`, valor: resumo.pagoMes, sit: "pago", cls: "border-l-success" },
    { label: "Total em aberto", valor: resumo.emAberto, sit: "em_aberto", cls: "border-l-warning" },
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
              {m && <span className="bg-primary/10 text-primary shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">{m[2]}</span>}
            </div>
          );
        })()}
        {!!t["__fatura"] && (
          <button type="button" className="text-primary mb-1 flex items-center gap-1 text-xs font-medium" onClick={(e) => { e.stopPropagation(); setAbertas((s) => { const n = new Set(s); const k = text(t["id"]); if (n.has(k)) n.delete(k); else n.add(k); return n; }); }}>
            {abertas.has(text(t["id"])) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}<CreditCard className="h-3.5 w-3.5" /> {abertas.has(text(t["id"])) ? "Ocultar itens" : "Mostrar itens"}
          </button>
        )}
        <p className="text-muted-foreground text-xs">{t["__fatura"] ? `Cartão de crédito • ${(t["__itens"] as Row[]).length} item(ns) — clique para ver` : <>{ORIGEM_LABEL[text(t["origem_tipo"])] ?? "Manual"}{t["categoria"] ? ` • ${text(t["categoria"])}` : ""}</>}</p>
      </div>
    ) },
    { key: "parc", header: tipo === "receber" ? "Cliente" : "Fornecedor", fields: [], render: (t) => t["__fatura"] ? ([...new Set((t["__itens"] as Row[]).map((x) => nomeParc(x["parceiro_id"])).filter(Boolean))].join(", ") || "—") : nomeParc(t["parceiro_id"]) || "—" },
    { key: "valor", header: "Valor", fields: ["valor"], render: (t) => <span className="font-semibold tabular-nums">{formatBRL(t["valor"])}</span> },
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

  const rowMenu = (t: Row) => {
    if (t["__fatura"]) return (
      <>
        <DropdownMenuItem onClick={() => setFatura(t)}><CreditCard className="h-4 w-4" /> Editar fatura e itens</DropdownMenuItem>
        {perms.canUpdate && t["status"] !== "pago" && <DropdownMenuItem onClick={() => void baixarItensFatura(t["__itens"] as Row[])}><CheckCircle2 className="text-success h-4 w-4" /> Baixar fatura (total)</DropdownMenuItem>}
        {perms.canUpdate && t["status"] !== "pago" && <DropdownMenuItem onClick={() => setFatura(t)}><CheckCircle2 className="h-4 w-4" /> Pagamento parcial / mínimo</DropdownMenuItem>}
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
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <button key={c.label} type="button" onClick={() => setF((s) => ({ ...s, situacao: c.sit === "em_aberto" || s.situacao === c.sit ? "todos" : c.sit }))}
            className={cn("bg-card rounded-lg border border-l-4 p-3 text-left transition hover:shadow-sm", c.cls, f.situacao === c.sit && c.sit !== "todos" && "ring-primary ring-2")}>
            <p className="text-muted-foreground text-xs">{c.label}</p>
            <p className="text-lg font-bold tabular-nums">{formatBRL(c.valor)}</p>
          </button>
        ))}
      </div>

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
              {perms.canDelete && <Button variant="destructive" size="sm" onClick={() => setConfirmarLote(true)}><Trash2 className="mr-1 h-4 w-4" />Excluir selecionados</Button>}
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
                        <td className="p-2">{text(t["descricao"]).replace(/\s*\(\d+\/\d+\)\s*$/, "")}{pos && <span className="bg-primary/10 text-primary ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold">{pos}</span>}
                          {nomeParc(t["parceiro_id"]) && <p className="text-muted-foreground text-xs">{nomeParc(t["parceiro_id"])}</p>}</td>
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
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setFatura(null)}>Fechar</Button>
                  {perms.canCreate && <Button variant="outline" onClick={() => { const c = text(fatura["cartao_id"]); setFatura(null); setNovoNoCartao(c); setEditar(null); }}><Plus className="mr-1 h-4 w-4" />Adicionar itens</Button>}
                  {perms.canUpdate && fatura["status"] !== "pago" && <Button onClick={() => void baixarItensFatura(itens)}><CheckCircle2 className="mr-1 h-4 w-4" />Baixar fatura (total)</Button>}
                </div>
              </div>
            </>);
          })()}
        </DialogContent>
      </Dialog>

      <DataTable
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
        onDelete={perms.canDelete ? (r) => (r["__fatura"] ? void toast.error("Para excluir, abra a fatura e exclua os itens.") : excluir(r)) : undefined}
        filters={
          <>
            <FilterInput label="Busca" value={f.busca} onChange={(v) => setF((s) => ({ ...s, busca: v }))} placeholder="Descrição, parceiro, categoria" />
            <FilterSelect label="Situação" value={f.situacao} onChange={(v) => setF((s) => ({ ...s, situacao: v }))}
              options={[{ value: "todos", label: "Todas" }, ...(["aberto", "parcial", "atrasado", "pago", "cancelado"] as Situacao[]).map((s) => ({ value: s, label: SITUACAO_META[s].label(tipo) }))]} />
            <FilterSelect label="Categoria" value={f.categoria} onChange={(v) => setF((s) => ({ ...s, categoria: v }))}
              options={[{ value: "todos", label: "Todas" }, ...categorias.todas.map((c) => ({ value: c, label: c }))]} />
            {tipo === "pagar" && cartoes.length > 0 && (
              <FilterSelect label="Cartão" value={f.cartao} onChange={(v) => setF((s) => ({ ...s, cartao: v }))}
                options={[{ value: "todos", label: "Todos" }, ...cartoes.map((c) => ({ value: text(rowId(c)), label: nomeCartao(c) }))]} />
            )}
            <PeriodoNavegavel value={f.per} onChange={(p) => setF((s) => ({ ...s, per: p }))} />
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
        <TituloSheet key={novoNoCartao || "x"} tipo={tipo} registro={editar} presetCartao={novoNoCartao} parceiros={parceiros} cartoes={cartoes} readOnly={!!editar && !perms.canUpdate}
          onClose={() => { setEditar(undefined); setNovoNoCartao(""); }} onSaved={invalidar} />
      )}
      {clonar && (
        <TituloSheet tipo={tipo} registro={null} modelo={clonar} parceiros={parceiros} cartoes={cartoes} readOnly={false}
          onClose={() => setClonar(null)} onSaved={invalidar} />
      )}
      {recibo && <ReciboDialog tipo={tipo} titulo={recibo} parceiro={parceiroById.get(text(recibo["parceiro_id"]))} onClose={() => setRecibo(null)} />}
      <Dialog open={!!excluirSerie} onOpenChange={(o) => !o && setExcluirSerie(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir parcela</DialogTitle></DialogHeader>
          <p className="text-sm">"{text(excluirSerie?.["descricao"])}" faz parte de uma série. O que deseja excluir?</p>
          <div className="grid gap-2">
            <Button variant="outline" onClick={() => void excluirAlcance("atual")}>Apenas esta parcela</Button>
            <Button variant="outline" onClick={() => void excluirAlcance("seguintes")}>Esta e as seguintes em aberto</Button>
            <Button variant="destructive" onClick={() => void excluirAlcance("todas")}>Todas as parcelas da série</Button>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setExcluirSerie(null)}>Cancelar</Button></DialogFooter>
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

function TituloSheet({ tipo, registro, modelo, presetCartao, parceiros, cartoes, readOnly, onClose, onSaved }: {
  tipo: TipoTitulo; registro: Row | null; modelo?: Row | null; presetCartao?: string; parceiros: Row[]; cartoes: Row[]; readOnly: boolean; onClose: () => void; onSaved: () => void;
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
    codigo_referencia: text(src?.["codigo_referencia"]),
    conta_bancaria_id: text(src?.["conta_bancaria_id"]),
    forma_pagamento: text(src?.["forma_pagamento"]),
    nsu: registro ? text(registro["nsu"]) : "",
    ja_pago: false,
    pago_em: registro ? text(registro["pago_em"]).slice(0, 10) : "",
    valor_pago: registro && registro["valor_pago"] != null ? moedaDeNumero(num(registro["valor_pago"])) : "",
    desvincular: false,
  });
  const { data: centros = [] } = useTableRows("centro_custo");
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
  // Na edição, um lançamento avulso manual (aberto ou já pago) pode virar parcelado/recorrente;
  // se já estiver pago, a baixa permanece só na 1ª parcela.
  const podeConverter = !registro || (!temSerie && text(registro["origem_tipo"] || "manual") === "manual"
    && !text(registro["cartao_id"]));
  const cartao = cartoes.find((c) => text(rowId(c)) === v.cartao_id);
  const [porItem, setPorItem] = useState(!!presetCartao && !registro);
  const [itens, setItens] = useState<{ descricao: string; categoria: string; valor: string; parcelas: string; data: string }[]>([{ descricao: "", categoria: "", valor: "", parcelas: "1", data: hojeISO() }]);
  const itensModo = cartaoModo && porItem;
  const cartaoOk = !!(cartao && cartao["dia_fechamento"] && cartao["dia_vencimento"]);
  const optsCartao = { dataCompra: v.vencimento, diaFechamento: num(cartao?.["dia_fechamento"]), diaVencimento: num(cartao?.["dia_vencimento"]) };
  const previa: { vencimento: string; valor: number; descricao?: string; categoria?: string; rotulo?: string; grupo?: number; n?: number; total?: number; dataCompra?: string }[] = !podeConverter ? [] : cartaoModo
    ? (!cartaoOk ? [] : itensModo
      ? parcelasItensCartao(itens.filter((i) => num(i.valor) > 0).map((i) => ({ descricao: i.descricao.trim() || v.descricao.trim(), categoria: i.categoria, valor: num(i.valor), parcelas: num(i.parcelas) || 1, dataCompra: i.data || v.vencimento })), optsCartao)
        .map((p) => ({ grupo: p.grupo, n: p.n, total: p.total, dataCompra: p.dataCompra, vencimento: p.vencimento, valor: p.valor, descricao: p.total > 1 ? `${p.item.descricao} (${p.n}/${p.total})` : p.item.descricao, categoria: p.item.categoria, rotulo: `${p.item.descricao} ${p.n}/${p.total}` }))
      : parcelasCartao({ valor: num(v.valor), parcelas: num(v.repetir), ...optsCartao }))
    : parcelasManuais({ modo: v.modo as ModoLancamento, valor: num(v.valor), quantidade: num(v.repetir), primeira: v.vencimento });
  const totalItens = round2(itens.reduce((s, i) => s + num(i.valor), 0));
  const usadoCartao = cartao ? limiteUsadoCartao(titulosCartao, text(rowId(cartao))) : 0;
  const limiteCartao = num(cartao?.["limite_total"]) || num(cartao?.["limite_mensal"]);
  const dispCartao = limiteDisponivelCartao(limiteCartao, usadoCartao);
  const papel = tipo === "receber" ? "cliente" : "fornecedor";

  const [novoTotal, setNovoTotal] = useState(() => {
    const m = text(registro?.["descricao"]).match(/\((\d+)\/(\d+)\)\s*$/);
    return m ? m[2]! : "";
  });
  const [serie, setSerie] = useState<Row[]>([]);
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
      if (vivo) { setSerie(l); if (l.length > 1) setNovoTotal(String(l.length)); }
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
        const copia = ["tipo", "categoria", "parceiro_id", "observacao", "centro_custo_id", "codigo_referencia", "conta_bancaria_id", "forma_pagamento", "empresa_id", "origem_tipo", "origem_id"];
        const lote = plano.criar.map((c) => ({ ...Object.fromEntries(copia.map((k) => [k, modelo[k] ?? null])), ...c, data_competencia: c.vencimento, status: "aberto" }));
        const { error } = await supabase.from("financeiro_titulos").insert(lote as never);
        if (error) throw error;
      }
      toast.success(`Série ajustada para ${total} parcelas.`); onSaved(); onClose();
    } catch (e) { toast.error(erroFinanceiro(e)); } finally { setSalvando(false); }
  };

  const salvar = async (alcance?: EscopoRecorrencia) => {
    const valor = itensModo ? totalItens : round2(num(v.valor));
    if (!v.descricao.trim()) return void toast.error("Informe a descrição.");
    if (!v.parceiro_id) return void toast.error(`Escolha o ${papel}.`);
    if (valor <= 0) return void toast.error(itensModo ? "Informe o valor de pelo menos um item." : "Informe o valor.");
    if (cartaoModo && !cartao) return void toast.error("Escolha o cartão utilizado.");
    if (cartaoModo && !previa.length) return void toast.error("Informe o dia de fechamento e de vencimento do cartão.");
    if (cartaoModo && limiteCartao > 0 && valor > dispCartao && !await confirmar(`Esta compra (${formatBRL(valor)}) passa do limite disponível do cartão (${formatBRL(dispCartao)}). Lançar mesmo assim?`)) return;
    { const prob = problemaParceiro(parceiros.find((p) => text(rowId(p)) === v.parceiro_id));
      if (prob && !registro && !await confirmar({ title: `Lançar para ${papel} irregular?`, description: `Este ${papel} está com ${prob}. Deseja lançar mesmo assim?`, confirmText: "Lançar mesmo assim", destructive: true })) return; }
    if (temSerie && !alcance && !v.desvincular) { setEscopo("atual"); setConfirmarSerie(true); return; }
    if (registro && v.status === "pago" && !v.pago_em) return void toast.error("Informe a data do pagamento.");
    setSalvando(true);
    try {
      const statusBase = v.status === "pago" ? (text(registro?.["status"]) === "pago" ? "pago" : "aberto") : v.status;
      const base = { tipo, descricao: v.descricao.trim(), categoria: v.categoria || (categorias.ativas[0] ?? ""), parceiro_id: v.parceiro_id || null,
        vencimento: v.vencimento, valor, observacao: v.observacao || null, status: statusBase,
        data_competencia: v.data_competencia || null, centro_custo_id: v.centro_custo_id || null,
        codigo_referencia: v.codigo_referencia.trim() || null, conta_bancaria_id: v.conta_bancaria_id || null,
        nsu: v.nsu.trim() || null, ...(v.forma_pagamento ? { forma_pagamento: v.forma_pagamento } : {}),
        ...(registro && text(registro["cartao_id"]) && v.data_compra ? { data_compra: v.data_compra } : {}) };
      if (registro) {
        if (temSerie && alcance && !v.desvincular) {
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
          // Converte um lançamento único em série: o atual vira a 1ª parcela e as demais são criadas.
          const n = previa.length;
          const serieId = crypto.randomUUID();
          const pago = v.ja_pago ? { status: "pago", pago_em: previa[0]!.vencimento, valor_pago: previa[0]!.valor } : {};
          const { error } = await supabase.from("financeiro_titulos").update({ ...base, origem_tipo: "manual", origem_id: serieId, parcela_n: 1,
            descricao: `${base.descricao} (1/${n})`, vencimento: previa[0]!.vencimento, valor: previa[0]!.valor, ...pago } as never).eq("id", text(rowId(registro)));
          if (error) throw error;
          const resto = previa.slice(1).map((p, i) => ({ ...base, empresa_id: registro["empresa_id"], origem_tipo: "manual", origem_id: serieId,
            parcela_n: i + 2, descricao: `${base.descricao} (${i + 2}/${n})`, vencimento: p.vencimento, valor: p.valor, status: "aberto" }));
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
          const baixa = v.status === "pago"
            ? { status: "pago", pago_em: v.pago_em || hojeISO(), valor_pago: round2(num(v.valor_pago)) || valor }
            : { status: v.status, pago_em: null, valor_pago: null };
          const { error: eb } = await supabase.from("financeiro_titulos").update(baixa as never).eq("id", text(rowId(registro)));
          if (eb) throw eb;
        }
      } else {
        const n = previa.length;
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
            : { origem_id: serieId, parcela_n: i + 1 }),
          descricao: p.descricao ?? (n > 1 ? `${base.descricao} (${i + 1}/${n})` : base.descricao),
          ...(p.categoria ? { categoria: p.categoria } : {}),
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
              <Input type="date" value={v.data_compra} disabled={readOnly} onChange={(e) => setV({ ...v, data_compra: e.target.value })} /></div>
          )}
          {!itensModo && (
            <div className="space-y-1"><Label>{(v.modo === "parcelado" || cartaoModo) && podeConverter ? "Valor total (R$)" : v.modo === "recorrente" && podeConverter ? "Valor mensal (R$)" : "Valor (R$)"}</Label>
              <Input inputMode="decimal" value={v.valor} disabled={readOnly} onChange={(e) => setV({ ...v, valor: mascaraMoeda(e.target.value) })} placeholder="0,00" /></div>
          )}
          {podeConverter && v.modo !== "unico" && !itensModo && (
            <div className="space-y-1"><Label>{v.modo === "recorrente" ? "Nº de meses" : "Nº de parcelas"}</Label>
              <Input type="number" min={1} max={cartaoModo ? 48 : 120} value={v.repetir} onChange={(e) => setV({ ...v, repetir: e.target.value })} /></div>
          )}
          {itensModo && (
            <div className="space-y-2 rounded-lg border p-3 sm:col-span-2">
              <p className="text-sm font-semibold">Itens da compra</p>
              <div className="text-muted-foreground hidden grid-cols-[1fr_9rem_9rem_7rem_4.5rem_2.5rem] gap-2 text-xs font-medium sm:grid">
                <span>Descrição</span><span>Data da compra</span><span>Categoria</span><span>Valor (R$)</span><span>Parcelas</span><span />
              </div>
              {itens.map((it, idx) => {
                const up = (patch: Partial<typeof it>) => setItens((l) => l.map((x, j) => (j === idx ? { ...x, ...patch } : x)));
                return (
                  <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_9rem_9rem_7rem_4.5rem_2.5rem]">
                    <Input value={it.descricao} placeholder="Ex.: Monitor 27''" onChange={(e) => up({ descricao: e.target.value })} />
                    <Input type="date" aria-label="Data da compra" value={it.data || v.vencimento} onChange={(e) => up({ data: e.target.value })} />
                    <Select value={it.categoria} onValueChange={(x) => up({ categoria: x })}>
                      <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                      <SelectContent>{categorias.ativas.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input inputMode="decimal" value={it.valor} placeholder="0,00" onChange={(e) => up({ valor: mascaraMoeda(e.target.value) })} />
                    <Input type="number" min={1} max={48} value={it.parcelas} onChange={(e) => up({ parcelas: e.target.value })} />
                    <Button type="button" variant="ghost" size="icon" aria-label="Remover item" disabled={itens.length === 1}
                      onClick={() => setItens((l) => l.filter((_, j) => j !== idx))}><Trash2 className="text-destructive h-4 w-4" /></Button>
                  </div>
                );
              })}
              <div className="flex items-center justify-between">
                <Button type="button" variant="outline" size="sm" onClick={() => setItens((l) => [...l, { descricao: "", categoria: v.categoria, valor: "", parcelas: "1", data: l[l.length - 1]?.data || v.vencimento }])}>
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
                    <span className="truncate">{p.rotulo ?? `${i + 1}/${previa.length}`}</span><span>{formatDate(p.vencimento)}</span><span className="text-right">{formatBRL(p.valor)}</span>
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
  const [per, setPer] = useState<Periodo>(() => periodoPreset("mes"));
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
