import { lazy, Suspense, useMemo, useState } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { coordenadas, LEGENDA_PINS } from "@/lib/parceiros-mapa";

const ParceirosMapa = lazy(() => import("@/components/parceiros/ParceirosMapa"));
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { PARENT_KEY, ParceiroSheet, TIPOS_HIERARQUIA, tipoHierarquiaLabel } from "@/components/parceiros/ParceiroSheet";
import { rowId, useDeleteRecord, useSaveRecord, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useAudit } from "@/lib/audit";
import { caminhoClassificacao, useClassificacoes } from "@/components/parceiros/ClassificacaoField";
import { formatCpfCnpj, formatPhoneDisplay, matchesAny } from "@/lib/input-masks";
import { Ban, Building2, CheckCircle2, List, Map as MapIcon, MapPin, MessageCircle, Trash2, Upload } from "lucide-react";
import { BarraAcoesLote, consultarCnpjReceita, geolocalizarRegistro, useAcoesComuns } from "@/components/data-table/AcoesLote";
import { Button } from "@/components/ui/button";
import { ImportarParceirosDialog } from "@/components/parceiros/ImportarParceirosDialog";

export const Route = createFileRoute("/_authenticated/parceiros")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Parceiros de Negócios — Atende.ai" },
      { name: "description", content: "Cadastro de clientes e fornecedores para financeiro e faturamento." },
      { property: "og:title", content: "Parceiros de Negócios — Atende.ai" },
      { property: "og:description", content: "Cadastro de clientes e fornecedores para financeiro e faturamento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ParceirosPage,
});

function ParceirosPage() {
  const { data: all = [], isLoading } = useTableRows("parceiros");
  const save = useSaveRecord("parceiros");
  const remove = useDeleteRecord("parceiros");
  const perms = usePagePermissions("/parceiros");
  const { empresaId, stamp } = useAudit();
  const { data: classificacoes = [] } = useClassificacoes();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const lote = useAcoesComuns("parceiros");
  const [open, setOpen] = useState(false);
  const [impOpen, setImpOpen] = useState(false);
  const [visao, setVisao] = useState<"tabela" | "mapa">("tabela");
  const [mf, setMf] = useState({ papel: "todos", uf: "todos", cidade: "todos" });
  const [record, setRecord] = useState<Row | null>(null);
  const [f, setF] = useState({ busca: "", papel: "todos", status: "todos", situacao: "todos", estrutura: "todos", pai: "todos", classificacao: "todos" });

  const escopo = useMemo(
    () => all.filter((r) => empresaId === undefined || !r["empresa_id"] || String(r["empresa_id"]) === String(empresaId)),
    [all, empresaId],
  );

  const porId = useMemo(() => new Map(escopo.map((r) => [String(rowId(r)), r])), [escopo]);
  const comFilhos = useMemo(
    () => new Set(escopo.map((r) => String(r[PARENT_KEY] ?? "")).filter(Boolean)),
    [escopo],
  );

  const tipoDe = (r: Row): string => {
    const t = r["tipo_hierarquia"];
    if (t && t !== "independente") return String(t);
    if (r[PARENT_KEY]) return "filial";
    return comFilhos.has(String(rowId(r))) ? "matriz" : "independente";
  };
  const matrizes = useMemo(() => escopo.filter((r) => comFilhos.has(String(rowId(r))) || r["tipo_hierarquia"] === "matriz"), [escopo, comFilhos]);

  const rows = useMemo(
    () =>
      escopo
        .filter((r) => {
          const pai = r[PARENT_KEY] ? porId.get(String(r[PARENT_KEY])) : undefined;
          return (
            matchesAny([r["razao_social"], r["nome_fantasia"], r["documento"], r["telefone"], r["cidade"], pai?.["razao_social"]], f.busca) &&
            (f.papel === "todos" || (f.papel === "cliente" ? r["is_cliente"] === true : r["is_fornecedor"] === true)) &&
            (f.status === "todos" || (f.status === "ativo" ? r["status"] !== false : r["status"] === false)) &&
            (f.situacao === "todos" || (f.situacao === "nao" ? !r["situacao_cadastral"] : String(r["situacao_cadastral"] ?? "").toUpperCase() === f.situacao)) &&
            (f.classificacao === "todos" || String(r["classificacao_id"] ?? "") === f.classificacao) &&
            (f.estrutura === "todos" || tipoDe(r) === f.estrutura) &&
            (f.pai === "todos" || String(r[PARENT_KEY] ?? "") === f.pai || String(rowId(r)) === f.pai)
          );
        })
        .sort((a, b) => String(a["razao_social"] ?? "").localeCompare(String(b["razao_social"] ?? ""), "pt-BR")),
    [escopo, porId, f],
  );

  const columns: Column[] = [
    {
      key: "razao_social",
      header: "Nome/Razão Social",
      fields: ["razao_social"],
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="flex shrink-0 items-center gap-1">
            {r["is_cliente"] === true && (
              <span title="Cliente" aria-label="Cliente" className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">C</span>
            )}
            {r["is_fornecedor"] === true && (
              <span title="Fornecedor" aria-label="Fornecedor" className="flex size-6 items-center justify-center rounded-full bg-warning text-xs font-bold text-warning-foreground">F</span>
            )}
          </div>
          <div>
            <div>{String(pick(r, ["razao_social"], "—"))}</div>
            {pick(r, ["nome_fantasia"]) && <div className="text-muted-foreground text-xs">{String(r["nome_fantasia"])}</div>}
            {r["classificacao_id"] ? <Badge variant="outline" className="mt-0.5 text-[10px]">{caminhoClassificacao(classificacoes, r["classificacao_id"]) || "—"}</Badge> : null}
          </div>
        </div>
      ),
    },
    {
      key: PARENT_KEY,
      header: "Estrutura",
      fields: [PARENT_KEY],
      render: (r) => {
        const pai = r[PARENT_KEY] ? porId.get(String(r[PARENT_KEY])) : undefined;
        const tipo = tipoDe(r);
        if (pai) return <Badge variant="outline">{tipoHierarquiaLabel(tipo)} de {String(pai["razao_social"] ?? "—")}</Badge>;
        if (tipo === "matriz") return <Badge variant="outline">Matriz / Administradora</Badge>;
        return <span className="text-muted-foreground">—</span>;
      },
    },
    { key: "documento", header: "Documento", fields: ["documento"], render: (r) => formatCpfCnpj(String(r["documento"] ?? "")) || "—" },
    { key: "telefone", header: "Telefone", fields: ["telefone"], render: (r) => formatPhoneDisplay(String(r["telefone"] ?? "")) || "—" },
    {
      key: "situacao_cadastral",
      header: "Situação Receita",
      fields: ["situacao_cadastral"],
      render: (r) => {
        const s = String(r["situacao_cadastral"] ?? "").trim().toUpperCase();
        if (!s) return <span className="text-muted-foreground">—</span>;
        const motivo = String(r["motivo_situacao_cadastral"] ?? "");
        const cls = s === "ATIVA" ? "bg-success text-success-foreground" : s === "BAIXADA" || s === "NULA" ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-foreground";
        return <Badge className={cls} title={motivo || undefined}>{s}</Badge>;
      },
    },
    { key: "status", header: "Status", fields: ["status"], render: (r) => <StatusBadge value={r["status"]} /> },
  ];

  const norm = (v: unknown) => String(v ?? "").trim();
  const ufs = [...new Set(rows.map((r) => norm(r["uf"]).toUpperCase()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const cidades = [...new Set(rows.filter((r) => mf.uf === "todos" || norm(r["uf"]).toUpperCase() === mf.uf).map((r) => norm(r["cidade"])).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const rowsMapa = rows.filter((r) =>
    (mf.papel === "todos" || (mf.papel === "cliente" ? r["is_cliente"] === true : r["is_fornecedor"] === true)) &&
    (mf.uf === "todos" || norm(r["uf"]).toUpperCase() === mf.uf) &&
    (mf.cidade === "todos" || norm(r["cidade"]) === mf.cidade));
  const ehCondominio = (r: Row) => /condom/i.test(`${r["razao_social"] ?? ""} ${r["nome_fantasia"] ?? ""} ${caminhoClassificacao(classificacoes, r["classificacao_id"])}`);
  const comPin = rowsMapa.filter((r) => coordenadas(r)).length;

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-md border p-0.5">
          <Button variant={visao === "tabela" ? "secondary" : "ghost"} size="sm" onClick={() => setVisao("tabela")}><List className="mr-1 h-4 w-4" />Tabela</Button>
          <Button variant={visao === "mapa" ? "secondary" : "ghost"} size="sm" onClick={() => setVisao("mapa")}><MapIcon className="mr-1 h-4 w-4" />Mapa</Button>
        </div>
        {perms.canCreate && (
          <Button variant="outline" size="sm" onClick={() => setImpOpen(true)}><Upload className="mr-1 h-4 w-4" />Importar CSV</Button>
        )}
      </div>
      <ImportarParceirosDialog open={impOpen} onOpenChange={setImpOpen} existentes={escopo} empresaId={empresaId} stamp={stamp} />
      {visao === "mapa" && (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <FilterSelect label="Mostrar" value={mf.papel} onChange={(v) => setMf({ ...mf, papel: v })}
              options={[{ value: "todos", label: "Clientes e fornecedores" }, { value: "cliente", label: "Só clientes" }, { value: "fornecedor", label: "Só fornecedores" }]} />
            <FilterSelect label="Estado" value={mf.uf} onChange={(v) => setMf({ uf: v, cidade: "todos", papel: mf.papel })}
              options={[{ value: "todos", label: "Todos" }, ...ufs.map((u) => ({ value: u, label: u }))]} />
            <FilterSelect label="Cidade" value={mf.cidade} onChange={(v) => setMf({ ...mf, cidade: v })}
              options={[{ value: "todos", label: "Todas" }, ...cidades.map((c) => ({ value: c, label: c }))]} />
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="secondary">Total: {rowsMapa.length}</Badge>
            <Badge variant="secondary">Clientes: {rowsMapa.filter((r) => r["is_cliente"] === true).length}</Badge>
            <Badge variant="secondary">Fornecedores: {rowsMapa.filter((r) => r["is_fornecedor"] === true).length}</Badge>
            <Badge className="bg-primary text-primary-foreground"><Building2 className="mr-1 h-3.5 w-3.5" />Condomínios: {rowsMapa.filter(ehCondominio).length}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {LEGENDA_PINS.map((l) => <span key={l.cat} className="inline-flex items-center gap-1.5"><span className={`h-3 w-3 rounded-full dot-${l.cat}`} />{l.label}</span>)}
            <span className="ml-auto">{comPin} de {rowsMapa.length} com localização{comPin < rowsMapa.length ? " — use \"Geolocalizar pelo endereço\" na tabela para os demais" : ""}</span>
          </div>
          <ClientOnly fallback={<div className="h-[420px] rounded-lg border" />}>
            <Suspense fallback={<div className="h-[420px] rounded-lg border" />}>
              <ParceirosMapa rows={rowsMapa} onAbrir={(r) => { setRecord(r); setOpen(true); }} />
            </Suspense>
          </ClientOnly>
        </div>
      )}
      <div className={visao === "mapa" ? "hidden" : undefined}>
      <DataTable
        title="Parceiros de Negócios"
        columns={columns}
        rows={rows}
        loading={isLoading}
        getValue={(row, keys) => pick(row, keys)}
        rowKey={(row, i) => String(rowId(row) ?? i)}
        onAdd={perms.canCreate ? () => { setRecord(null); setOpen(true); } : undefined}
        onEdit={(row) => { setRecord(row); setOpen(true); }}
        editReadOnly={!perms.canUpdate}
        onDelete={perms.canDelete ? (row) => remove.mutate(row) : undefined}
        selection={{ selected: sel, onChange: setSel }}
        bulkBar={
          <BarraAcoesLote
            tabela="parceiros"
            selecionados={rows.filter((r, i) => sel.has(String(rowId(r) ?? i)))}
            totalFiltrado={rows.length}
            rotulo={(r) => String(r["razao_social"] || r["nome_fantasia"] || "—")}
            onSelecionarTodos={() => setSel(new Set(rows.map((r, i) => String(rowId(r) ?? i))))}
            onLimpar={() => setSel(new Set())}
            acoes={[
              ...(perms.canUpdate ? [
                { label: "Consultar CNPJ na Receita", icon: <Building2 className="h-4 w-4" />, intervalo: 1200, executar: (r: Row) => consultarCnpjReceita(r, lote.atualizar) },
                { label: "Geolocalizar pelo endereço", icon: <MapPin className="h-4 w-4" />, intervalo: 1100, executar: (r: Row) => geolocalizarRegistro(r, lote.atualizar) },
                { label: "Ativar", icon: <CheckCircle2 className="h-4 w-4" />, executar: lote.definirStatus(true) },
                { label: "Inativar", icon: <Ban className="h-4 w-4" />, confirmacao: "Inativar {n} parceiro(s)?", executar: lote.definirStatus(false) },
              ] : []),
              { label: "Verificar WhatsApp", icon: <MessageCircle className="h-4 w-4" />, intervalo: 300, executar: lote.verificarWhatsApp() },
              ...(perms.canDelete ? [{ label: "Excluir", icon: <Trash2 className="h-4 w-4" />, destrutiva: true, confirmacao: "Excluir permanentemente {n} parceiro(s)?", executar: lote.excluir }] : []),
            ]}
          />
        }
        filters={
          <>
            <FilterInput label="Buscar" value={f.busca} onChange={(v) => setF({ ...f, busca: v })} placeholder="Nome, documento, telefone ou cidade" />
            <FilterSelect label="Tipo" value={f.papel} onChange={(v) => setF({ ...f, papel: v })}
              options={[{ value: "todos", label: "Todos" }, { value: "cliente", label: "Clientes" }, { value: "fornecedor", label: "Fornecedores" }]} />
            <FilterSelect label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })}
              options={[{ value: "todos", label: "Todos" }, { value: "ativo", label: "Ativo" }, { value: "inativo", label: "Inativo" }]} />
            <FilterSelect label="Situação Receita" value={f.situacao} onChange={(v) => setF({ ...f, situacao: v })}
              options={[{ value: "todos", label: "Todas" }, { value: "ATIVA", label: "Ativa" }, { value: "BAIXADA", label: "Baixada" }, { value: "INAPTA", label: "Inapta" }, { value: "SUSPENSA", label: "Suspensa" }, { value: "NULA", label: "Nula" }, { value: "nao", label: "Não consultado" }]} />
            <FilterSelect label="Estrutura" value={f.estrutura} onChange={(v) => setF({ ...f, estrutura: v })}
              options={[{ value: "todos", label: "Todas" }, ...TIPOS_HIERARQUIA.map((t) => ({ value: t.value, label: t.label }))]} />
            <FilterSelect label="Matriz / Administradora" value={f.pai} onChange={(v) => setF({ ...f, pai: v })}
              options={[{ value: "todos", label: "Todas" }, ...matrizes.map((m) => ({ value: String(rowId(m)), label: String(m["razao_social"] ?? "—") }))]} />
            <FilterSelect label="Classificação" value={f.classificacao} onChange={(v) => setF({ ...f, classificacao: v })}
              options={[{ value: "todos", label: "Todas" }, ...classificacoes.map((c) => ({ value: String(rowId(c)), label: caminhoClassificacao(classificacoes, rowId(c)) })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))]} />
          </>
        }
      />
      </div>
      <ParceiroSheet
        open={open}
        onOpenChange={setOpen}
        record={record}
        parceiros={escopo}
        readOnly={record ? !perms.canUpdate : !perms.canCreate}
        saving={save.isPending}
        onSave={(values) =>
          save.mutate({ values: stamp(values, !record), original: record }, { onSuccess: () => { setOpen(false); setRecord(null); } })
        }
      />
    </>
  );
}
