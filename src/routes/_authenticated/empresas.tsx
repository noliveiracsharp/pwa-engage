import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { EmpresaSheet } from "@/components/empresas/EmpresaSheet";
import { matches, rowId, useSaveRecord, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { formatCpfCnpj, formatPhoneDisplay } from "@/lib/input-masks";

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
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [f, setF] = useState({ nome: "", documento: "", status: "todos" });

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          matches(pick(row, ["nome"]), f.nome) &&
          matches(pick(row, ["cnpj_cpf"]), f.documento) &&
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
        onAdd={() => {
          setRecord(null);
          setOpen(true);
        }}
        onEdit={(row) => {
          setRecord(row);
          setOpen(true);
        }}
        filters={
          <>
            <FilterInput label="Nome" value={f.nome} onChange={(v) => setF({ ...f, nome: v })} />
            <FilterInput
              label="CNPJ / CPF"
              value={f.documento}
              onChange={(v) => setF({ ...f, documento: v })}
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
        onSave={(values) => save.mutate({ values, original: record }, { onSuccess: () => setOpen(false) })}
      />
    </>
  );
}
