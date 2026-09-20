import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { RecordSheet, type Field } from "@/components/data-table/RecordSheet";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { matches, rowId, text, useSaveRecord, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários — Atende.ai" },
      { name: "description", content: "Gestão dos usuários e perfis de acesso da plataforma." },
      { property: "og:title", content: "Usuários — Atende.ai" },
      { property: "og:description", content: "Gestão dos usuários e perfis de acesso da plataforma." },
    ],
  }),
  component: UsuariosPage,
});

const STATUS_OPTIONS = [
  { value: "todos", label: "Todos" },
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
];

function UsuariosPage() {
  const { data: rows = [], isLoading } = useTableRows("usuarios");
  const { data: perfis = [] } = useTableRows("perfil");
  const { data: empresas = [] } = useTableRows("empresas");
  const save = useSaveRecord("usuarios");
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [f, setF] = useState({ nome: "", email: "", cpf: "", status: "todos", perfil: "todos" });

  const perfilNome = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of perfis) map.set(text(rowId(p)), text(pick(p, ["descricao"], "—")));
    return map;
  }, [perfis]);

  const perfilOptions = useMemo(
    () => [
      { value: "todos", label: "Todos" },
      ...perfis.map((p) => ({ value: text(rowId(p)), label: text(pick(p, ["descricao"], "Perfil")) })),
    ],
    [perfis],
  );

  const fields: Field[] = useMemo(
    () => [
      { fields: ["nome"], label: "Nome", full: true },
      { fields: ["email"], label: "E-mail", type: "email" },
      { fields: ["cpf"], label: "CPF" },
      { fields: ["cargo"], label: "Cargo" },
      { fields: ["status"], label: "Status", type: "boolean" },
      { fields: ["foto"], label: "Foto (URL)", full: true },
      {
        fields: ["perfil_id"],
        label: "Perfil",
        type: "select",
        options: perfilOptions.filter((o) => o.value !== "todos"),
      },
      {
        fields: ["empresa_id"],
        label: "Empresa",
        type: "select",
        options: empresas.map((e) => ({
          value: text(rowId(e)),
          label: text(pick(e, ["nome"], "Empresa")),
        })),
      },
    ],
    [perfilOptions, empresas],
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          matches(pick(row, ["nome"]), f.nome) &&
          matches(pick(row, ["email"]), f.email) &&
          matches(pick(row, ["cpf"]), f.cpf) &&
          (f.status === "todos" ||
            (f.status === "ativo" ? row["status"] === true : row["status"] === false)) &&
          (f.perfil === "todos" || text(pick(row, ["perfil_id"])) === f.perfil),
      ),
    [rows, f],
  );

  const columns: Column[] = [
    { key: "nome", header: "Nome", fields: ["nome"] },
    { key: "email", header: "E-mail", fields: ["email"] },
    { key: "cpf", header: "CPF", fields: ["cpf"] },
    { key: "cargo", header: "Cargo", fields: ["cargo"] },
    {
      key: "perfil",
      header: "Perfil",
      fields: ["perfil_id"],
      render: (row) => perfilNome.get(text(pick(row, ["perfil_id"]))) ?? "—",
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
        title="Usuários"
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
            <FilterInput label="CPF" value={f.cpf} onChange={(v) => setF({ ...f, cpf: v })} />
            <FilterSelect
              label="Status"
              value={f.status}
              onChange={(v) => setF({ ...f, status: v })}
              options={STATUS_OPTIONS}
            />
            <FilterSelect
              label="Perfil"
              value={f.perfil}
              onChange={(v) => setF({ ...f, perfil: v })}
              options={perfilOptions}
            />
          </>
        }
      />

      <RecordSheet
        open={open}
        onOpenChange={setOpen}
        title={record ? "Editar usuário" : "Novo usuário"}
        description="O cadastro depende de um acesso (auth.users) existente — a criação de acesso por e-mail e senha será feita em uma etapa posterior."
        fields={fields}
        record={record}
        saving={save.isPending}
        onSave={(values) => save.mutate({ values, original: record }, { onSuccess: () => setOpen(false) })}
      />
    </>
  );
}
