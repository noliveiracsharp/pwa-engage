import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { RecordSheet, type Field } from "@/components/data-table/RecordSheet";
import { StarRating } from "@/components/data-table/StarRating";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { matches, rowId, useSaveRecord, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { formatCpfCnpj, formatPhoneDisplay, matchesMaskedValue } from "@/lib/input-masks";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — Atende.ai" },
      { name: "description", content: "Cadastro e gestão dos clientes atendidos pela empresa." },
      { property: "og:title", content: "Clientes — Atende.ai" },
      { property: "og:description", content: "Cadastro e gestão dos clientes atendidos pela empresa." },
    ],
  }),
  component: ClientesPage,
});

const fields: Field[] = [
  { fields: ["nome"], label: "Nome", full: true },
  { fields: ["email"], label: "E-mail", type: "email" },
  { fields: ["telefone"], label: "Telefone", type: "tel" },
  { fields: ["cpf"], label: "CPF", type: "document" },
  { fields: ["status"], label: "Status", type: "boolean" },
  { fields: ["foto"], label: "Foto (URL)", full: true },
  { fields: ["nota"], label: "Nota", type: "rating" },
  { fields: ["observacao"], label: "Observações", type: "textarea", full: true },
];

const STATUS_OPTIONS = [
  { value: "todos", label: "Todos" },
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
];

function ClientesPage() {
  const { data: rows = [], isLoading } = useTableRows("clientes");
  const save = useSaveRecord("clientes");
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [f, setF] = useState({ nome: "", email: "", telefone: "", cpf: "", status: "todos", nota: "todas" });

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          matches(pick(row, ["nome"]), f.nome) &&
          matches(pick(row, ["email"]), f.email) &&
          matchesMaskedValue(pick(row, ["telefone"]), f.telefone) &&
          matchesMaskedValue(pick(row, ["cpf"]), f.cpf) &&
          (f.status === "todos" ||
            (f.status === "ativo" ? row["status"] === true : row["status"] === false)) &&
          (f.nota === "todas" || String(Number(pick(row, ["nota"]) ?? 0)) === f.nota),
      ),
    [rows, f],
  );

  const columns: Column[] = [
    { key: "nome", header: "Nome", fields: ["nome"] },
    { key: "email", header: "E-mail", fields: ["email"] },
    {
      key: "telefone",
      header: "Telefone",
      fields: ["telefone"],
      render: (row) => formatPhoneDisplay(String(pick(row, ["telefone"], ""))) || "—",
    },
    {
      key: "cpf",
      header: "CPF",
      fields: ["cpf"],
      render: (row) => formatCpfCnpj(String(pick(row, ["cpf"], ""))) || "—",
    },
    {
      key: "status",
      header: "Status",
      fields: ["status"],
      render: (row) => <StatusBadge value={row["status"]} />,
    },
    {
      key: "nota",
      header: "Nota",
      fields: ["nota"],
      render: (row) => <StarRating size="sm" value={Number(pick(row, ["nota"]) ?? 0)} />,
    },
  ];

  return (
    <>
      <DataTable
        title="Clientes"
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
            <FilterInput label="E-mail" value={f.email} onChange={(v) => setF({ ...f, email: v })} />
            <FilterInput label="Telefone" value={f.telefone} onChange={(v) => setF({ ...f, telefone: v })} />
            <FilterInput label="CPF" value={f.cpf} onChange={(v) => setF({ ...f, cpf: v })} />
            <FilterSelect
              label="Status"
              value={f.status}
              onChange={(v) => setF({ ...f, status: v })}
              options={STATUS_OPTIONS}
            />
            <FilterSelect
              label="Nota"
              value={f.nota}
              onChange={(v) => setF({ ...f, nota: v })}
              options={[
                { value: "todas", label: "Todas" },
                ...[0, 1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} estrela(s)` })),
              ]}
            />
          </>
        }
      />

      <RecordSheet
        open={open}
        onOpenChange={setOpen}
        title={record ? "Editar cliente" : "Novo cliente"}
        fields={fields}
        record={record}
        saving={save.isPending}
        onSave={(values) =>
          save.mutate(
            { values, original: record },
            { onSuccess: () => setOpen(false) },
          )
        }
      />
    </>
  );
}
