import { tx } from "@/lib/i18n-termos";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { etapasDoKanban, kanbanDoModuloOrcamentos } from "@/lib/orcamento-kanban";
import { corEtapa } from "@/lib/kanban-cores";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Copy, FileSignature, FileText, Inbox, Info, MessageCircle, ScrollText, ShoppingCart, Thermometer, Trash2, Wallet } from "lucide-react";
import { CaptacaoLeadsDialog } from "@/components/orcamentos/CaptacaoLeadsDialog";
import { BarraAcoesLote, useAcoesComuns } from "@/components/data-table/AcoesLote";
import { TEMPERATURAS, temperaturaEfetiva } from "@/lib/temperatura";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrcamentoSheet } from "@/components/orcamentos/OrcamentoSheet";
import { OrcamentoPDF } from "@/components/orcamentos/OrcamentoPDF";
import { PropostaDialog } from "@/components/orcamentos/PropostaDialog";
import { MinutaDialog } from "@/components/orcamentos/MinutaDialog";
import { titulosDaOferta } from "@/lib/financeiro";
import { apagarAbertosDaOrigem, contarTitulosDaOrigem, erroFinanceiro, fontesDaOferta, inserirTitulos, itensDaOferta } from "@/lib/financeiro-db";
import { GerarPedidosDialog } from "@/components/orcamentos/GerarPedidosDialog";
import { SituacaoBadge } from "@/components/orcamentos/SituacaoBadge";
import { useAlterarSituacao, useSaveOrcamento } from "@/hooks/useSaveOrcamento";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useSecoes } from "@/hooks/useSecoes";
import { useAuth } from "@/hooks/useAuth";
import { rowId, useDeleteRecord, useTableRows } from "@/lib/crud";
import { useAudit } from "@/lib/audit";
import { matchesAny } from "@/lib/input-masks";
import { daysUntil, formatBRL, formatDate, situacaoMeta, situacaoOf, SITUACOES, yearOf } from "@/lib/orcamentos";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { iniciais } from "@/components/projetos/ResponsaveisPicker";
import { AtivacaoOfertaDialog } from "@/components/orcamentos/AtivacaoOfertaDialog";
import { ofertaTravada, situacaoAtivada } from "@/lib/oferta-ativacao";
import { executarHandoff } from "@/lib/kanban-handoff";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { ReguaOfertas } from "@/components/orcamentos/ReguaOfertas";
import { ConfigAprovacaoOfertaDialog } from "@/components/orcamentos/AprovacaoOfertas";
import { ofertaLiberada } from "@/lib/aprovacao-ofertas";
import { ShieldCheck } from "lucide-react";

const avisoBloqueio = () => toast.warning(tx("Oferta aguardando aprovação do gestor. Abra a oferta para ver o andamento."));

const SECOES_OFERTA = [
  { key: "crm", label: "CRM & Atendimento" },
  { key: "financeiro", label: "Financeiro & Comissões" },
  { key: "estrategico", label: "Dados estratégicos (custo, lucro e margem)" },
  { key: "workflow", label: "Workflow de aprovação" },
];

export const Route = createFileRoute("/_authenticated/orcamentos")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Ofertas — Atende.ai" },
      {
        name: "description",
        content:
          "Ofertas de produtos e serviços com numeração automática, situação e memória de cálculo de lucratividade.",
      },
      { property: "og:title", content: "Ofertas — Atende.ai" },
      {
        property: "og:description",
        content:
          "Ofertas de produtos e serviços com numeração automática, situação e memória de cálculo de lucratividade.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { abrir?: string } => (typeof s["abrir"] === "string" && s["abrir"] ? { abrir: s["abrir"] } : {}),
  component: OrcamentosPage,
});

const normSit = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

function mesmaEmpresa(row: Row, empresaId: string | number | undefined) {
  return (
    empresaId === undefined || !row["empresa_id"] || String(row["empresa_id"]) === String(empresaId)
  );
}

function OrcamentosPage() {
  const perms = usePagePermissions("/orcamentos");
  const secoes = useSecoes("/orcamentos", SECOES_OFERTA);
  const { empresaId, usuarioId } = useAudit();
  const { empresa } = useAuth();
  const { data: todos = [], isLoading } = useTableRows("orcamentos");
  const { data: todasLinhas = [] } = useTableRows("orcamento_itens");
  const { data: parceiros = [] } = useTableRows("parceiros");
  const { data: usuarios = [] } = useTableRows("usuarios");
  const { data: itens = [] } = useTableRows("itens");
  const { data: unidades = [] } = useTableRows("unidade_medida");
  const { data: marcas = [] } = useTableRows("itens_marcas");
  const { data: empresas = [] } = useTableRows("empresas");
  const save = useSaveOrcamento();
  const alterarSituacao = useAlterarSituacao();
  // Situações = etapas do Kanban vinculado à função Ofertas (fallback: lista padrão).
  const { data: etapasKanban = [] } = useQuery({
    queryKey: ["orcamentos-etapas-kanban"],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => etapasDoKanban(await kanbanDoModuloOrcamentos()),
  });
  const situacoes = useMemo(
    () =>
      etapasKanban.length
        ? etapasKanban.map((e) => ({ value: e.descricao, label: e.descricao, dot: corEtapa(e.cor).className }))
        : SITUACOES.map((s) => ({ value: s.value as string, label: s.label, dot: s.dot })),
    [etapasKanban],
  );
  const situacaoFiltro = useMemo(
    () => [{ value: "todos", label: "Todas" }, ...situacoes.map((s) => ({ value: s.value, label: s.label }))],
    [situacoes],
  );
  const remove = useDeleteRecord("orcamentos");
  const corSituacao = (row: Row) =>
    (etapasKanban.find((e) => e.id === String(row["kanban_etapa_id"] ?? "")) ??
      etapasKanban.find((e) => normSit(e.descricao) === normSit(row["situacao"])))?.cor;

  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const lote = useAcoesComuns("orcamentos");
  const qcOrc = useQueryClient();
  // Oferta gravada ao confirmar um item: recarrega e mantém o painel aberto com o registro atualizado.
  const manterAbertoCom = async (id: string) => {
    await qcOrc.refetchQueries({ queryKey: ["table", "orcamentos"] });
    for (const [, data] of qcOrc.getQueriesData<Row[]>({ queryKey: ["table", "orcamentos"] })) {
      const achado = Array.isArray(data) ? data.find((t) => String(rowId(t)) === id) : undefined;
      if (achado) { setRecord(achado); return; }
    }
  };
  const { abrir } = Route.useSearch();
  const navOrc = Route.useNavigate();
  useEffect(() => {
    if (abrir === "novo") { setRecord(null); setOpen(true); void navOrc({ search: {}, replace: true }); return; }
    if (!abrir || !todos.length) return;
    const achado = todos.find((t) => String(rowId(t)) === abrir);
    if (achado) { setRecord(achado); setOpen(true); void navOrc({ search: {}, replace: true }); }
  }, [abrir, todos]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<Row | null>(null);
  const [propostaOpen, setPropostaOpen] = useState(false);
  const [minutaOpen, setMinutaOpen] = useState(false);
  const [pedidosOpen, setPedidosOpen] = useState(false);
  const [f, setF] = useState({ busca: "", situacao: "todos", vendedor: "todos", ano: "todos" });
  const [duplicarDe, setDuplicarDe] = useState<{ record: Row; linhas: Row[] } | null>(null);
  const [ativar, setAtivarRaw] = useState<Row | null>(null);
  const setAtivar = (r: Row | null) => { if (r && !ofertaLiberada(r["aprovacao_status"])) { avisoBloqueio(); return; } setAtivarRaw(r); };
  const [wfOpen, setWfOpen] = useState(false);
  const [reguaOpen, setReguaOpen] = useState(false);
  const [leadsOpen, setLeadsOpen] = useState(false);

  const gerarContas = async (r: Row) => {
    const id = String(rowId(r) ?? "");
    const tipos = ["oferta", "despesa"] as const;
    try {
      const ja = await contarTitulosDaOrigem([id], [...tipos]);
      if (ja > 0) {
        if (!await confirmar(`Esta oferta já gerou ${ja} conta(s). Regerar apenas as que estão em aberto?`)) return;
        await apagarAbertosDaOrigem([id], [...tipos]);
      } else if (!await confirmar("Lançar no Financeiro as parcelas do cliente (a receber), as parcelas do fornecedor/produtos e as despesas operacionais (a pagar)?\n\nSe você também gerar Pedidos de Compra desta oferta, apague as parcelas de produtos para não pagar em dobro.")) return;
      const atual = todos.find((t) => rowId(t) === rowId(r)) ?? r;
      const itensOf = await itensDaOferta(id);
      const n = await inserirTitulos(String(atual["empresa_id"] ?? empresaId ?? ""), titulosDaOferta({ ...atual, id }, itensOf),
        { fontes: await fontesDaOferta(itensOf), clienteId: (atual["parceiro_id"] ?? atual["parceiros_id"] ?? null) as string | null });
      toast.success(n ? `${n} conta(s) lançada(s) no Financeiro.` : "Nada a lançar nesta oferta.");
      qcOrc.invalidateQueries({ queryKey: ["table", "financeiro_titulos"] });
    } catch (e) {
      toast.error(erroFinanceiro(e));
    }
  };

  const duplicar = (r: Row) => {
    const id = String(rowId(r) ?? "");
    setRecord(null);
    setDuplicarDe({
      record: r,
      linhas: todasLinhas.filter((l) => String(l["orcamento_id"] ?? "") === id),
    });
    setOpen(true);
    toast.success(tx("Oferta duplicada"), {
      description: "Revise e clique em Salvar para gerar o novo número.",
    });
  };

  const escopo = useMemo(() => todos.filter((r) => mesmaEmpresa(r, empresaId)), [todos, empresaId]);
  const clientes = useMemo(
    () => parceiros.filter((p) => mesmaEmpresa(p, empresaId) && p["is_cliente"] === true),
    [parceiros, empresaId],
  );
  const vendedores = useMemo(
    () => usuarios.filter((u) => mesmaEmpresa(u, empresaId)),
    [usuarios, empresaId],
  );
  const itensEmpresa = useMemo(
    () => itens.filter((i) => mesmaEmpresa(i, empresaId)),
    [itens, empresaId],
  );
  // Unidades e marcas são catálogos compartilhados: nunca filtrar por empresa.
  const unidadesEmpresa = unidades;
  const marcasEmpresa = marcas;

  const parceiroById = useMemo(
    () => new Map(parceiros.map((p) => [String(rowId(p) ?? ""), p])),
    [parceiros],
  );
  const usuarioById = useMemo(
    () => new Map(usuarios.map((u) => [String(rowId(u) ?? ""), u])),
    [usuarios],
  );
  const qtdItensPorOrcamento = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of todasLinhas) {
      const k = String(l["orcamento_id"] ?? "");
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [todasLinhas]);

  const linhasRecord = useMemo(() => {
    if (!record) return [] as Row[];
    const id = String(rowId(record) ?? "");
    return todasLinhas.filter((l) => String(l["orcamento_id"] ?? "") === id);
  }, [todasLinhas, record]);

  const linhasPreview = useMemo(() => {
    if (!preview) return [] as Row[];
    const id = String(rowId(preview) ?? "");
    return todasLinhas.filter((l) => String(l["orcamento_id"] ?? "") === id);
  }, [todasLinhas, preview]);

  const nomeCliente = (r: Row) => {
    const p = parceiroById.get(String(pick(r, ["parceiro_id", "parceiros_id"]) ?? ""));
    return p ? String(p["razao_social"] ?? p["nome_fantasia"] ?? "—") : "";
  };
  const nomeVendedor = (r: Row) => {
    const u = usuarioById.get(String(pick(r, ["usuario_id", "vendedor_id"]) ?? ""));
    return u ? String(pick(u, ["nome", "email"]) ?? "—") : "";
  };

  const anos = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()]);
    for (const r of escopo) {
      const y = yearOf(r["dt_orcamento"]);
      if (y) set.add(y);
    }
    return [...set].sort((a, b) => b - a);
  }, [escopo]);

  const rows = useMemo(
    () =>
      escopo
        .filter(
          (r) =>
            matchesAny([r["numero"], nomeCliente(r), nomeVendedor(r), r["descricao"]], f.busca) &&
            (f.situacao === "todos" || normSit(r["situacao"]) === normSit(f.situacao)) &&
            (f.vendedor === "todos" ||
              String(pick(r, ["usuario_id", "vendedor_id"]) ?? "") === f.vendedor) &&
            (f.ano === "todos" || String(yearOf(r["dt_orcamento"]) ?? "") === f.ano),
        )
        .sort((a, b) => {
          const da = String(a["dt_orcamento"] ?? "");
          const db = String(b["dt_orcamento"] ?? "");
          if (da !== db) return db.localeCompare(da);
          return Number(b["sequencia"] ?? 0) - Number(a["sequencia"] ?? 0);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [escopo, f, parceiroById, usuarioById],
  );

  const columns: Column[] = [
    {
      key: "numero",
      header: "Número",
      fields: ["numero"],
      render: (r) => (
        <div>
          <div className="font-semibold tabular-nums">{String(r["numero"] ?? "—")}</div>
          <div className="text-muted-foreground text-xs">
            {qtdItensPorOrcamento.get(String(rowId(r) ?? "")) ?? 0}{" "}
            {qtdItensPorOrcamento.get(String(rowId(r) ?? "")) === 1 ? "item" : "itens"}
          </div>
        </div>
      ),
    },
    {
      key: "dt_orcamento",
      header: "Data",
      fields: ["dt_orcamento"],
      render: (r) => formatDate(r["dt_orcamento"]),
    },
    {
      key: "cliente",
      header: "Cliente",
      fields: ["parceiro_id"],
      render: (r) => {
        const nome = nomeCliente(r);
        return (
          <div className="min-w-48 whitespace-normal break-words" title={nome || undefined}>
            {nome || <span className="text-muted-foreground">—</span>}
            {r["descricao"] ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="flex items-center gap-1 text-xs text-primary hover:underline">
                    <Info className="h-3 w-3" /> {tx("Ver descrição")}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="max-h-72 w-80 overflow-auto whitespace-pre-wrap text-sm">
                  {String(r["descricao"])}
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "vendedor",
      header: "Vendedor",
      fields: ["usuario_id"],
      render: (r) => {
        const n = nomeVendedor(r);
        if (!n) return <span className="text-muted-foreground">—</span>;
        return (
          <span title={n} className="grid h-7 w-7 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
            {iniciais(n)}
          </span>
        );
      },
    },
    {
      key: "validade_orcamento",
      header: "Validade",
      fields: ["validade_orcamento"],
      render: (r) => {
        const dias = daysUntil(r["validade_orcamento"]);
        const emAndamento = situacaoOf(r["situacao"]) === "Em andamento";
        return (
          <div>
            <div>{formatDate(r["validade_orcamento"])}</div>
            {emAndamento && dias !== null && (
              <div
                className={cn(
                  "text-xs",
                  dias < 0
                    ? "text-destructive font-medium"
                    : dias <= 3
                      ? "text-warning-foreground dark:text-warning"
                      : "text-muted-foreground",
                )}
              >
                {dias < 0
                  ? `Vencido há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "dia" : "dias"}`
                  : dias === 0
                    ? "Vence hoje"
                    : `Vence em ${dias} ${dias === 1 ? "dia" : "dias"}`}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "total_liquido",
      header: "Total líquido",
      fields: ["total_liquido", "total_recorrente"],
      className: "text-right",
      render: (r) => {
        const imp = Number(r["total_liquido"]) || 0;
        const rec = Number(r["total_recorrente"]) || 0;
        if (rec > 0 && imp === 0)
          return <span className="font-semibold tabular-nums">{formatBRL(rec)}<span className="text-muted-foreground text-xs font-normal">/mês</span></span>;
        return (
          <div className="flex flex-col items-end">
            <span className="font-semibold tabular-nums">{formatBRL(imp)}</span>
            {rec > 0 && <span className="text-muted-foreground text-xs tabular-nums">+ {formatBRL(rec)}/mês</span>}
          </div>
        );
      },
    },
    {
      key: "temperatura",
      header: "Temperatura",
      fields: ["temperatura", "situacao"],
      render: (r) => {
        const t = temperaturaEfetiva(r["situacao"], r["temperatura"]);
        if (!t) return <span className="text-muted-foreground">—</span>;
        return (
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", t.card)}>
            <span className={cn("h-2 w-2 rounded-full", t.dot)} />
            {t.label}
          </span>
        );
      },
    },
    {
      key: "situacao",
      header: "Situação",
      fields: ["situacao"],
      render: (r) =>
        perms.canUpdate ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${situacaoMeta(r["situacao"]).label} — alterar situação`}
                title={tx("Alterar situação")}
              >
                <SituacaoBadge value={r["situacao"]} cor={corSituacao(r)} />
                <ChevronDown className="text-muted-foreground h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {situacoes.map((s) => (
                <DropdownMenuItem
                  key={s.value}
                  disabled={normSit(r["situacao"]) === normSit(s.value) || alterarSituacao.isPending}
                  onClick={() =>
                    alterarSituacao.mutate(
                      { row: r, situacao: s.value },
                      {
                        onSuccess: () => {
                          const et = etapasKanban.find((e) => normSit(e.descricao) === normSit(s.value));
                          if (situacaoAtivada(s.value, et) && !ofertaTravada(r, etapasKanban)) setAtivar(r);
                          if (et) void executarHandoff(et.id, r, "orcamentos").then((h) => h && (h.ok ? toast.success : toast.warning)(h.msg));
                        },
                      },
                    )
                  }
                >
                  <span className={cn("mr-2 h-2.5 w-2.5 rounded-full", s.dot)} />
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <SituacaoBadge value={r["situacao"]} cor={corSituacao(r)} />
        ),
    },
  ];

  const rowMenu = (r: Row) => (
    <>
      <DropdownMenuItem onClick={() => { setPreview(r); setPreviewOpen(true); }}>
        <FileText className="h-4 w-4" /> {tx("Visualizar PDF da proposta")}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => { if (!ofertaLiberada(r["aprovacao_status"])) { avisoBloqueio(); return; } setPreview(r); setPropostaOpen(true); }}>
        <FileSignature className="h-4 w-4" /> {tx("Proposta digital e assinatura")}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => { if (!ofertaLiberada(r["aprovacao_status"])) { avisoBloqueio(); return; } setPreview(r); setMinutaOpen(true); }}>
        <ScrollText className="h-4 w-4" /> {tx("Minuta de contrato")}
      </DropdownMenuItem>
      {perms.canCreate && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => { setPreview(r); setPedidosOpen(true); }}>
            <ShoppingCart className="h-4 w-4" /> {tx("Gerar pedidos de compra")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gerarContas(r)}>
            <Wallet className="h-4 w-4" /> {tx("Gerar contas no Financeiro")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => duplicar(r)}>
            <Copy className="h-4 w-4" /> {tx("Duplicar oferta")}
          </DropdownMenuItem>
        </>
      )}
    </>
  );

  if (!perms.loading && !perms.canRead) {
    return <p className="text-muted-foreground text-sm">{tx("Você não tem acesso a esta página.")}</p>;
  }

  const baseCards = escopo.filter(
    (r) =>
      matchesAny([r["numero"], nomeCliente(r), nomeVendedor(r), r["descricao"]], f.busca) &&
      (f.vendedor === "todos" || String(pick(r, ["usuario_id", "vendedor_id"]) ?? "") === f.vendedor) &&
      (f.ano === "todos" || String(yearOf(r["dt_orcamento"]) ?? "") === f.ano),
  );
  const somar = (lista: Row[]) => lista.reduce((s, r) => s + (Number(r["total_liquido"]) || 0), 0);
  const somarRec = (lista: Row[]) => lista.reduce((s, r) => s + (Number(r["total_recorrente"]) || 0), 0);
  const cards = [
    { value: "todos", label: "Total geral", dot: "bg-foreground", lista: baseCards },
    ...situacoes.map((s) => ({
      value: s.value,
      label: s.label,
      dot: s.dot,
      lista: baseCards.filter((r) => normSit(r["situacao"]) === normSit(s.value)),
    })),
  ];

  return (
    <>
      <div className="mb-3 flex justify-end gap-2">
        <Button variant="outline" onClick={() => setLeadsOpen(true)}><Inbox className="mr-2 h-4 w-4" />{tx("Captação de leads")}</Button>
        <Button variant="outline" onClick={() => setReguaOpen(true)}><MessageCircle className="mr-2 h-4 w-4" />{tx("Régua de acompanhamento")}</Button>
        {secoes["workflow"]?.canUpdate && (
          <Button variant="outline" onClick={() => setWfOpen(true)}><ShieldCheck className="mr-2 h-4 w-4" />{tx("Workflow de aprovação")}</Button>
        )}
      </div>
      <ConfigAprovacaoOfertaDialog open={wfOpen} onOpenChange={setWfOpen} />
      <ReguaOfertas open={reguaOpen} onOpenChange={setReguaOpen} canEdit={perms.canUpdate} situacoes={situacoes.map(s => s.value)} />
      <CaptacaoLeadsDialog open={leadsOpen} onOpenChange={setLeadsOpen} canEdit={perms.canUpdate} />
      <div className="mb-4 flex gap-3 overflow-x-auto pb-1">
        {cards.map((c) => {
          const ativo = f.situacao === c.value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => setF({ ...f, situacao: ativo && c.value !== "todos" ? "todos" : c.value })}
              className={cn(
                "bg-card relative min-w-44 flex-1 overflow-hidden rounded-lg border p-3 text-left transition hover:shadow-md",
                ativo && "ring-primary ring-2",
              )}
            >
              <span className={cn("absolute inset-x-0 top-0 h-1", c.dot)} />
              <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
                <span className={cn("h-2.5 w-2.5 rounded-full", c.dot)} />
                <span className="truncate">{c.label}</span>
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{formatBRL(somar(c.lista))}</div>
              {somarRec(c.lista) > 0 && (
                <div className="text-xs font-medium tabular-nums">+ {formatBRL(somarRec(c.lista))}/mês</div>
              )}
              <div className="text-muted-foreground text-xs">
                {c.lista.length} {c.lista.length === 1 ? "oferta" : "ofertas"}
              </div>
            </button>
          );
        })}
      </div>
      <DataTable
        title={tx("Ofertas")}
        columns={columns}
        rows={rows}
        loading={isLoading}
        getValue={(row, keys) => pick(row, keys)}
        rowKey={(row, i) => String(rowId(row) ?? i)}
        onAdd={
          perms.canCreate
            ? () => {
                setRecord(null);
                setDuplicarDe(null);
                setOpen(true);
              }
            : undefined
        }
        onEdit={(row) => {
          setDuplicarDe(null);
          setRecord(row);
          setOpen(true);
        }}
        editReadOnly={!perms.canUpdate}
        rowMenu={rowMenu}
        onDelete={
          perms.canDelete
            ? (row) => {
                if (ofertaTravada(row, etapasKanban)) {
                  toast.error(tx("Ofertas em Ativação ou ganhas não podem ser excluídas."), {
                    description: "Se a negociação foi cancelada, mude a situação para Desistência/Perdida.",
                  });
                  return;
                }
                remove.mutate(row);
              }
            : undefined
        }
        selection={{ selected: sel, onChange: setSel }}
        bulkBar={
          <BarraAcoesLote
            tabela="orcamentos"
            selecionados={rows.filter((r, i) => sel.has(String(rowId(r) ?? i)))}
            totalFiltrado={rows.length}
            rotulo={(r) => `#${String(r["numero"] ?? rowId(r))} ${String(r["titulo"] ?? "")}`.trim()}
            onSelecionarTodos={() => setSel(new Set(rows.map((r, i) => String(rowId(r) ?? i))))}
            onLimpar={() => setSel(new Set())}
            acoes={[
              ...(perms.canUpdate ? TEMPERATURAS.map((t) => ({
                label: `Temperatura: ${t.label}`,
                icon: <Thermometer className="h-4 w-4" />,
                executar: (r: Row) => lote.atualizar(r, { temperatura: t.value }),
              })) : []),
              ...(perms.canDelete ? [{
                label: "Excluir", icon: <Trash2 className="h-4 w-4" />, destrutiva: true,
                confirmacao: "Excluir permanentemente {n} oferta(s)? Ofertas em Ativação ou ganhas serão mantidas.",
                executar: async (r: Row) => ofertaTravada(r, etapasKanban) ? { ok: false, mensagem: "Ativada/ganha — mantida" } : lote.excluir(r),
              }] : []),
            ]}
          />
        }
        filters={
          <>
            <FilterInput
              label="Buscar"
              value={f.busca}
              onChange={(v) => setF({ ...f, busca: v })}
              placeholder={tx("Número, cliente, vendedor ou descrição")}
            />
            <FilterSelect
              label="Situação"
              value={f.situacao}
              onChange={(v) => setF({ ...f, situacao: v })}
              options={situacaoFiltro}
            />
            <FilterSelect
              label="Vendedor"
              value={f.vendedor}
              onChange={(v) => setF({ ...f, vendedor: v })}
              options={[
                { value: "todos", label: "Todos" },
                ...vendedores
                  .map((u) => ({
                    value: String(rowId(u) ?? ""),
                    label: String(pick(u, ["nome", "email"]) ?? "—"),
                  }))
                  .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
              ]}
            />
            <FilterSelect
              label={tx("Ano")}
              value={f.ano}
              onChange={(v) => setF({ ...f, ano: v })}
              options={[
                { value: "todos", label: "Todos" },
                ...anos.map((y) => ({ value: String(y), label: String(y) })),
              ]}
            />
          </>
        }
      />

      <OrcamentoSheet
        open={open}
        onOpenChange={setOpen}
        record={record}
        linhasRecord={linhasRecord}
        saving={save.isPending}
        readOnly={record ? !perms.canUpdate : !perms.canCreate}
        secoes={secoes}
        clientes={clientes}
        vendedores={vendedores}
        itens={itensEmpresa}
        unidades={unidadesEmpresa}
        marcas={marcasEmpresa}
        vendedorPadraoId={usuarioId !== undefined ? String(usuarioId) : undefined}
        onPreview={
          record
            ? () => {
                setPreview(record);
                setPreviewOpen(true);
              }
            : undefined
        }
        duplicarDe={duplicarDe}
        onSave={({ header, linhas, manterAberto }) =>
          save.mutate(
            { header, linhas, original: record },
            {
              onSuccess: ({ id }) => {
                const antes = String(record?.["situacao"] ?? "");
                const depois = String(header["situacao"] ?? "");
                if (normSit(antes) !== normSit(depois)) {
                  const et = etapasKanban.find((e) => normSit(e.descricao) === normSit(depois));
                  const linha = { ...(record ?? {}), ...header, id } as Row;
                  if (situacaoAtivada(depois, et) && !(record && ofertaTravada(record, etapasKanban))) setAtivar(linha);
                  if (et) void executarHandoff(et.id, linha, "orcamentos").then((h) => h && (h.ok ? toast.success : toast.warning)(h.msg));
                }
                if (manterAberto) {
                  setDuplicarDe(null);
                  void manterAbertoCom(id);
                  return;
                }
                setOpen(false);
                setRecord(null);
                setDuplicarDe(null);
              },
            },
          )
        }
      />

      <OrcamentoPDF
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        orcamento={preview}
        linhas={linhasPreview}
        empresa={empresas.find((e) => String(rowId(e) ?? "") === String(preview?.["empresa_id"] ?? empresaId ?? "")) ?? empresa}
        cliente={parceiroById.get(
          String(preview ? (pick(preview, ["parceiro_id", "parceiros_id"]) ?? "") : ""),
        )}
        vendedor={usuarioById.get(
          String(preview ? (pick(preview, ["usuario_id", "vendedor_id"]) ?? "") : ""),
        )}
        itens={itens}
        unidades={unidades}
        marcas={marcas}
      />

      <GerarPedidosDialog
        open={pedidosOpen}
        onOpenChange={setPedidosOpen}
        orcamento={preview ? (todos.find((t) => rowId(t) === rowId(preview)) ?? preview) : null}
        linhas={linhasPreview}
        itens={itens}
        parceiros={parceiros}
      />

      <MinutaDialog
        open={minutaOpen}
        onOpenChange={setMinutaOpen}
        orcamento={preview ? (todos.find((t) => rowId(t) === rowId(preview)) ?? preview) : null}
        linhas={linhasPreview}
        empresa={empresas.find((e) => String(rowId(e) ?? "") === String(preview?.["empresa_id"] ?? empresaId ?? "")) ?? empresa}
        cliente={parceiroById.get(String(preview ? (pick(preview, ["parceiro_id", "parceiros_id"]) ?? "") : ""))}
        vendedor={usuarioById.get(String(preview ? (pick(preview, ["usuario_id", "vendedor_id"]) ?? "") : ""))}
        itens={itens}
      />

      <PropostaDialog
        open={propostaOpen}
        onOpenChange={setPropostaOpen}
        orcamento={preview ? (todos.find((t) => rowId(t) === rowId(preview)) ?? preview) : null}
        linhas={linhasPreview}
        empresa={empresas.find((e) => String(rowId(e) ?? "") === String(preview?.["empresa_id"] ?? empresaId ?? "")) ?? empresa}
        cliente={parceiroById.get(
          String(preview ? (pick(preview, ["parceiro_id", "parceiros_id"]) ?? "") : ""),
        )}
        vendedor={usuarioById.get(
          String(preview ? (pick(preview, ["usuario_id", "vendedor_id"]) ?? "") : ""),
        )}
        itens={itens}
        unidades={unidades}
        marcas={marcas}
      />
      <AtivacaoOfertaDialog
        open={!!ativar}
        onOpenChange={(v) => !v && setAtivarRaw(null)}
        oferta={ativar ? (todos.find((t) => rowId(t) === rowId(ativar)) ?? ativar) : null}
        cliente={ativar ? nomeCliente(ativar) : ""}
        empresaId={String(ativar?.["empresa_id"] ?? empresaId ?? "")}
      />
    </>
  );
}
