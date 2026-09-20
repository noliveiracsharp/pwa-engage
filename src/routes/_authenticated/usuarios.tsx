import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { RecordSheet, type Field } from "@/components/data-table/RecordSheet";
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

const NOME = ["nome", "usuario_nome", "nome_completo"];
const EMAIL = ["email", "usuario_email", "e_mail"];
const TELEFONE = ["telefone", "usuario_telefone", "celular", "whatsapp"];
const CPF = ["cpf", "usuario_cpf", "documento"];
const STATUS = ["status", "usuario_status", "ativo", "situacao"];
const PERFIL = ["perfil", "perfil_descricao", "funcao", "funcao_descricao", "funcao_id", "perfil_id"];
const FOTO = ["foto", "avatar", "avatar_url", "imagem"];

function UsuariosPage() {
  const { data: rows = [], isLoading } = useTableRows("usuarios");
  const { data: funcoes = [] } = useTableRows("funcoes");
  const save = useSaveRecord("usuarios");
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [f, setF] = useState({
    nome: "",
    email: "",
    telefone: "",
    cpf: "",
    status: "todos",
    perfil: "todos",
  });

  const perfilOptions = useMemo(() => {
    const set = new Set(rows.map((row) => text(pick(row, PERFIL))).filter(Boolean));
    return [{ value: "todos", label: "Todos" }, ...[...set].map((p) => ({ value: p.toLowerCase(), label: p }))];
  }, [rows]);

  const statusOptions = useMemo(() => {
    const set = new Set(rows.map((row) => text(pick(row, STATUS))).filter(Boolean));
    return [{ value: "todos", label: "Todos" }, ...[...set].map((s) => ({ value: s.toLowerCase(), label: s }))];
  }, [rows]);

  const funcaoOptions = useMemo(
    () =>
      funcoes.map((row) => ({
        value: text(rowId(row)),
        label: text(pick(row, ["descricao", "funcao_descricao", "nome", "titulo"], "Função")),
      })),
    [funcoes],
  );

  const fields: Field[] = [
    { fields: NOME, label: "Nome", full: true },
    { fields: EMAIL, label: "E-mail", type: "email" },
    { fields: TELEFONE, label: "Telefone", type: "tel" },
    { fields: CPF, label: "CPF" },
    { fields: STATUS, label: "Status" },
    { fields: FOTO, label: "Foto (URL)", full: true },
    ...(funcaoOptions.length > 0
      ? [
          {
            fields: ["funcao_id", "perfil_id", "id_funcao", "funcao"],
            label: "Função / Perfil",
            type: "select" as const,
            options: funcaoOptions,
            full: true,
          },
        ]
      : []),
  ];

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          matches(pick(row, NOME), f.nome) &&
          matches(pick(row, EMAIL), f.email) &&
          matches(pick(row, TELEFONE), f.telefone) &&
          matches(pick(row, CPF), f.cpf) &&
          (f.status === "todos" || text(pick(row, STATUS)).toLowerCase() === f.status) &&
          (f.perfil === "todos" || text(pick(row, PERFIL)).toLowerCase() === f.perfil),
      ),
    [rows, f],
  );

  const columns: Column[] = [
    { key: "nome", header: "Nome", fields: NOME },
    { key: "email", header: "E-mail", fields: EMAIL },
    { key: "telefone", header: "Telefone", fields: TELEFONE },
    { key: "cpf", header: "CPF", fields: CPF },
    { key: "perfil", header: "Perfil", fields: PERFIL },
    { key: "status", header: "Status", fields: STATUS },
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
            <FilterInput label="Telefone" value={f.telefone} onChange={(v) => setF({ ...f, telefone: v })} />
            <FilterInput label="CPF" value={f.cpf} onChange={(v) => setF({ ...f, cpf: v })} />
            <FilterSelect
              label="Status"
              value={f.status}
              onChange={(v) => setF({ ...f, status: v })}
              options={statusOptions}
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
        description="O acesso por e-mail e senha é criado em uma etapa posterior."
        fields={fields}
        record={record}
        saving={save.isPending}
        onSave={(values) => save.mutate({ values, original: record }, { onSuccess: () => setOpen(false) })}
      />
    </>
  );
}
