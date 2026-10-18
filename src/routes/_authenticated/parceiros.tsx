import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { PARENT_KEY, ParceiroSheet, TIPOS_HIERARQUIA, tipoHierarquiaLabel } from "@/components/parceiros/ParceiroSheet";
import { rowId, useDeleteRecord, useSaveRecord, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useAudit } from "@/lib/audit";
import { formatCpfCnpj, formatPhoneDisplay, matchesAny } from "@/lib/input-masks";

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
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [f, setF] = useState({ busca: "", papel: "todos", status: "todos", estrutura: "todos", pai: "todos" });

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
    { key: "status", header: "Status", fields: ["status"], render: (r) => <StatusBadge value={r["status"]} /> },
  ];

  return (
    <>
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
        filters={
          <>
            <FilterInput label="Buscar" value={f.busca} onChange={(v) => setF({ ...f, busca: v })} placeholder="Nome, documento, telefone ou cidade" />
            <FilterSelect label="Tipo" value={f.papel} onChange={(v) => setF({ ...f, papel: v })}
              options={[{ value: "todos", label: "Todos" }, { value: "cliente", label: "Clientes" }, { value: "fornecedor", label: "Fornecedores" }]} />
            <FilterSelect label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })}
              options={[{ value: "todos", label: "Todos" }, { value: "ativo", label: "Ativo" }, { value: "inativo", label: "Inativo" }]} />
            <FilterSelect label="Estrutura" value={f.estrutura} onChange={(v) => setF({ ...f, estrutura: v })}
              options={[{ value: "todos", label: "Todas" }, ...TIPOS_HIERARQUIA.map((t) => ({ value: t.value, label: t.label }))]} />
            <FilterSelect label="Matriz / Administradora" value={f.pai} onChange={(v) => setF({ ...f, pai: v })}
              options={[{ value: "todos", label: "Todas" }, ...matrizes.map((m) => ({ value: String(rowId(m)), label: String(m["razao_social"] ?? "—") }))]} />
          </>
        }
      />
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
