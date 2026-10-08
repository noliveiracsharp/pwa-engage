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
import { rowId, idColumn, useDeleteRecord, useSaveRecord, useTableRows } from "@/lib/crud";
import { matchesAny } from "@/lib/input-masks";
import { pick, type Row } from "@/lib/row";
import { usePagePermissions } from "@/hooks/usePagePermissions";

export const Route = createFileRoute("/_authenticated/funcoes")({
  staticData: { sitemap: false },
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
  { fields: ["path"], label: "Caminho (rota)", placeholder: "/pessoas" },
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
  const perms = usePagePermissions("/funcoes");
  const remove = useDeleteRecord("funcoes");
  const queryClient = useQueryClient();
  const reorder = useMutation({
    mutationFn: async (ordered: Row[]) => {
      let n = 0;
      await Promise.all(
        ordered.map((row) => {
          const key = idColumn(row);
          const isChild = !!pick(row, ["funcoes_pai_id"]);
          const ordem = isChild ? null : ++n;
          return supabase
            .from("funcoes")
            .update({ ordem })
            .eq(key, row[key] as never)
            .then(({ error }) => {
              if (error) throw error;
            });
        }),
      );
    },
    onSuccess: () => {
      void import("@/lib/access").then((m) => m.clearAccessCache());
      return queryClient.invalidateQueries({ queryKey: ["table", "funcoes"] });
    },
    onError: () => toast.error("Não foi possível salvar a nova ordem."),
  });
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [f, setF] = useState({ busca: "", menu: "todos", status: "todos" });
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());

  const hierarchy = useMemo(() => {
    const ordered = [...rows].sort(
      (a, b) =>
        Number(pick(a, ["ordem"]) ?? 0) - Number(pick(b, ["ordem"]) ?? 0) ||
        String(pick(a, ["descricao"]) ?? "").localeCompare(String(pick(b, ["descricao"]) ?? ""), "pt-BR"),
    );
    const byId = new Map(ordered.map((row) => [String(rowId(row) ?? ""), row]));
    const children = new Map<string, Row[]>();
    for (const row of ordered) {
      const parentId = String(pick(row, ["funcoes_pai_id"]) ?? "");
      if (parentId && byId.has(parentId) && parentId !== String(rowId(row) ?? "")) {
        children.set(parentId, [...(children.get(parentId) ?? []), row]);
      }
    }

    const matches = ordered.filter(
      (row) =>
        matchesAny([pick(row, ["descricao"]), pick(row, ["path"]), pick(row, ["icone"])], f.busca) &&
        (f.menu === "todos" || (f.menu === "ativo" ? row["menu_ativo"] === true : row["menu_ativo"] === false)) &&
        (f.status === "todos" || (f.status === "ativo" ? row["status"] === true : row["status"] === false)),
    );
    const included = new Set(matches.map((row) => String(rowId(row) ?? "")));
    for (const row of matches) {
      let parentId = String(pick(row, ["funcoes_pai_id"]) ?? "");
      const ancestors = new Set<string>();
      while (parentId && byId.has(parentId) && !ancestors.has(parentId)) {
        ancestors.add(parentId);
        included.add(parentId);
        parentId = String(pick(byId.get(parentId) ?? {}, ["funcoes_pai_id"]) ?? "");
      }
    }

    const depthById = new Map<string, number>();
    const visible: Row[] = [];
    const visited = new Set<string>();
    const hasActiveFilter = f.busca.trim() !== "" || f.menu !== "todos" || f.status !== "todos";
    const append = (row: Row, depth: number, ancestors: Set<string>) => {
      const id = String(rowId(row) ?? "");
      if (!id || visited.has(id) || ancestors.has(id) || !included.has(id)) return;
      visited.add(id);
      depthById.set(id, depth);
      visible.push(row);
      if (!hasActiveFilter && collapsedIds.has(id)) return;
      const nextAncestors = new Set(ancestors);
      nextAncestors.add(id);
      for (const child of children.get(id) ?? []) append(child, depth + 1, nextAncestors);
    };

    for (const row of ordered) {
      const parentId = String(pick(row, ["funcoes_pai_id"]) ?? "");
      if (!parentId || !byId.has(parentId)) append(row, 0, new Set());
    }

    return { visible, children, depthById, hasActiveFilter };
  }, [rows, f, collapsedIds]);


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
        rows={hierarchy.visible}
        loading={isLoading}
        getValue={(row, keys) => pick(row, keys)}
        rowKey={(row, i) => String(rowId(row) ?? i)}
        rowDepth={(row) => hierarchy.depthById.get(String(rowId(row) ?? "")) ?? 0}
        rowHasChildren={(row) => (hierarchy.children.get(String(rowId(row) ?? ""))?.length ?? 0) > 0}
        rowExpanded={(row) => hierarchy.hasActiveFilter || !collapsedIds.has(String(rowId(row) ?? ""))}
        onToggleRow={(row) => {
          const id = String(rowId(row) ?? "");
          if (!id || hierarchy.hasActiveFilter) return;
          setCollapsedIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        }}
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
        readOnly={record ? !perms.canUpdate : !perms.canCreate}
        saving={save.isPending}
        extra={<FuncaoPerfis funcaoId={record ? rowId(record) : undefined} />}
        onSave={(values) => {
          const pai = values["funcoes_pai_id"];
          const isChild = !(pai === NONE || pai === "" || pai === undefined);
          const payload: Row = {
            ...values,
            funcoes_pai_id: isChild ? pai : null,
            ordem: isChild ? null : values["ordem"],
          };
          save.mutate({ values: payload, original: record }, { onSuccess: () => setOpen(false) });
        }}

      />
    </>
  );
}
