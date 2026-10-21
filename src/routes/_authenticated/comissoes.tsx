import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useComissaoConfig } from "@/hooks/useComissaoConfig";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useAudit } from "@/lib/audit";
import { comissaoDisponivel, comissaoLiberada, recebidoPorOferta, NATUREZAS_COMISSAO, REGRAS_LIBERACAO, type ParametroNatureza, type RegraLiberacao } from "@/lib/comissoes";
import { rowId, text, useTableRows } from "@/lib/crud";
import { matchesAny } from "@/lib/input-masks";
import { formatBRL, formatDate, formatPct, num, parcelasFromValue, round2 } from "@/lib/orcamentos";
import type { Natureza } from "@/lib/orcamentos";
import { pick, type Row } from "@/lib/row";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { SearchSelect } from "@/components/data-table/SearchSelect";

export const Route = createFileRoute("/_authenticated/comissoes")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Comissões — Atende.ai" },
      { name: "description", content: "Extrato e configuração de comissões de vendas, compras e integradores sobre as ofertas." },
      { property: "og:title", content: "Comissões — Atende.ai" },
      { property: "og:description", content: "Extrato e configuração de comissões de vendas, compras e integradores sobre as ofertas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ComissoesPage,
});

const NAT_LABEL: Record<string, string> = { produto: "Produto", servico: "Serviço", recorrente: "Mensal" };

function ComissoesPage() {
  const perms = usePagePermissions("/comissoes");
  if (!perms.loading && !perms.canRead) return <p className="text-muted-foreground text-sm">Você não tem acesso a esta página.</p>;
  return (
    <Tabs defaultValue="extrato" className="space-y-4">
      <TabsList>
        <TabsTrigger value="extrato">Extrato</TabsTrigger>
        <TabsTrigger value="recebimentos">Recebimentos</TabsTrigger>
        <TabsTrigger value="config">Configuração</TabsTrigger>
      </TabsList>
      <TabsContent value="extrato"><Extrato canUpdate={perms.canUpdate} canDelete={perms.canDelete} /></TabsContent>
      <TabsContent value="recebimentos"><Recebimentos canEdit={perms.canUpdate} /></TabsContent>
      <TabsContent value="config"><Configuracao canEdit={perms.canUpdate || perms.canCreate} /></TabsContent>
    </Tabs>
  );
}

function Extrato({ canUpdate, canDelete }: { canUpdate: boolean; canDelete: boolean }) {
  const qc = useQueryClient();
  const { data: rowsDb = [], isLoading } = useTableRows("orcamento_comissoes");
  const { data: orcs = [] } = useTableRows("orcamentos");
  const { data: usuarios = [] } = useTableRows("usuarios");
  const [f, setF] = useState({ busca: "", status: "todos", benef: "todos" });
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [visao, setVisao] = useState<"benef" | "detalhe">("benef");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const orcById = useMemo(() => new Map(orcs.map((o) => [text(rowId(o)), o])), [orcs]);
  const userById = useMemo(() => new Map(usuarios.map((u) => [text(rowId(u)), u])), [usuarios]);

  const rows = useMemo(
    () =>
      rowsDb
        .filter((r) => {
          const orc = orcById.get(text(r["orcamento_id"]));
          const u = userById.get(text(r["beneficiario_id"]));
          return (
            matchesAny([orc?.["numero"], r["papel_nome"], u?.["nome"]], f.busca) &&
            (f.status === "todos" || r["status"] === f.status) &&
            (f.benef === "todos" || text(r["beneficiario_id"]) === f.benef)
          );
        })
        .sort((a, b) => text(b["created_at"]).localeCompare(text(a["created_at"]))),
    [rowsDb, orcById, userById, f],
  );
  const { data: recebs = [] } = useTableRows("orcamento_recebimentos");
  const { liberacao, entradaPct } = useComissaoConfig();
  const { data: titulos = [] } = useTableRows("financeiro_titulos");
  const recebidoPorOrc = useMemo(() => recebidoPorOferta(titulos, recebs), [titulos, recebs]);
  const calc = (r: Row) => {
    const orc = orcById.get(text(r["orcamento_id"]));
    const parcelas = parcelasFromValue(orc?.["parcelas"]);
    const totalOferta = parcelas.length ? parcelas.reduce((t, p) => t + p.valor, 0) : num(orc?.["total_liquido"]);
    const recebido = recebidoPorOrc.get(text(r["orcamento_id"])) ?? 0;
    const valor = num(r["valor"]);
    const pago = Math.min(valor, num(r["valor_pago"]) || (r["status"] === "paga" ? valor : 0));
    const liberado = Math.max(pago, comissaoLiberada({ comissao: valor, totalOferta, recebido, regra: liberacao, entradaPct }));
    return { valor, pago, liberado, disponivel: comissaoDisponivel(liberado, pago), aguardando: round2(valor - liberado) };
  };
  const soma = (k: "aguardando" | "disponivel" | "pago") => rows.reduce((t, r) => t + calc(r)[k], 0);

  /** Fundo/reserva: o pagamento vira um aporte no Contas a Pagar, na conta de aplicação do fundo. */
  const lancarAporte = async (r: Row, valor: number, hoje: string) => {
    if (r["beneficiario_id"]) return null;
    const orc = orcById.get(text(r["orcamento_id"]));
    const { error } = await supabase.from("financeiro_titulos").insert({
      tipo: "pagar", empresa_id: r["empresa_id"], origem_tipo: "manual",
      descricao: `Aporte ${text(r["papel_nome"])} — Oferta ${text(orc?.["numero"])}`.trim(),
      categoria: "Aplicação / Fundos", conta_bancaria_id: r["conta_bancaria_id"] ?? null,
      data_competencia: hoje, vencimento: hoje, valor, valor_pago: valor, pago_em: hoje, status: "pago",
    } as never);
    return error;
  };

  const pagar = async (r: Row) => {
    const c = calc(r);
    if (c.disponivel <= 0) return;
    if (!await confirmar(`Registrar pagamento de ${formatBRL(c.disponivel)}?`)) return;
    const novoPago = round2(c.pago + c.disponivel);
    const status = novoPago >= c.valor ? "paga" : "a_pagar";
    const errAporte = await lancarAporte(r, c.disponivel, new Date().toISOString().slice(0, 10));
    if (errAporte) return void toast.error(errAporte.message);
    const { error } = await supabase
      .from("orcamento_comissoes")
      .update({ valor_pago: novoPago, status, pago_em: new Date().toISOString().slice(0, 10) } as never)
      .eq("id", text(rowId(r)));
    if (error) return void toast.error(error.message);
    toast.success("Pagamento registrado.");
    qc.invalidateQueries({ queryKey: ["table", "orcamento_comissoes"] });
  };

  const excluir = async (r: Row) => {
    if (!await confirmar("Excluir este registro de comissão?")) return;
    const { error } = await supabase.from("orcamento_comissoes").delete().eq("id", text(rowId(r)));
    if (error) return void toast.error(error.message);
    toast.success("Comissão excluída.");
    qc.invalidateQueries({ queryKey: ["table", "orcamento_comissoes"] });
  };

  const columns: Column[] = [
    { key: "oferta", header: "Oferta", fields: [], render: (r) => <span className="font-semibold tabular-nums">{text(orcById.get(text(r["orcamento_id"]))?.["numero"]) || "—"}</span> },
    { key: "data", header: "Data", fields: ["created_at"], render: (r) => formatDate(r["created_at"]) },
    { key: "papel", header: "Papel", fields: ["papel_nome"] },
    { key: "benef", header: "Beneficiário", fields: [], render: (r) => text(pick(userById.get(text(r["beneficiario_id"])) ?? {}, ["nome", "email"])) || (r["beneficiario_id"] ? "—" : `Fundo: ${text(r["papel_nome"])}`) },
    { key: "nat", header: "Natureza", fields: ["natureza"], render: (r) => NAT_LABEL[text(r["natureza"])] ?? "—" },
    { key: "base", header: "Base", fields: ["base_valor"], render: (r) => formatBRL(r["base_valor"]) },
    { key: "pct", header: "%", fields: ["pct"], render: (r) => formatPct(r["pct"]) },
    { key: "valor", header: "Comissão", fields: ["valor"], render: (r) => <span className="font-semibold">{formatBRL(r["valor"])}</span> },
    { key: "liberado", header: "Liberado", fields: [], render: (r) => formatBRL(calc(r).liberado) },
    { key: "pago", header: "Pago", fields: [], render: (r) => formatBRL(calc(r).pago) },
    {
      key: "disp", header: "Pode pagar agora", fields: [],
      render: (r) => {
        const c = calc(r);
        if (c.pago >= c.valor) return <span className="text-success text-sm font-medium">Quitada</span>;
        return (
          <div className="flex items-center gap-2">
            <span className="font-semibold tabular-nums">{formatBRL(c.disponivel)}</span>
            {canUpdate && c.disponivel > 0 && (
              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); void pagar(r); }}>Pagar</Button>
            )}
          </div>
        );
      },
    },
    ...(canDelete
      ? [{
          key: "acoes", header: "", fields: [],
          render: (r: Row) => (
            <Button
              size="icon"
              variant="ghost"
              title={r["status"] === "paga" ? "Comissão paga não pode ser excluída" : "Excluir"}
              disabled={r["status"] === "paga"}
              onClick={(e) => { e.stopPropagation(); void excluir(r); }}
            >
              <Trash2 className="text-destructive h-4 w-4" />
            </Button>
          ),
        } as Column]
      : []),
  ];

  const meses = Array.from(new Set(rowsDb.map((r) => text(r["created_at"]).slice(0, 7)).filter(Boolean))).sort().reverse();
  const doMes = rows.filter((r) => mes === "todos" || text(r["created_at"]).slice(0, 7) === mes);
  const somaMes = (k: "aguardando" | "disponivel" | "pago") => doMes.reduce((t, r) => t + calc(r)[k], 0);
  const nomeMes = (m: string) => {
    const [a = 0, mm = 1] = m.split("-").map(Number);
    const s = new Date(a, mm - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const idxMes = meses.indexOf(mes);
  const grupos = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of doMes) {
      const k = text(r["beneficiario_id"]) || "—";
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()]
      .map(([id, itens]) => ({
        id, itens,
        nome: text(pick(userById.get(id) ?? {}, ["nome", "email"])) || "Sem beneficiário",
        valor: itens.reduce((t, r) => t + calc(r).valor, 0),
        liberado: itens.reduce((t, r) => t + calc(r).liberado, 0),
        pago: itens.reduce((t, r) => t + calc(r).pago, 0),
        disponivel: itens.reduce((t, r) => t + calc(r).disponivel, 0),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doMes, userById, recebidoPorOrc, liberacao, entradaPct]);

  const pagarLote = async (g: { nome: string; itens: Row[]; disponivel: number }) => {
    if (g.disponivel <= 0) return;
    if (!await confirmar(`Registrar pagamento de ${formatBRL(g.disponivel)} para ${g.nome}?`)) return;
    const hoje = new Date().toISOString().slice(0, 10);
    for (const r of g.itens) {
      const c = calc(r);
      if (c.disponivel <= 0) continue;
      const novoPago = round2(c.pago + c.disponivel);
      const errAporte = await lancarAporte(r, c.disponivel, hoje);
      if (errAporte) return void toast.error(errAporte.message);
      const { error } = await supabase
        .from("orcamento_comissoes")
        .update({ valor_pago: novoPago, status: novoPago >= c.valor ? "paga" : "a_pagar", pago_em: hoje } as never)
        .eq("id", text(rowId(r)));
      if (error) return void toast.error(error.message);
    }
    toast.success("Pagamento registrado.");
    qc.invalidateQueries({ queryKey: ["table", "orcamento_comissoes"] });
  };

  const filtros = (
    <>
      <FilterInput label="Buscar" value={f.busca} onChange={(v) => setF({ ...f, busca: v })} placeholder="Oferta, papel ou beneficiário" />
      <FilterSelect label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[{ value: "todos", label: "Todos" }, { value: "prevista", label: "Prevista" }, { value: "a_pagar", label: "Paga em parte" }, { value: "paga", label: "Quitada" }]} />
      <FilterSelect
        label="Beneficiário"
        value={f.benef}
        onChange={(v) => setF({ ...f, benef: v })}
        options={[{ value: "todos", label: "Todos" }, ...usuarios.map((u) => ({ value: text(rowId(u)), label: text(pick(u, ["nome", "email"])) }))]}
      />
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon" variant="outline" aria-label="Mês anterior" disabled={mes === "todos" ? !meses.length : idxMes >= meses.length - 1}
          onClick={() => setMes(mes === "todos" ? (meses[0] ?? "todos") : meses[idxMes + 1] ?? mes)}><ChevronLeft className="h-4 w-4" /></Button>
        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os meses</SelectItem>
            {meses.map((m) => <SelectItem key={m} value={m}>{nomeMes(m)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="icon" variant="outline" aria-label="Próximo mês" disabled={mes === "todos" || idxMes <= 0}
          onClick={() => setMes(meses[idxMes - 1] ?? mes)}><ChevronRight className="h-4 w-4" /></Button>
        <Tabs value={visao} onValueChange={(v) => setVisao(v as "benef" | "detalhe")} className="ml-auto">
          <TabsList>
            <TabsTrigger value="benef">Por beneficiário</TabsTrigger>
            <TabsTrigger value="detalhe">Detalhada</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {([
          ["aguardando", "Aguardando o cliente pagar"],
          ["disponivel", "Pode pagar agora"],
          ["pago", "Já pago"],
        ] as const).map(([k, label]) => (
          <div key={k} className="rounded-lg border p-3">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className="text-lg font-semibold tabular-nums">{formatBRL(somaMes(k))}</div>
          </div>
        ))}
      </div>
      {visao === "detalhe" ? (
        <DataTable
          title="Extrato de Comissões"
          columns={columns}
          rows={doMes}
          loading={isLoading}
          getValue={(row, keys) => pick(row, keys)}
          rowKey={(row, i) => String(rowId(row) ?? i)}
          filters={filtros}
        />
      ) : (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Comissões por beneficiário</h2>
          <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">{filtros}</div>
          {isLoading && <p className="text-muted-foreground text-sm">Carregando…</p>}
          {!isLoading && grupos.length === 0 && <p className="text-muted-foreground text-sm">Nenhuma comissão neste período.</p>}
          {grupos.map((g) => {
            const aberto = abertos.has(g.id);
            return (
              <div key={g.id} className="rounded-lg border">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 p-3">
                  <button type="button" className="flex min-w-48 items-center gap-2 text-left font-semibold"
                    onClick={() => setAbertos((s) => { const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })}>
                    <ChevronDown className={`h-4 w-4 transition-transform ${aberto ? "" : "-rotate-90"}`} />
                    {g.nome}
                    <span className="text-muted-foreground text-xs font-normal">({g.itens.length})</span>
                  </button>
                  {([["Comissão", g.valor], ["Liberado", g.liberado], ["Pago", g.pago], ["Pode pagar agora", g.disponivel]] as const).map(([l, v]) => (
                    <div key={l}><div className="text-muted-foreground text-xs">{l}</div><div className="font-semibold tabular-nums">{formatBRL(v)}</div></div>
                  ))}
                  <div className="ml-auto">
                    {g.pago >= g.valor && g.valor > 0 ? (
                      <span className="text-success text-sm font-medium">Quitado</span>
                    ) : canUpdate && g.disponivel > 0 ? (
                      <Button size="sm" onClick={() => void pagarLote(g)}>Pagar liberado ({formatBRL(g.disponivel)})</Button>
                    ) : null}
                  </div>
                </div>
                {aberto && (
                  <div className="overflow-x-auto border-t">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-left">
                        <tr>{["Oferta", "Data", "Papel", "Natureza", "Base", "%", "Comissão", "Liberado", "Pago", "Pode pagar"].map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {g.itens.map((r) => {
                          const c = calc(r);
                          return (
                            <tr key={text(rowId(r))} className="border-t">
                              <td className="p-2 font-semibold tabular-nums">{text(orcById.get(text(r["orcamento_id"]))?.["numero"]) || "—"}</td>
                              <td className="p-2">{formatDate(r["created_at"])}</td>
                              <td className="p-2">{text(r["papel_nome"])}</td>
                              <td className="p-2">{NAT_LABEL[text(r["natureza"])] ?? "—"}</td>
                              <td className="p-2 tabular-nums">{formatBRL(r["base_valor"])}</td>
                              <td className="p-2">{formatPct(r["pct"])}</td>
                              <td className="p-2 font-semibold tabular-nums">{formatBRL(c.valor)}</td>
                              <td className="p-2 tabular-nums">{formatBRL(c.liberado)}</td>
                              <td className="p-2 tabular-nums">{formatBRL(c.pago)}</td>
                              <td className="p-2 tabular-nums">{c.pago >= c.valor ? <span className="text-success">Quitada</span> : formatBRL(c.disponivel)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type PapelEdit = { id?: string; nome: string; ativo: boolean; ordem: number; pct_produto: string; pct_servico: string; pct_recorrente: string; tipo?: "pessoa" | "fundo"; conta_bancaria_id?: string };

function Configuracao({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { empresaId } = useAudit();
  const { parametros, paramRows, papelRows, loading, liberacao, entradaPct } = useComissaoConfig();
  const [params, setParams] = useState<Record<Natureza, ParametroNatureza>>(parametros);
  const [regra, setRegra] = useState<RegraLiberacao>(liberacao);
  const [entrada, setEntrada] = useState(String(entradaPct));
  useEffect(() => { setRegra(liberacao); setEntrada(String(entradaPct)); }, [liberacao, entradaPct]);
  const [papeis, setPapeis] = useState<PapelEdit[]>([]);
  const [removidos, setRemovidos] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const { data: contasBanc = [] } = useTableRows("financeiro_contas_bancarias");
  const contaOptions = useMemo(() => contasBanc
    .map((c) => ({ value: text(rowId(c)), label: text(pick(c, ["descricao", "nome", "apelido", "banco"])) || "Conta" }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")), [contasBanc]);

  useEffect(() => setParams(parametros), [parametros]);
  useEffect(() => {
    setPapeis(
      papelRows.map((r) => ({
        id: text(rowId(r)), nome: text(r["nome"]), ativo: r["ativo"] !== false, ordem: num(r["ordem"]),
        pct_produto: text(r["pct_produto"] ?? 0), pct_servico: text(r["pct_servico"] ?? 0), pct_recorrente: text(r["pct_recorrente"] ?? 0),
        tipo: r["tipo"] === "fundo" ? "fundo" : "pessoa", conta_bancaria_id: text(r["conta_bancaria_id"]),
      })),
    );
    setRemovidos([]);
  }, [papelRows]);

  const padrao = () =>
    setPapeis([
      { nome: "Vendas", ativo: true, ordem: 1, pct_produto: "5", pct_servico: "15", pct_recorrente: "15" },
      { nome: "Compras", ativo: true, ordem: 2, pct_produto: "5", pct_servico: "15", pct_recorrente: "15" },
      { nome: "Integrador", ativo: true, ordem: 3, pct_produto: "0.5", pct_servico: "1", pct_recorrente: "1" },
    ]);

  const salvar = async () => {
    if (!empresaId) return void toast.error("Selecione a empresa.");
    if (papeis.some((p) => !p.nome.trim())) return void toast.error("Informe o nome de todos os papéis.");
    setSalvando(true);
    try {
      const existentes = new Map(paramRows.map((r) => [text(r["natureza"]), text(rowId(r))]));
      for (const { value } of NATUREZAS_COMISSAO) {
        const p = params[value];
        const payload = { empresa_id: empresaId, natureza: value, imposto_pct: p.imposto_pct, outros_custos_pct: p.outros_custos_pct, base: p.base, liberacao: regra, entrada_pct: Math.min(100, Math.max(0, num(entrada))) };
        const id = existentes.get(value);
        const { error } = id
          ? await supabase.from("comissao_parametros").update(payload as never).eq("id", id)
          : await supabase.from("comissao_parametros").insert(payload as never);
        if (error) throw error;
      }
      for (const id of removidos) {
        const { error } = await supabase.from("comissao_papeis").delete().eq("id", id);
        if (error) throw error;
      }
      for (const [i, p] of papeis.entries()) {
        const payload = {
          empresa_id: empresaId, nome: p.nome.trim(), ativo: p.ativo, ordem: i + 1,
          pct_produto: num(p.pct_produto), pct_servico: num(p.pct_servico), pct_recorrente: num(p.pct_recorrente),
          tipo: p.tipo ?? "pessoa", conta_bancaria_id: p.tipo === "fundo" && p.conta_bancaria_id ? p.conta_bancaria_id : null,
        };
        const { error } = p.id
          ? await supabase.from("comissao_papeis").update(payload as never).eq("id", p.id)
          : await supabase.from("comissao_papeis").insert(payload as never);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["table", "comissao_parametros"] });
      qc.invalidateQueries({ queryKey: ["table", "comissao_papeis"] });
      toast.success("Configuração de comissões salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  if (loading) return <p className="text-muted-foreground text-sm">Carregando…</p>;

  const setP = (n: Natureza, patch: Partial<ParametroNatureza>) => setParams((s) => ({ ...s, [n]: { ...s[n], ...patch } }));
  const setPapel = (i: number, patch: Partial<PapelEdit>) => setPapeis((s) => s.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <fieldset disabled={!canEdit} className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-semibold">Parâmetros por natureza</h2>
        <p className="text-muted-foreground text-sm">Líquido = Venda − Compra − Imposto − Outros custos. As comissões incidem sobre o líquido ou sobre a venda bruta.</p>
        <div className="grid gap-3 md:grid-cols-3">
          {NATUREZAS_COMISSAO.map(({ value, label }) => (
            <div key={value} className="space-y-2 rounded-lg border p-3">
              <div className="font-medium">{label}</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label className="text-xs">Imposto %</Label>
                  <Input type="number" step="0.01" value={params[value].imposto_pct} onChange={(e) => setP(value, { imposto_pct: num(e.target.value) })} /></div>
                <div className="space-y-1"><Label className="text-xs">Outros custos %</Label>
                  <Input type="number" step="0.01" value={params[value].outros_custos_pct} onChange={(e) => setP(value, { outros_custos_pct: num(e.target.value) })} /></div>
              </div>
              <div className="space-y-1"><Label className="text-xs">Base da comissão</Label>
                <Select value={params[value].base} onValueChange={(v) => setP(value, { base: v as "liquido" | "bruto" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="liquido">Sobre o líquido</SelectItem>
                    <SelectItem value="bruto">Sobre a venda bruta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Quando pagar a comissão</h2>
        <p className="text-muted-foreground text-sm">
          Com "Conforme o cliente paga", a comissão é liberada na mesma proporção do que entrou no caixa. Ex.: oferta de R$ 10.000 em 10x e comissão de R$ 1.500 — cada parcela paga libera R$ 150. A entrada libera uma parte já no fechamento.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1"><Label className="text-xs">Regra</Label>
            <Select value={regra} onValueChange={(v) => setRegra(v as RegraLiberacao)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{REGRAS_LIBERACAO.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {regra === "recebimento" && (
            <div className="space-y-1"><Label className="text-xs">Entrada no fechamento (% da comissão)</Label>
              <Input type="number" step="1" min="0" max="100" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Papéis comissionados</h2>
          {papeis.length === 0 && <Button variant="outline" size="sm" onClick={padrao} className="ml-auto">Usar padrão (Vendas, Compras, Integrador)</Button>}
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr><th className="p-2">Papel</th><th className="p-2">Produto %</th><th className="p-2">Serviço %</th><th className="p-2">Mensal %</th><th className="p-2">Tipo</th><th className="p-2">Conta de aplicação</th><th className="p-2">Ativo</th><th className="p-2" /></tr>
            </thead>
            <tbody>
              {papeis.map((p, i) => (
                <tr key={p.id ?? `n${i}`} className="border-t">
                  <td className="p-2"><Input value={p.nome} onChange={(e) => setPapel(i, { nome: e.target.value })} placeholder="Ex.: Vendas" /></td>
                  <td className="p-2"><Input type="number" step="0.01" className="w-24" value={p.pct_produto} onChange={(e) => setPapel(i, { pct_produto: e.target.value })} /></td>
                  <td className="p-2"><Input type="number" step="0.01" className="w-24" value={p.pct_servico} onChange={(e) => setPapel(i, { pct_servico: e.target.value })} /></td>
                  <td className="p-2"><Input type="number" step="0.01" className="w-24" value={p.pct_recorrente} onChange={(e) => setPapel(i, { pct_recorrente: e.target.value })} /></td>
                  <td className="p-2">
                    <Select value={p.tipo ?? "pessoa"} onValueChange={(v) => setPapel(i, { tipo: v as "pessoa" | "fundo" })}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fundo">Fundo / Reserva</SelectItem>
                        <SelectItem value="pessoa">Pessoa / Colaborador</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2">
                    {p.tipo === "fundo" ? (
                      <SearchSelect value={p.conta_bancaria_id ?? ""} onChange={(v) => setPapel(i, { conta_bancaria_id: v })} placeholder="Selecione"
                        searchPlaceholder="Pesquisar…" options={contaOptions} />
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="p-2"><Switch checked={p.ativo} onCheckedChange={(v) => setPapel(i, { ativo: v })} /></td>
                  <td className="p-2">
                    <Button variant="ghost" size="icon" aria-label="Remover papel" onClick={() => { if (p.id) setRemovidos((r) => [...r, p.id!]); setPapeis((s) => s.filter((_, j) => j !== i)); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button variant="outline" size="sm" onClick={() => setPapeis((s) => [...s, { nome: "", ativo: true, ordem: s.length + 1, pct_produto: "0", pct_servico: "0", pct_recorrente: "0" }])}>
          <Plus className="mr-1 h-4 w-4" /> Adicionar papel
        </Button>
      </section>

      <div className="bg-background sticky bottom-0 flex justify-end gap-2 border-t py-3">
        <Button variant="outline" onClick={() => { setParams(parametros); setRemovidos([]); qc.invalidateQueries({ queryKey: ["table", "comissao_papeis"] }); }}>Cancelar</Button>
        <Button onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
      </div>
    </fieldset>
  );
}

/* ---------------- Recebimentos ---------------- */
function Recebimentos({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { empresaId } = useAudit();
  const { data: comissoes = [] } = useTableRows("orcamento_comissoes");
  const { data: orcs = [] } = useTableRows("orcamentos");
  const { data: recebs = [], isError } = useTableRows("orcamento_recebimentos");
  const { data: titulos = [] } = useTableRows("financeiro_titulos");
  const titMap = useMemo(() => {
    const m = new Map<string, Row>();
    for (const t of titulos) if (t["tipo"] === "receber" && t["origem_tipo"] === "oferta" && t["origem_id"]) m.set(`${text(t["origem_id"])}:${num(t["parcela_n"])}`, t);
    return m;
  }, [titulos]);
  const ofertasComTitulo = useMemo(() => new Set([...titMap.keys()].map((k) => k.split(":")[0])), [titMap]);
  const [busca, setBusca] = useState("");
  const comComissao = useMemo(() => new Set(comissoes.map((c) => text(c["orcamento_id"]))), [comissoes]);
  const ofertas = useMemo(
    () =>
      orcs
        .filter((o) => comComissao.has(text(rowId(o))) && matchesAny([o["numero"], o["descricao"]], busca))
        .sort((a, b) => text(b["dt_orcamento"]).localeCompare(text(a["dt_orcamento"]))),
    [orcs, comComissao, busca],
  );
  const recebMap = useMemo(() => new Map(recebs.map((r) => [`${text(r["orcamento_id"])}:${num(r["parcela_numero"])}`, r])), [recebs]);

  const marcar = async (orc: Row, numero: number, valor: number, pago: boolean) => {
    const oid = text(rowId(orc));
    const existente = recebMap.get(`${oid}:${numero}`);
    const { error } = pago
      ? await supabase.from("orcamento_recebimentos").insert({ empresa_id: orc["empresa_id"] ?? empresaId, orcamento_id: oid, parcela_numero: numero, valor } as never)
      : await supabase.from("orcamento_recebimentos").delete().eq("id", text(rowId(existente ?? {})));
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["table", "orcamento_recebimentos"] });
  };

  if (isError) return <p className="text-muted-foreground text-sm">Rode o script de recebimentos no banco para usar esta aba.</p>;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">As parcelas ficam recebidas automaticamente quando o título é baixado no Financeiro, e a comissão é liberada no Extrato na mesma proporção. Ofertas sem títulos no Financeiro podem ser marcadas aqui.</p>
      <div className="max-w-sm"><FilterInput label="Buscar" value={busca} onChange={setBusca} placeholder="Número ou descrição da oferta" /></div>
      {ofertas.length === 0 && <p className="text-muted-foreground text-sm">Nenhuma oferta com comissão registrada.</p>}
      {ofertas.map((o) => {
        const parcelas = parcelasFromValue(o["parcelas"]);
        const lista = parcelas.length ? parcelas : [{ numero: 1, vencimento: text(o["dt_orcamento"]), valor: num(o["total_liquido"]) }];
        const total = lista.reduce((t, p) => t + p.valor, 0);
        const oid = text(rowId(o));
        const viaFin = ofertasComTitulo.has(oid);
        const recebeu = (n: number) => (viaFin ? titMap.get(`${oid}:${n}`)?.["status"] === "pago" : recebMap.has(`${oid}:${n}`));
        const recebido = lista.reduce((t, p) => t + (recebeu(p.numero) ? p.valor : 0), 0);
        return (
          <div key={text(rowId(o))} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold tabular-nums">{text(o["numero"]) || "—"}</span>
              <span className="text-muted-foreground truncate text-sm">{text(o["descricao"])}</span>
              {viaFin && <span className="bg-success/15 text-success rounded px-2 py-0.5 text-xs">Pelo Financeiro</span>}
              <span className="ml-auto text-sm tabular-nums">Recebido {formatBRL(recebido)} de {formatBRL(total)}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {lista.map((p) => {
                const ok = recebeu(p.numero);
                return (
                  <label key={p.numero} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium">{p.numero}ª</span> · {formatDate(p.vencimento)}
                      <span className="block tabular-nums">{formatBRL(p.valor)}</span>
                    </span>
                    <Switch checked={ok} disabled={!canEdit || viaFin} onCheckedChange={(v) => void marcar(o, p.numero, p.valor, v)} aria-label={`Parcela ${p.numero} recebida`} />
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
