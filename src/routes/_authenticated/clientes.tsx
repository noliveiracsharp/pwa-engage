import { useMemo, useState } from "react";
import { User } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { RecordSheet, type Field } from "@/components/data-table/RecordSheet";
import { StarRating } from "@/components/data-table/StarRating";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { ClienteCampos } from "@/components/clientes/ClienteCampos";
import { rowId, useDeleteRecord, useSaveRecord, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { usePagePermissions, subtabKind } from "@/hooks/usePagePermissions";
import { formatCpfCnpj, formatPhoneDisplay, matchesAny } from "@/lib/input-masks";

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
  { fields: ["foto"], label: "Foto", type: "photo", full: true },
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
  const perms = usePagePermissions("/clientes");
  const remove = useDeleteRecord("clientes");
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [f, setF] = useState({ busca: "", status: "todos", nota: "todas" });

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          matchesAny(
            [
              pick(row, ["nome"]),
              pick(row, ["email"]),
              pick(row, ["telefone"]),
              pick(row, ["cpf"]),
              pick(row, ["observacao"]),
            ],
            f.busca,
          ) &&
          (f.status === "todos" ||
            (f.status === "ativo" ? row["status"] === true : row["status"] === false)) &&
          (f.nota === "todas" || String(Number(pick(row, ["nota"]) ?? 0)) === f.nota),
      ),
    [rows, f],
  );

  const columns: Column[] = [
    {
      key: "nome",
      header: "Nome",
      fields: ["nome"],
      render: (row) => {
        const foto = pick(row, ["foto"]);
        const nome = pick(row, ["nome"], "—");
        return (
          <div className="flex items-center gap-2.5">
            {foto ? (
              <img
                src={foto}
                alt={nome}
                className="border-border h-8 w-8 shrink-0 rounded-full border object-cover"
              />
            ) : (
              <span className="bg-muted text-muted-foreground border-border flex h-8 w-8 shrink-0 items-center justify-center rounded-full border">
                <User className="h-4 w-4" />
              </span>
            )}
            <span>{nome}</span>
          </div>
        );
      },
    },
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
              placeholder="Nome, e-mail, telefone ou CPF"
            />
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
        readOnly={record ? !perms.canUpdate : !perms.canCreate}
        {...(() => {
          const campos = <ClienteCampos clienteId={record ? rowId(record) : undefined} />;
          if (perms.subtabs.length === 0) return { extra: campos, extraTabLabel: "Campos personalizados" };
          const dados = perms.subtabs.find((t) => subtabKind(t) === "dados");
          return {
            dataTabLabel: dados?.descricao ?? "Dados",
            hideDataTab: !dados,
            tabs: perms.subtabs
              .filter((t) => subtabKind(t) !== "dados")
              .map((t) => ({
                key: t.id,
                label: t.descricao,
                content: subtabKind(t) === "campos" ? campos : <p className="text-sm text-muted-foreground">Em breve.</p>,
              })),
          };
        })()}
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
