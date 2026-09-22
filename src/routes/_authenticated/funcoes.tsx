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

const NONE = "__none__";

const baseFields: Field[] = [
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

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      const id = rowId(row);
      if (id !== undefined) map.set(String(id), String(pick(row, ["descricao"]) ?? ""));
    }
    return map;
  }, [rows]);

  const fields: Field[] = useMemo(() => {
    const currentId = record ? String(rowId(record) ?? "") : "";
    const options = [
      { value: NONE, label: "Nenhuma (função pai)" },
      ...rows
        .filter((row) => String(rowId(row) ?? "") !== currentId)
        .map((row) => ({
          value: String(rowId(row) ?? ""),
          label: String(pick(row, ["descricao"]) ?? "—"),
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
    return [
      baseFields[0]!,
      {
        fields: ["funcoes_pai_id"],
        label: "Função pai",
        type: "select",
        options,
        full: true,
      },
      ...baseFields.slice(1),
    ];
  }, [rows, record]);

  const columns: Column[] = [
    { key: "descricao", header: "Descrição", fields: ["descricao"] },
    { key: "path", header: "Caminho", fields: ["path"] },
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
        onSave={(values) => {
          const pai = values["funcoes_pai_id"];
          const payload: Row = {
            ...values,
            funcoes_pai_id: pai === NONE || pai === "" || pai === undefined ? null : pai,
          };
          save.mutate({ values: payload, original: record }, { onSuccess: () => setOpen(false) });
        }}

      />
    </>
  );
}
