import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { RecordSheet, type Field } from "@/components/data-table/RecordSheet";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { FuncaoPerfis } from "@/components/funcoes/FuncaoPerfis";
import { rowId, idColumn, useSaveRecord, useTableRows } from "@/lib/crud";
import { matchesAny } from "@/lib/input-masks";
import { pick, type Row } from "@/lib/row";

export const Route = createFileRoute("/_authenticated/funcoes")({
  head: () => ({
    meta: [
      { title: "Funções — Atende.ai" },
      { name: "description", content: "Telas e menus do sistema liberados para cada perfil de acesso." },
      { property: "og:title", content: "Funções — Atende.ai" },
      { property: "og:description", content: "Telas e menus do sistema liberados para cada perfil de acesso." },
    ],
  }),
  component: FuncoesPage,
});

const fields: Field[] = [
  { fields: ["descricao"], label: "Descrição", full: true },
  { fields: ["path"], label: "Caminho (rota)", placeholder: "/clientes" },
  { fields: ["icone"], label: "Ícone", type: "icon" },
  { fields: ["menu_ativo"], label: "Exibe no menu", type: "boolean" },
  { fields: ["status"], label: "Status", type: "boolean" },
];

const BOOL_OPTIONS = [
  { value: "todos", label: "Todos" },
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
];

function FuncoesPage() {
  const { data: rows = [], isLoading } = useTableRows("funcoes");
  const save = useSaveRecord("funcoes");
  const queryClient = useQueryClient();
  const reorder = useMutation({
    mutationFn: async (ordered: Row[]) => {
      await Promise.all(
        ordered.map((row, i) => {
          const key = idColumn(row);
          return supabase
            .from("funcoes")
            .update({ ordem: i + 1 })
            .eq(key, row[key] as never)
            .then(({ error }) => {
              if (error) throw error;
            });
        }),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["table", "funcoes"] }),
    onError: () => toast.error("Não foi possível salvar a nova ordem."),
  });
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [f, setF] = useState({ busca: "", menu: "todos", status: "todos" });

  const filtered = useMemo(
    () =>
      [...rows]
        .sort((a, b) => Number(pick(a, ["ordem"]) ?? 0) - Number(pick(b, ["ordem"]) ?? 0))
        .filter(
        (row) =>
          matchesAny([pick(row, ["descricao"]), pick(row, ["path"]), pick(row, ["icone"])], f.busca) &&
          (f.menu === "todos" ||
            (f.menu === "ativo" ? row["menu_ativo"] === true : row["menu_ativo"] === false)) &&
          (f.status === "todos" ||
            (f.status === "ativo" ? row["status"] === true : row["status"] === false)),
      ),
    [rows, f],
  );

  const columns: Column[] = [
    { key: "descricao", header: "Descrição", fields: ["descricao"] },
    { key: "path", header: "Caminho", fields: ["path"] },
    { key: "ordem", header: "Ordem", fields: ["ordem"], sortable: false },
    {
      key: "menu",
      header: "Menu ativo",
      fields: ["menu_ativo"],
      render: (row) => <StatusBadge value={row["menu_ativo"]} />,
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
        title="Funções"
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
        onReorder={(ordered) => reorder.mutate(ordered)}
        filters={
          <>
            <FilterInput
              label="Buscar"
              value={f.busca}
              onChange={(v) => setF({ ...f, busca: v })}
              placeholder="Descrição ou caminho"
            />
            <FilterSelect
              label="Menu ativo"
              value={f.menu}
              onChange={(v) => setF({ ...f, menu: v })}
              options={BOOL_OPTIONS}
            />
            <FilterSelect
              label="Status"
              value={f.status}
              onChange={(v) => setF({ ...f, status: v })}
              options={BOOL_OPTIONS}
            />
          </>
        }
      />

      <RecordSheet
        open={open}
        onOpenChange={setOpen}
        title={record ? "Editar função" : "Nova função"}
        description="A liberação das Funções é realizada por Perfil de Usuário."
        fields={fields}
        record={record}
        saving={save.isPending}
        extra={<FuncaoPerfis funcaoId={record ? rowId(record) : undefined} />}
        onSave={(values) => save.mutate({ values, original: record }, { onSuccess: () => setOpen(false) })}
      />
    </>
  );
}
