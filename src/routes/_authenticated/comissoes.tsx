import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
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
import { NATUREZAS_COMISSAO, STATUS_COMISSAO, type ParametroNatureza } from "@/lib/comissoes";
import { rowId, text, useTableRows } from "@/lib/crud";
import { matchesAny } from "@/lib/input-masks";
import { formatBRL, formatDate, formatPct, num } from "@/lib/orcamentos";
import type { Natureza } from "@/lib/orcamentos";
import { pick, type Row } from "@/lib/row";

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
        <TabsTrigger value="config">Configuração</TabsTrigger>
      </TabsList>
      <TabsContent value="extrato"><Extrato canUpdate={perms.canUpdate} canDelete={perms.canDelete} /></TabsContent>
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
  const total = (s: string) => rows.filter((r) => s === "todos" || r["status"] === s).reduce((t, r) => t + num(r["valor"]), 0);

  const setStatus = async (r: Row, status: string) => {
    const { error } = await supabase
      .from("orcamento_comissoes")
      .update({ status, pago_em: status === "paga" ? new Date().toISOString().slice(0, 10) : null } as never)
      .eq("id", text(rowId(r)));
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["table", "orcamento_comissoes"] });
  };

  const excluir = async (r: Row) => {
    if (!window.confirm("Excluir este registro de comissão?")) return;
    const { error } = await supabase.from("orcamento_comissoes").delete().eq("id", text(rowId(r)));
    if (error) return void toast.error(error.message);
    toast.success("Comissão excluída.");
    qc.invalidateQueries({ queryKey: ["table", "orcamento_comissoes"] });
  };

  const columns: Column[] = [
    { key: "oferta", header: "Oferta", fields: [], render: (r) => <span className="font-semibold tabular-nums">{text(orcById.get(text(r["orcamento_id"]))?.["numero"]) || "—"}</span> },
    { key: "data", header: "Data", fields: ["created_at"], render: (r) => formatDate(r["created_at"]) },
    { key: "papel", header: "Papel", fields: ["papel_nome"] },
    { key: "benef", header: "Beneficiário", fields: [], render: (r) => text(pick(userById.get(text(r["beneficiario_id"])) ?? {}, ["nome", "email"])) || "—" },
    { key: "nat", header: "Natureza", fields: ["natureza"], render: (r) => NAT_LABEL[text(r["natureza"])] ?? "—" },
    { key: "base", header: "Base", fields: ["base_valor"], render: (r) => formatBRL(r["base_valor"]) },
    { key: "pct", header: "%", fields: ["pct"], render: (r) => formatPct(r["pct"]) },
    { key: "valor", header: "Comissão", fields: ["valor"], render: (r) => <span className="font-semibold">{formatBRL(r["valor"])}</span> },
    {
      key: "status", header: "Status", fields: ["status"],
      render: (r) => (
        <Select value={text(r["status"])} onValueChange={(v) => void setStatus(r, v)} disabled={!canUpdate}>
          <SelectTrigger className="h-8 w-28" onClick={(e) => e.stopPropagation()}><SelectValue /></SelectTrigger>
          <SelectContent>{STATUS_COMISSAO.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
      ),
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

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {STATUS_COMISSAO.map((s) => (
          <div key={s.value} className="rounded-lg border p-3">
            <div className="text-muted-foreground text-xs">{s.label}</div>
            <div className="text-lg font-semibold tabular-nums">{formatBRL(total(s.value))}</div>
          </div>
        ))}
      </div>
      <DataTable
        title="Extrato de Comissões"
        columns={columns}
        rows={rows}
        loading={isLoading}
        getValue={(row, keys) => pick(row, keys)}
        rowKey={(row, i) => String(rowId(row) ?? i)}
        filters={
          <>
            <FilterInput label="Buscar" value={f.busca} onChange={(v) => setF({ ...f, busca: v })} placeholder="Oferta, papel ou beneficiário" />
            <FilterSelect label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[{ value: "todos", label: "Todos" }, ...STATUS_COMISSAO]} />
            <FilterSelect
              label="Beneficiário"
              value={f.benef}
              onChange={(v) => setF({ ...f, benef: v })}
              options={[{ value: "todos", label: "Todos" }, ...usuarios.map((u) => ({ value: text(rowId(u)), label: text(pick(u, ["nome", "email"])) }))]}
            />
          </>
        }
      />
    </div>
  );
}

type PapelEdit = { id?: string; nome: string; ativo: boolean; ordem: number; pct_produto: string; pct_servico: string; pct_recorrente: string };

function Configuracao({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { empresaId } = useAudit();
  const { parametros, paramRows, papelRows, loading } = useComissaoConfig();
  const [params, setParams] = useState<Record<Natureza, ParametroNatureza>>(parametros);
  const [papeis, setPapeis] = useState<PapelEdit[]>([]);
  const [removidos, setRemovidos] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => setParams(parametros), [parametros]);
  useEffect(() => {
    setPapeis(
      papelRows.map((r) => ({
        id: text(rowId(r)), nome: text(r["nome"]), ativo: r["ativo"] !== false, ordem: num(r["ordem"]),
        pct_produto: text(r["pct_produto"] ?? 0), pct_servico: text(r["pct_servico"] ?? 0), pct_recorrente: text(r["pct_recorrente"] ?? 0),
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
        const payload = { empresa_id: empresaId, natureza: value, imposto_pct: p.imposto_pct, outros_custos_pct: p.outros_custos_pct, base: p.base };
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
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Papéis comissionados</h2>
          {papeis.length === 0 && <Button variant="outline" size="sm" onClick={padrao} className="ml-auto">Usar padrão (Vendas, Compras, Integrador)</Button>}
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr><th className="p-2">Papel</th><th className="p-2">Produto %</th><th className="p-2">Serviço %</th><th className="p-2">Mensal %</th><th className="p-2">Ativo</th><th className="p-2" /></tr>
            </thead>
            <tbody>
              {papeis.map((p, i) => (
                <tr key={p.id ?? `n${i}`} className="border-t">
                  <td className="p-2"><Input value={p.nome} onChange={(e) => setPapel(i, { nome: e.target.value })} placeholder="Ex.: Vendas" /></td>
                  <td className="p-2"><Input type="number" step="0.01" className="w-24" value={p.pct_produto} onChange={(e) => setPapel(i, { pct_produto: e.target.value })} /></td>
                  <td className="p-2"><Input type="number" step="0.01" className="w-24" value={p.pct_servico} onChange={(e) => setPapel(i, { pct_servico: e.target.value })} /></td>
                  <td className="p-2"><Input type="number" step="0.01" className="w-24" value={p.pct_recorrente} onChange={(e) => setPapel(i, { pct_recorrente: e.target.value })} /></td>
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
