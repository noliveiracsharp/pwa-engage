import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { EmpresaSheet } from "@/components/empresas/EmpresaSheet";
import { rowId, useDeleteRecord, useSaveRecord, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { usePagePermissions, subtabKind } from "@/hooks/usePagePermissions";
import { formatCpfCnpj, formatPhoneDisplay, matchesAny } from "@/lib/input-masks";

export const Route = createFileRoute("/_authenticated/empresas")({
  head: () => ({
    meta: [
      { title: "Empresas — Atende.ai" },
      { name: "description", content: "Empresas atendidas, instâncias vinculadas e campos personalizados." },
      { property: "og:title", content: "Empresas — Atende.ai" },
      {
        property: "og:description",
        content: "Empresas atendidas, instâncias vinculadas e campos personalizados.",
      },
    ],
  }),
  component: EmpresasPage,
});

const STATUS_OPTIONS = [
  { value: "todos", label: "Todos" },
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
];

function EmpresasPage() {
  const { data: rows = [], isLoading } = useTableRows("empresas");
  const save = useSaveRecord("empresas");
  const perms = usePagePermissions("/empresas");
  const remove = useDeleteRecord("empresas");
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [f, setF] = useState({ busca: "", status: "todos" });

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          matchesAny(
            [pick(row, ["nome"]), pick(row, ["cnpj_cpf"]), pick(row, ["telefone1"]), pick(row, ["telefone2"])],
            f.busca,
          ) &&
          (f.status === "todos" ||
            (f.status === "ativo" ? row["status"] === true : row["status"] === false)),
      ),
    [rows, f],
  );

  const columns: Column[] = [
    { key: "nome", header: "Nome", fields: ["nome"] },
    {
      key: "documento",
      header: "CNPJ / CPF",
      fields: ["cnpj_cpf"],
      render: (row) => formatCpfCnpj(String(pick(row, ["cnpj_cpf"], ""))) || "—",
    },
    {
      key: "telefone",
      header: "Telefone",
      fields: ["telefone1"],
      render: (row) => formatPhoneDisplay(String(pick(row, ["telefone1"], ""))) || "—",
    },
    {
      key: "status",
      header: "Status",
      fields: ["status"],
      render: (row) => <StatusBadge value={row["status"]} />,
    },
  ];

  return (
    <>
      <DataTable
        title="Empresas"
        columns={columns}
        rows={filtered}
        loading={isLoading}
        getValue={(row, keys) => pick(row, keys)}
        rowKey={(row, i) => String(rowId(row) ?? i)}
        onAdd={
          perms.canCreate
            ? () => {
                setRecord(null);
                setOpen(true);
              }
            : undefined
        }
        onEdit={(row) => {
          setRecord(row);
          setOpen(true);
        }}
        editReadOnly={!perms.canUpdate}
        onDelete={perms.canDelete ? (row) => remove.mutate(row) : undefined}
        filters={
          <>
            <FilterInput
              label="Buscar"
              value={f.busca}
              onChange={(v) => setF({ ...f, busca: v })}
              placeholder="Nome, CNPJ/CPF ou telefone"
            />
            <FilterSelect
              label="Status"
              value={f.status}
              onChange={(v) => setF({ ...f, status: v })}
              options={STATUS_OPTIONS}
            />
          </>
        }
      />

      <EmpresaSheet
        open={open}
        onOpenChange={setOpen}
        empresa={record}
        saving={save.isPending}
        readOnly={record ? !perms.canUpdate : !perms.canCreate}
        sections={perms.subtabs.map((t) => ({
          key: t.id,
          kind: subtabKind(t),
          label: t.descricao,
          perms: { canCreate: t.canCreate, canUpdate: t.canUpdate, canDelete: t.canDelete },
        }))}
        onSave={(values) => save.mutate({ values, original: record }, { onSuccess: () => setOpen(false) })}
      />
    </>
  );
}
