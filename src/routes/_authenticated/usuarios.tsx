import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [f, setF] = useState({ nome: "", email: "", cpf: "", status: "todos", perfil: "todos" });

  /** New user: creates the auth.users access first, then the usuarios row linked by id. */
  const createUser = useMutation({
    mutationFn: async (values: Row) => {
      const email = text(values["email"]).trim();
      const password = text(values["senha"]);
      if (!email) throw new Error("Informe o e-mail do usuário.");
      if (password.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.");
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      const uid = data.user?.id;
      if (!uid) throw new Error("Não foi possível criar o acesso do usuário.");
      const rest: Row = { ...values };
      delete rest["senha"];
      const { error: insertError } = await supabase.from("usuarios").insert({ ...rest, id: uid });
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["table", "usuarios"] });
      toast.success("Usuário criado com sucesso.");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    },
  });

  const handleSave = (values: Row) => {
    if (record) {
      const rest: Row = { ...values };
      delete rest["senha"];
      save.mutate({ values: rest, original: record }, { onSuccess: () => setOpen(false) });
    } else {
      createUser.mutate(values, { onSuccess: () => setOpen(false) });
    }
  };

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
      { fields: ["foto"], label: "Foto", type: "photo", full: true },
      { fields: ["nome"], label: "Nome", full: true },
      { fields: ["email"], label: "E-mail", type: "email" },
      ...(!record
        ? [{ fields: ["senha"], label: "Senha de acesso", type: "password" as const }]
        : []),
      { fields: ["cpf"], label: "CPF" },
      { fields: ["cargo"], label: "Cargo" },
      { fields: ["status"], label: "Status", type: "boolean" },
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
    [perfilOptions, empresas, record],
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
    {
      key: "nome",
      header: "Nome",
      fields: ["nome"],
      render: (row) => {
        const foto = text(pick(row, ["foto"]));
        const nome = text(pick(row, ["nome"], "—"));
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
