import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Check, CreditCard, Loader2, Paperclip, ScanText, X } from "lucide-react";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UploadInfo } from "@/components/ui/upload-info";
import { supabase } from "@/integrations/supabase/client";
import { abrirArquivo, enviarPrivado, urlAssinada, useUrlAssinada } from "@/lib/arquivos-privados";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useAudit } from "@/lib/audit";
import { rowId, text, useTableRows } from "@/lib/crud";
import { matchesAny } from "@/lib/input-masks";
import { formatBRL, formatDate, num, round2 } from "@/lib/orcamentos";
import { comprimirImagem } from "@/lib/image-compress";
import { erroFinanceiro } from "@/lib/financeiro-db";
import { hojeISO } from "@/lib/financeiro";
import { lerComprovante } from "@/lib/reembolsos.functions";
import { CATEGORIAS_DESPESA, STATUS_DESPESA, diasPagamento, disponivelCartao, proximaDataPagamento, resumoDespesas, usoCartaoMes, type StatusDespesa } from "@/lib/reembolsos";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { perguntar } from "@/components/layout/DialogoGlobal";

export const Route = createFileRoute("/_authenticated/reembolsos")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Reembolsos e Prestação de Contas — Atende.ai" },
      { name: "description", content: "Despesas com leitura automática do comprovante, cartões corporativos e aprovação de reembolsos." },
      { property: "og:title", content: "Reembolsos e Prestação de Contas — Atende.ai" },
      { property: "og:description", content: "Despesas com leitura automática do comprovante, cartões corporativos e aprovação de reembolsos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReembolsosPage,
});

type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
const mesAtual = () => hojeISO().slice(0, 7);
const nomeUsuario = (u: Row | undefined) => (u ? text(u["nome"] || u["email"]) : "");

/** Política de pagamento da empresa (dias do mês + prazo de corte). Sem cadastro: paga na data da aprovação. */
/** Mostra o comprovante (imagem ou PDF) num modal, sem abrir outra aba. */
function ComprovanteModal({ refArq, onClose }: { refArq: string; onClose: () => void }) {
  const url = useUrlAssinada(refArq);
  const pdf = /\.pdf($|\?)/i.test(refArq);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Comprovante</DialogTitle>
          <DialogDescription>Arquivo enviado com a despesa.</DialogDescription>
        </DialogHeader>
        <div className="bg-muted/40 flex max-h-[75vh] min-h-64 items-center justify-center overflow-auto rounded-md">
          {!url ? <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            : pdf ? <iframe src={url} title="Comprovante" className="h-[75vh] w-full rounded-md" />
            : <img src={url} alt="Comprovante" className="max-h-[75vh] w-auto object-contain" />}
        </div>
        <DialogFooter>
          {url && <Button variant="outline" asChild><a href={url} target="_blank" rel="noopener noreferrer" download>Baixar</a></Button>}
          <Button onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function usePolitica() {
  const { empresaId } = useAudit();
  const { data = [] } = useTableRows("despesas_politica");
  const p = data.find((r) => text(r["empresa_id"]) === text(empresaId)) ?? data[0];
  return { row: p, dias: diasPagamento(p?.["dias_pagamento"]), corte: Math.max(0, Math.round(num(p?.["dias_corte"]))) };
}
const textoDias = (dias: number[]) => dias.length ? `dia${dias.length > 1 ? "s" : ""} ${dias.join(", ").replace(/, (\d+)$/, " e $1")}` : "";

function ReembolsosPage() {
  const perms = usePagePermissions("/reembolsos");
  const { data: lanc = [], isLoading } = useTableRows("despesas_lancamentos");
  const { data: cartoes = [] } = useTableRows("despesas_cartoes");
  const { data: usuarios = [] } = useTableRows("usuarios");
  if (!perms.loading && !perms.canRead) return <p className="text-muted-foreground text-sm">Você não tem acesso a esta página.</p>;
  return (
    <Tabs defaultValue="despesas" className="space-y-4">
      <TabsList>
        <TabsTrigger value="despesas">Despesas</TabsTrigger>
        <TabsTrigger value="cartoes">Cartões corporativos</TabsTrigger>
      </TabsList>
      <TabsContent value="despesas"><Despesas lanc={lanc} cartoes={cartoes} usuarios={usuarios} loading={isLoading} perms={perms} /></TabsContent>
      <TabsContent value="cartoes"><Cartoes lanc={lanc} cartoes={cartoes} usuarios={usuarios} perms={perms} /></TabsContent>
    </Tabs>
  );
}

function Despesas({ lanc, cartoes, usuarios, loading, perms }: { lanc: Row[]; cartoes: Row[]; usuarios: Row[]; loading: boolean; perms: Perms }) {
  const qc = useQueryClient();
  const { usuarioId, empresaId } = useAudit();
  const userById = useMemo(() => new Map(usuarios.map((u) => [text(rowId(u)), u])), [usuarios]);
  const cartaoById = useMemo(() => new Map(cartoes.map((c) => [text(rowId(c)), c])), [cartoes]);
  const [f, setF] = useState({ busca: "", status: "todos", modalidade: "todos", mes: mesAtual() });
  const [editar, setEditar] = useState<Row | null | undefined>(undefined);
  const [verComp, setVerComp] = useState<string | null>(null);
  const gestor = perms.canUpdate;

  const visiveis = useMemo(() => (gestor ? lanc : lanc.filter((l) => text(l["usuario_id"]) === text(usuarioId))), [lanc, gestor, usuarioId]);
  const rows = useMemo(() => visiveis
    .filter((l) => matchesAny([l["estabelecimento"], l["observacao"], nomeUsuario(userById.get(text(l["usuario_id"]))), CATEGORIAS_DESPESA[text(l["categoria"])]], f.busca)
      && (f.status === "todos" || l["status"] === f.status)
      && (f.modalidade === "todos" || l["modalidade"] === f.modalidade)
      && (!f.mes || text(l["data"]).slice(0, 7) === f.mes))
    .sort((a, b) => text(b["data"]).localeCompare(text(a["data"]))), [visiveis, f, userById]);
  const resumo = resumoDespesas(rows);
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["table", "despesas_lancamentos"] });
    qc.invalidateQueries({ queryKey: ["table", "financeiro_titulos"] });
  };

  const politica = usePolitica();
  const [aprovando, setAprovando] = useState<{ l: Row; venc: string } | null>(null);
  const [politicaAberta, setPoliticaAberta] = useState(false);
  const pedirAprovacao = (l: Row) => {
    if (l["modalidade"] !== "reembolso") return void aprovar(l, hojeISO());
    setAprovando({ l, venc: proximaDataPagamento(hojeISO(), politica.dias, politica.corte) });
  };
  const aprovar = async (l: Row, vencimento: string) => {
    const id = text(rowId(l));
    let tituloId: string | null = null;
    if (l["modalidade"] === "reembolso") {
      const colab = nomeUsuario(userById.get(text(l["usuario_id"]))) || "colaborador";
      const { data, error } = await supabase.from("financeiro_titulos").insert({
        empresa_id: l["empresa_id"] ?? empresaId, tipo: "pagar", categoria: "Reembolsos",
        descricao: `Reembolso — ${colab} — ${text(l["estabelecimento"]) || CATEGORIAS_DESPESA[text(l["categoria"])] || "Despesa"}`,
        vencimento, valor: round2(num(l["valor"])), origem_tipo: "reembolso", origem_id: id, parcela_n: 1,
        comprovante: l["comprovante"] ?? null,
      } as never).select("id").single();
      if (error) return void toast.error(erroFinanceiro(error));
      tituloId = text((data as Row)["id"]);
    }
    const { error } = await supabase.from("despesas_lancamentos").update({
      status: "aprovado", motivo: null, aprovado_por: usuarioId ?? null, aprovado_em: new Date().toISOString(), titulo_id: tituloId,
    } as never).eq("id", id);
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success(tituloId ? `Aprovado. Reembolso lançado em Contas a Pagar para ${formatDate(vencimento)}.` : "Despesa do cartão aprovada.");
    setAprovando(null); invalidar();
  };
  const reprovar = async (l: Row) => {
    const motivo = await perguntar({ title: "Reprovar despesa", description: "Informe o motivo da reprovação.", multiline: true, confirmText: "Reprovar", destructive: true });
    if (motivo === null) return;
    const { error } = await supabase.from("despesas_lancamentos").update({ status: "reprovado", motivo: motivo || null, aprovado_por: usuarioId ?? null, aprovado_em: new Date().toISOString() } as never).eq("id", text(rowId(l)));
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success("Despesa reprovada."); invalidar();
  };
  const excluir = async (l: Row) => {
    if (l["titulo_id"]) return void toast.error("Esta despesa já gerou conta a pagar. Exclua o título no Financeiro primeiro.");
    const { error } = await supabase.from("despesas_lancamentos").delete().eq("id", text(rowId(l)));
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success("Despesa excluída."); invalidar();
  };

  const columns: Column[] = [
    { key: "data", header: "Data", fields: ["data"], render: (l) => <span className="tabular-nums">{formatDate(l["data"])}</span> },
    { key: "desc", header: "Despesa", fields: ["estabelecimento"], render: (l) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{text(l["estabelecimento"]) || "—"}</p>
        <p className="text-muted-foreground text-xs">{CATEGORIAS_DESPESA[text(l["categoria"])] ?? "Outros"} • {nomeUsuario(userById.get(text(l["usuario_id"]))) || "—"}</p>
      </div>
    ) },
    { key: "mod", header: "Pagamento", fields: [], render: (l) => l["modalidade"] === "cartao"
      ? <span className="inline-flex items-center gap-1 text-sm"><CreditCard className="h-3.5 w-3.5" />{text(cartaoById.get(text(l["cartao_id"]))?.["descricao"]) || "Cartão"}</span>
      : <span className="text-sm">Reembolso</span> },
    { key: "valor", header: "Valor", fields: ["valor"], render: (l) => <span className="font-semibold tabular-nums">{formatBRL(l["valor"])}</span> },
    { key: "st", header: "Situação", fields: [], render: (l) => {
      const s = (text(l["status"]) || "pendente") as StatusDespesa;
      return (
        <div>
          <span className={cn("rounded px-2 py-0.5 text-xs font-medium", STATUS_DESPESA[s].badge)}>{STATUS_DESPESA[s].label}</span>
          {s === "reprovado" && l["motivo"] ? <p className="text-muted-foreground mt-1 max-w-48 truncate text-xs">{text(l["motivo"])}</p> : null}
          {l["titulo_id"] ? <p className="text-muted-foreground mt-1 text-xs">No Contas a Pagar</p> : null}
        </div>
      );
    } },
    { key: "acoes", header: "", fields: [], render: (l) => (
      <div className="flex justify-end gap-1">
        {l["comprovante"] ? <Button variant="ghost" size="icon" title="Ver comprovante" aria-label="Ver comprovante" onClick={() => setVerComp(text(l["comprovante"]))}><Paperclip className="h-4 w-4" /></Button> : null}
        {gestor && l["status"] === "pendente" && (
          <>
            <Button variant="ghost" size="icon" title="Aprovar" aria-label="Aprovar" onClick={() => pedirAprovacao(l)}><Check className="text-success h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" title="Reprovar" aria-label="Reprovar" onClick={() => reprovar(l)}><X className="text-destructive h-4 w-4" /></Button>
          </>
        )}
      </div>
    ) },
  ];

  const cards = [
    { label: "Pendentes de aprovação", valor: resumo.pendente, st: "pendente", cls: "border-l-warning" },
    { label: "Aprovadas", valor: resumo.aprovado, st: "aprovado", cls: "border-l-success" },
    { label: "Reprovadas", valor: resumo.reprovado, st: "reprovado", cls: "border-l-destructive" },
    { label: "Reembolsos a lançar", valor: resumo.reembolsar, st: "todos", cls: "border-l-primary" },
  ];

  return (
    <div className="space-y-4">
      {verComp && <ComprovanteModal refArq={verComp} onClose={() => setVerComp(null)} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <button key={c.label} type="button" onClick={() => setF((s) => ({ ...s, status: s.status === c.st ? "todos" : c.st }))}
            className={cn("bg-card rounded-lg border border-l-4 p-3 text-left transition hover:shadow-sm", c.cls, f.status === c.st && c.st !== "todos" && "ring-primary ring-2")}>
            <p className="text-muted-foreground text-xs">{c.label}</p>
            <p className="text-lg font-bold tabular-nums">{formatBRL(c.valor)}</p>
          </button>
        ))}
      </div>
      {gestor && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
          <span className="flex items-center gap-2"><CalendarClock className="text-primary h-4 w-4" />
            {politica.dias.length ? `Reembolsos são pagos no ${textoDias(politica.dias)} de cada mês${politica.corte ? ` (lançar até ${politica.corte} dia(s) antes)` : ""}.` : "Nenhum dia de pagamento definido: o reembolso vence na data da aprovação."}</span>
          <Button size="sm" variant="outline" onClick={() => setPoliticaAberta(true)}>Dias de pagamento</Button>
        </div>
      )}
      <DataTable
        title="Despesas e prestação de contas"
        columns={columns}
        rows={rows}
        loading={loading}
        getValue={(r, fs) => r[fs[0] ?? ""]}
        rowKey={(r, i) => text(rowId(r)) || String(i)}
        onAdd={perms.canCreate ? () => setEditar(null) : undefined}
        onEdit={(r) => setEditar(r)}
        editReadOnly={!perms.canUpdate && !perms.canCreate}
        onDelete={perms.canDelete ? excluir : undefined}
        filters={
          <>
            <FilterInput label="Busca" value={f.busca} onChange={(v) => setF((s) => ({ ...s, busca: v }))} placeholder="Estabelecimento, colaborador, categoria" />
            <FilterSelect label="Situação" value={f.status} onChange={(v) => setF((s) => ({ ...s, status: v }))}
              options={[{ value: "todos", label: "Todas" }, ...(Object.keys(STATUS_DESPESA) as StatusDespesa[]).map((s) => ({ value: s, label: STATUS_DESPESA[s].label }))]} />
            <FilterSelect label="Pagamento" value={f.modalidade} onChange={(v) => setF((s) => ({ ...s, modalidade: v }))}
              options={[{ value: "todos", label: "Todos" }, { value: "reembolso", label: "Reembolso" }, { value: "cartao", label: "Cartão corporativo" }]} />
            <div className="space-y-1"><Label className="text-xs">Mês</Label><Input type="month" value={f.mes} onChange={(e) => setF((s) => ({ ...s, mes: e.target.value }))} /></div>
          </>
        }
      />
      {editar !== undefined && (
        <DespesaSheet registro={editar} cartoes={cartoes} lanc={lanc}
          readOnly={!!editar && (editar["status"] !== "pendente" || (!gestor && text(editar["usuario_id"]) !== text(usuarioId)))}
          onClose={() => setEditar(undefined)} onSaved={invalidar} />
      )}
      {aprovando && (
        <Dialog open onOpenChange={(o) => !o && setAprovando(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Aprovar reembolso</DialogTitle>
              <DialogDescription>
                {nomeUsuario(userById.get(text(aprovando.l["usuario_id"]))) || "Colaborador"} — {formatBRL(aprovando.l["valor"])}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1">
              <Label>Data de pagamento (vencimento em Contas a Pagar)</Label>
              <Input type="date" value={aprovando.venc} onChange={(e) => setAprovando({ ...aprovando, venc: e.target.value })} />
              <p className="text-muted-foreground text-xs">{politica.dias.length ? `Sugerida pela política da empresa (${textoDias(politica.dias)}). Você pode antecipar ou adiar.` : "Sem dias de pagamento definidos. Escolha a data."}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAprovando(null)}>Cancelar</Button>
              <Button disabled={!aprovando.venc} onClick={() => aprovar(aprovando.l, aprovando.venc)}>Aprovar e lançar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {politicaAberta && <PoliticaDialog atual={politica} onClose={() => setPoliticaAberta(false)} />}
    </div>
  );
}

function DespesaSheet({ registro, cartoes, lanc, readOnly, onClose, onSaved }: {
  registro: Row | null; cartoes: Row[]; lanc: Row[]; readOnly: boolean; onClose: () => void; onSaved: () => void;
}) {
  const { usuarioId, empresaId } = useAudit();
  const ler = useServerFn(lerComprovante);
  const inputRef = useRef<HTMLInputElement>(null);
  const [v, setV] = useState({
    data: text(registro?.["data"]).slice(0, 10) || hojeISO(),
    estabelecimento: text(registro?.["estabelecimento"]),
    cnpj: text(registro?.["cnpj"]),
    categoria: text(registro?.["categoria"]) || "alimentacao",
    valor: registro ? String(num(registro["valor"])).replace(".", ",") : "",
    cartao: registro ? registro["modalidade"] === "cartao" : false,
    cartao_id: text(registro?.["cartao_id"]),
    comprovante: text(registro?.["comprovante"]),
    observacao: text(registro?.["observacao"]),
  });
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const ativos = cartoes.filter((c) => c["ativo"] !== false || text(rowId(c)) === v.cartao_id);
  const cartaoSel = cartoes.find((c) => text(rowId(c)) === v.cartao_id);
  const usado = cartaoSel ? usoCartaoMes(lanc.filter((l) => !registro || rowId(l) !== rowId(registro)), v.cartao_id, v.data.slice(0, 7)) : 0;
  const disponivel = cartaoSel ? disponivelCartao(cartaoSel["limite_mensal"], usado) : 0;

  const previaComprovante = useUrlAssinada(v.comprovante);
  const politica = usePolitica();
  const previsao = proximaDataPagamento(hojeISO(), politica.dias, politica.corte);

  const enviar = async (recebido: File) => {
    setLendo(true);
    try {
      let original = recebido;
      if (/image\/hei[cf]/i.test(recebido.type) || /\.hei[cf]$/i.test(recebido.name)) {
        const heic2any = (await import("heic2any")).default;
        const out = await heic2any({ blob: recebido, toType: "image/jpeg", quality: 0.9 });
        const blob = (Array.isArray(out) ? out[0] : out) ?? recebido;
        original = new File([blob], recebido.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
      }
      const pdf = original.type === "application/pdf";
      const file = pdf ? original : await comprimirImagem(original, "laudo");
      const ref = await enviarPrivado(file, "reembolsos");
      const url = await urlAssinada(ref);
      setV((s) => ({ ...s, comprovante: ref }));
      toast.info("Lendo o comprovante…");
      const { data: s } = await supabase.auth.getSession();
      const r = await ler({ data: { url, pdf, token: s.session?.access_token } });
      if (r.erro) return void toast.warning(r.erro);
      setV((s) => ({
        ...s,
        valor: r.valor ? String(r.valor).replace(".", ",") : s.valor,
        data: r.data ?? s.data,
        estabelecimento: r.estabelecimento ?? s.estabelecimento,
        cnpj: r.cnpj ?? s.cnpj,
        categoria: r.categoria && CATEGORIAS_DESPESA[r.categoria] ? r.categoria : s.categoria,
      }));
      toast.success("Dados lidos do comprovante. Confira antes de salvar.");
    } catch (e) {
      toast.error(erroFinanceiro(e));
    } finally { setLendo(false); }
  };

  const salvar = async () => {
    const valor = round2(num(v.valor));
    if (valor <= 0) return void toast.error("Informe o valor.");
    if (v.cartao && !v.cartao_id) return void toast.error("Escolha o cartão usado.");
    setSalvando(true);
    const base = {
      data: v.data, estabelecimento: v.estabelecimento.trim() || null, cnpj: v.cnpj.replace(/\D/g, "").slice(0, 14) || null,
      categoria: v.categoria, valor, modalidade: v.cartao ? "cartao" : "reembolso", cartao_id: v.cartao ? v.cartao_id : null,
      comprovante: v.comprovante || null, observacao: v.observacao.trim() || null,
    };
    const { error } = registro
      ? await supabase.from("despesas_lancamentos").update(base as never).eq("id", text(rowId(registro)))
      : await supabase.from("despesas_lancamentos").insert({ ...base, empresa_id: empresaId, usuario_id: usuarioId ?? null, status: "pendente" } as never);
    setSalvando(false);
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success("Despesa enviada para aprovação."); onSaved(); onClose();
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{registro ? "Despesa" : "Nova despesa"}</SheetTitle>
          <SheetDescription>Envie a foto do cupom ou recibo para preencher sozinho, ou digite os dados se não tiver comprovante.</SheetDescription>
        </SheetHeader>
        <div className="grid flex-1 content-start gap-4 overflow-y-auto p-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center gap-1"><Label>Comprovante (opcional)</Label><UploadInfo perfil="laudo" arquivos /></div>
            <input ref={inputRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
              onChange={(e) => { const fl = e.target.files?.[0]; e.target.value = ""; if (fl) void enviar(fl); }} />
            <div className="flex flex-wrap items-center gap-3">
              {!readOnly && (
                <Button type="button" variant="outline" disabled={lendo} onClick={() => inputRef.current?.click()}>
                  {lendo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanText className="mr-2 h-4 w-4" />}
                  {lendo ? "Lendo…" : v.comprovante ? "Trocar e ler de novo" : "Fotografar / enviar comprovante"}
                </Button>
              )}
              {v.comprovante && (/\.pdf$/i.test(v.comprovante)
                ? <button type="button" onClick={() => abrirArquivo(v.comprovante).catch((e) => toast.error(e.message))} className="text-primary text-sm underline">Abrir PDF</button>
                : <img src={previaComprovante} alt="Comprovante" data-zoom className="h-24 rounded border object-cover" />)}
              {v.comprovante && !readOnly && <Button type="button" variant="ghost" size="sm" onClick={() => setV({ ...v, comprovante: "" })}><X className="mr-1 h-4 w-4" />Remover</Button>}
            </div>
          </div>
          <div className="space-y-1"><Label>Valor (R$) *</Label>
            <Input inputMode="decimal" value={v.valor} disabled={readOnly} onChange={(e) => setV({ ...v, valor: e.target.value })} placeholder="0,00" /></div>
          <div className="space-y-1"><Label>Data</Label>
            <Input type="date" value={v.data} disabled={readOnly} onChange={(e) => setV({ ...v, data: e.target.value })} /></div>
          <div className="space-y-1"><Label>Estabelecimento</Label>
            <Input value={v.estabelecimento} disabled={readOnly} onChange={(e) => setV({ ...v, estabelecimento: e.target.value })} /></div>
          <div className="space-y-1"><Label>CNPJ</Label>
            <Input value={v.cnpj} disabled={readOnly} inputMode="numeric" onChange={(e) => setV({ ...v, cnpj: e.target.value })} /></div>
          <div className="space-y-1"><Label>Categoria</Label>
            <Select value={v.categoria} disabled={readOnly} onValueChange={(x) => setV({ ...v, categoria: x })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(CATEGORIAS_DESPESA).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="flex items-center gap-3 pt-6">
            <Switch id="usou-cartao" checked={v.cartao} disabled={readOnly} onCheckedChange={(c) => setV({ ...v, cartao: c })} />
            <Label htmlFor="usou-cartao">Paguei com cartão corporativo</Label>
          </div>
          {v.cartao && (
            <div className="space-y-1 sm:col-span-2"><Label>Cartão *</Label>
              <Select value={v.cartao_id} disabled={readOnly} onValueChange={(x) => setV({ ...v, cartao_id: x })}>
                <SelectTrigger><SelectValue placeholder="Escolha o cartão" /></SelectTrigger>
                <SelectContent>{ativos.map((c) => <SelectItem key={text(rowId(c))} value={text(rowId(c))}>{text(c["descricao"])}{c["final4"] ? ` • final ${text(c["final4"])}` : ""}</SelectItem>)}</SelectContent>
              </Select>
              {cartaoSel && (
                <p className={cn("text-xs", round2(num(v.valor)) > disponivel ? "text-destructive" : "text-muted-foreground")}>
                  Disponível no mês: {formatBRL(disponivel)} de {formatBRL(cartaoSel["limite_mensal"])}
                  {round2(num(v.valor)) > disponivel ? " — esta despesa passa do limite." : ""}
                </p>
              )}
            </div>
          )}
          {!v.cartao && (
            <div className="bg-muted/50 flex items-start gap-2 rounded-md border p-3 text-sm sm:col-span-2">
              <CalendarClock className="text-primary mt-0.5 h-4 w-4 shrink-0" />
              <span>{politica.dias.length
                ? <>Previsão de pagamento: <b>{formatDate(previsao)}</b>. A empresa paga reembolsos no {textoDias(politica.dias)} de cada mês, depois da aprovação.</>
                : <>Ao ser aprovado, o valor entra em Contas a Pagar em seu nome, na data definida pelo aprovador.</>}</span>
            </div>
          )}
          <div className="space-y-1 sm:col-span-2"><Label>Observação (cliente, projeto, OS, veículo…)</Label>
            <Textarea value={v.observacao} disabled={readOnly} onChange={(e) => setV({ ...v, observacao: e.target.value })} /></div>
          {registro?.["motivo"] ? <p className="text-destructive text-sm sm:col-span-2">Motivo da reprovação: {text(registro["motivo"])}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {!readOnly && <Button onClick={salvar} disabled={salvando || lendo}>Salvar</Button>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PoliticaDialog({ atual, onClose }: { atual: ReturnType<typeof usePolitica>; onClose: () => void }) {
  const qc = useQueryClient();
  const { empresaId } = useAudit();
  const [dias, setDias] = useState(atual.dias.join(", "));
  const [corte, setCorte] = useState(String(atual.corte));
  const [salvando, setSalvando] = useState(false);
  const lista = diasPagamento(dias);
  const salvar = async () => {
    setSalvando(true);
    const { error } = await supabase.from("despesas_politica").upsert(
      { empresa_id: atual.row?.["empresa_id"] ?? empresaId, dias_pagamento: lista, dias_corte: Math.max(0, Math.round(num(corte))) } as never,
      { onConflict: "empresa_id" });
    setSalvando(false);
    if (error) return void toast.error(/relation|does not exist|schema cache/i.test(error.message) ? "Rode o script atendeai-reembolsos-pagamento.sql no SQL Editor." : erroFinanceiro(error));
    toast.success("Dias de pagamento salvos.");
    qc.invalidateQueries({ queryKey: ["table", "despesas_politica"] });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dias de pagamento de reembolsos</DialogTitle>
          <DialogDescription>Quem lança o reembolso vê a previsão, e o aprovador recebe a data já sugerida.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Dias do mês</Label>
            <Input value={dias} onChange={(e) => setDias(e.target.value)} placeholder="Ex.: 10, 25" />
            <p className="text-muted-foreground text-xs">Separe por vírgula. Sábado e domingo passam para a segunda-feira. Deixe vazio para pagar na data da aprovação.</p></div>
          <div className="space-y-1"><Label>Prazo de corte (dias antes)</Label>
            <Input type="number" min={0} value={corte} onChange={(e) => setCorte(e.target.value)} />
            <p className="text-muted-foreground text-xs">Despesa lançada depois do corte fica para o próximo dia de pagamento.</p></div>
          {lista.length > 0 && <p className="text-sm">Exemplo: lançado hoje, paga em <b>{formatDate(proximaDataPagamento(hojeISO(), lista, num(corte)))}</b>.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Cartoes({ lanc, cartoes, usuarios, perms }: { lanc: Row[]; cartoes: Row[]; usuarios: Row[]; perms: Perms }) {
  const qc = useQueryClient();
  const [editar, setEditar] = useState<Row | null | undefined>(undefined);
  const [busca, setBusca] = useState("");
  const mes = mesAtual();
  const userById = useMemo(() => new Map(usuarios.map((u) => [text(rowId(u)), u])), [usuarios]);
  const rows = cartoes.filter((c) => matchesAny([c["descricao"], c["bandeira"], c["final4"], nomeUsuario(userById.get(text(c["portador_id"])))], busca));
  const invalidar = () => qc.invalidateQueries({ queryKey: ["table", "despesas_cartoes"] });
  const excluir = async (c: Row) => {
    const { error } = await supabase.from("despesas_cartoes").delete().eq("id", text(rowId(c)));
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success("Cartão excluído."); invalidar();
  };
  const columns: Column[] = [
    { key: "desc", header: "Cartão", fields: ["descricao"], render: (c) => (
      <div><p className="font-medium">{text(c["descricao"])}</p>
        <p className="text-muted-foreground text-xs">{text(c["bandeira"]) || "—"}{c["final4"] ? ` • final ${text(c["final4"])}` : ""}{c["ativo"] === false ? " • Inativo" : ""}</p></div>
    ) },
    { key: "port", header: "Portador", fields: [], render: (c) => nomeUsuario(userById.get(text(c["portador_id"]))) || "—" },
    { key: "uso", header: "Uso no mês", fields: [], render: (c) => {
      const limite = num(c["limite_mensal"]);
      const usado = usoCartaoMes(lanc, text(rowId(c)), mes);
      const pct = limite > 0 ? Math.min(100, (usado / limite) * 100) : 0;
      return (
        <div className="min-w-40 space-y-1">
          <div className="flex justify-between text-xs tabular-nums"><span>{formatBRL(usado)}</span><span className="text-muted-foreground">de {formatBRL(limite)}</span></div>
          <div className="bg-muted h-2 rounded"><div className={cn("h-2 rounded", pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-warning" : "bg-success")} style={{ width: `${pct}%` }} /></div>
        </div>
      );
    } },
    { key: "disp", header: "Disponível", fields: [], render: (c) => <span className="font-semibold tabular-nums">{formatBRL(disponivelCartao(c["limite_mensal"], usoCartaoMes(lanc, text(rowId(c)), mes)))}</span> },
  ];
  return (
    <>
      <DataTable title="Cartões corporativos" columns={columns} rows={rows} loading={false}
        getValue={(r, fs) => r[fs[0] ?? ""]} rowKey={(r, i) => text(rowId(r)) || String(i)}
        onAdd={perms.canCreate ? () => setEditar(null) : undefined} onEdit={(r) => setEditar(r)} editReadOnly={!perms.canUpdate}
        onDelete={perms.canDelete ? excluir : undefined}
        filters={<FilterInput label="Busca" value={busca} onChange={setBusca} placeholder="Cartão, bandeira, portador" />} />
      {editar !== undefined && <CartaoSheet registro={editar} usuarios={usuarios} readOnly={!!editar && !perms.canUpdate} onClose={() => setEditar(undefined)} onSaved={invalidar} />}
    </>
  );
}

function CartaoSheet({ registro, usuarios, readOnly, onClose, onSaved }: { registro: Row | null; usuarios: Row[]; readOnly: boolean; onClose: () => void; onSaved: () => void }) {
  const { empresaId } = useAudit();
  const [v, setV] = useState({
    descricao: text(registro?.["descricao"]), bandeira: text(registro?.["bandeira"]), final4: text(registro?.["final4"]),
    portador_id: text(registro?.["portador_id"]), limite: registro ? String(num(registro["limite_mensal"])).replace(".", ",") : "",
    dia: text(registro?.["dia_fechamento"]), venc: text(registro?.["dia_vencimento"]), ativo: registro ? registro["ativo"] !== false : true,
  });
  const salvar = async () => {
    if (!v.descricao.trim()) return void toast.error("Informe a descrição do cartão.");
    const dia = (x: string) => (x ? Math.min(31, Math.max(1, Number(x))) : null);
    const base = {
      descricao: v.descricao.trim(), bandeira: v.bandeira || null, final4: v.final4.replace(/\D/g, "").slice(0, 4) || null,
      portador_id: v.portador_id || null, limite_mensal: round2(num(v.limite)), dia_fechamento: dia(v.dia), dia_vencimento: dia(v.venc), ativo: v.ativo,
    };
    const { error } = registro
      ? await supabase.from("despesas_cartoes").update(base as never).eq("id", text(rowId(registro)))
      : await supabase.from("despesas_cartoes").insert({ ...base, empresa_id: empresaId } as never);
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success("Cartão salvo."); onSaved(); onClose();
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{registro ? "Editar" : "Novo"} cartão corporativo</SheetTitle>
          <SheetDescription>Guarde só os 4 últimos dígitos; nunca o número completo.</SheetDescription>
        </SheetHeader>
        <div className="grid flex-1 content-start gap-4 overflow-y-auto p-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label>Descrição *</Label><Input value={v.descricao} disabled={readOnly} placeholder="Ex.: Cartão equipe técnica" onChange={(e) => setV({ ...v, descricao: e.target.value })} /></div>
          <div className="space-y-1"><Label>Bandeira</Label><Input value={v.bandeira} disabled={readOnly} onChange={(e) => setV({ ...v, bandeira: e.target.value })} /></div>
          <div className="space-y-1"><Label>Final (4 dígitos)</Label><Input value={v.final4} disabled={readOnly} inputMode="numeric" maxLength={4} onChange={(e) => setV({ ...v, final4: e.target.value })} /></div>
          <div className="space-y-1"><Label>Portador</Label>
            <Select value={v.portador_id} disabled={readOnly} onValueChange={(x) => setV({ ...v, portador_id: x })}>
              <SelectTrigger><SelectValue placeholder="Escolha o colaborador" /></SelectTrigger>
              <SelectContent>{usuarios.map((u) => <SelectItem key={text(rowId(u))} value={text(rowId(u))}>{nomeUsuario(u)}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1"><Label>Limite mensal (R$)</Label><Input inputMode="decimal" value={v.limite} disabled={readOnly} onChange={(e) => setV({ ...v, limite: e.target.value })} /></div>
          <div className="space-y-1"><Label>Dia de fechamento</Label><Input type="number" min={1} max={31} value={v.dia} disabled={readOnly} onChange={(e) => setV({ ...v, dia: e.target.value })} /></div>
          <div className="space-y-1"><Label>Dia de vencimento da fatura</Label><Input type="number" min={1} max={31} value={v.venc} disabled={readOnly} onChange={(e) => setV({ ...v, venc: e.target.value })} /></div>
          <div className="flex items-center gap-3 pt-6"><Switch id="cartao-ativo" checked={v.ativo} disabled={readOnly} onCheckedChange={(c) => setV({ ...v, ativo: c })} /><Label htmlFor="cartao-ativo">Ativo</Label></div>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {!readOnly && <Button onClick={salvar}>Salvar</Button>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
