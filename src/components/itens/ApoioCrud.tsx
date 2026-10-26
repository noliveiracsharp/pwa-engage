import { useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { RecordSheet, type Field } from "@/components/data-table/RecordSheet";
import { rowId, useDeleteRecord, useSaveRecord, useTableRows } from "@/lib/crud";
import { matchesAny } from "@/lib/input-masks";
import { useAudit } from "@/lib/audit";
import { pick, type Row } from "@/lib/row";
import { buildTree, descendantIds } from "@/lib/hierarchy";
import { usePagePermissions } from "@/hooks/usePagePermissions";

const STATUS_OPTIONS = [
  { value: "todos", label: "Todos" },
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
];

type Props = {
  table: string;
  title: string;
  /** Caminho da função (tabela menu) usado para as permissões. */
  path: string;
  singular: string;
  columns: Column[];
  fields: Field[];
  searchFields: string[];
  searchPlaceholder: string;
  /** Tabela recursiva: coluna do pai e rótulo do campo. */
  hierarchy?: { parentKey: string; label: string };
  /** Permissões vindas da aba da tela pai (ex.: Financeiro → Plano de Contas). */
  permsOverride?: { canRead: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean } | undefined;
};

/** CRUD padrão das tabelas de apoio (unidade de medida, centro de custo, marcas). */
export function ApoioCrud({
  table,
  title,
  path,
  singular,
  columns,
  fields,
  searchFields,
  searchPlaceholder,
  hierarchy,
  permsOverride,
}: Props) {
  const { data: rows = [], isLoading } = useTableRows(table);
  const permsRota = usePagePermissions(path);
  const perms = permsOverride ? { ...permsOverride, loading: false } : permsRota;
  const save = useSaveRecord(table);
  const remove = useDeleteRecord(table);
  const { stamp, empresaId } = useAudit();
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [f, setF] = useState({ busca: "", status: "todos" });
  const [expanded, setExpanded] = useState<Map<string, boolean>>(new Map());

  const scoped = useMemo(
    () =>
      hierarchy && empresaId !== undefined
        ? rows.filter((r) => r["empresa_id"] == null || String(r["empresa_id"]) === String(empresaId))
        : rows,
    [rows, hierarchy, empresaId],
  );
  const tree = useMemo(() => (hierarchy ? buildTree(scoped, hierarchy.parentKey) : null), [scoped, hierarchy]);
  const depthMap = useMemo(() => new Map((tree ?? []).map((n) => [String(rowId(n.row)), n.depth])), [tree]);
  const { ancestors, parentsWithChildren } = useMemo(() => {
    const ancestors = new Map<string, string[]>();
    const parentsWithChildren = new Set<string>();
    const stack: string[] = [];
    for (const node of tree ?? []) {
      stack.length = node.depth;
      const id = String(rowId(node.row));
      ancestors.set(id, [...stack]);
      const parent = stack[stack.length - 1];
      if (parent) parentsWithChildren.add(parent);
      stack.push(id);
    }
    return { ancestors, parentsWithChildren };
  }, [tree]);
  const filtering = Boolean(f.busca.trim()) || f.status !== "todos";

  const filtered = useMemo(() => {
    const source = tree ? tree.map((n) => n.row) : rows;
    const matching = source.filter(
      (row) =>
        matchesAny(searchFields.map((key) => pick(row, [key])), f.busca) &&
        (f.status === "todos" || (f.status === "ativo" ? row["status"] === true : row["status"] === false)),
    );
    if (!tree) return matching;
    const relevant = new Set(matching.map((row) => String(rowId(row))));
    if (filtering) {
      for (const id of [...relevant]) for (const ancestor of ancestors.get(id) ?? []) relevant.add(ancestor);
    }
    return source.filter((row) => {
      const id = String(rowId(row));
      return relevant.has(id) && (ancestors.get(id) ?? []).every((parent) => (expanded.get(parent) ?? filtering));
    });
  }, [rows, tree, f, searchFields, filtering, ancestors, expanded]);

  const allColumns = useMemo<Column[]>(() => {
    if (!hierarchy) return columns;
    const names = new Map(scoped.map((r) => [String(rowId(r)), String(pick(r, ["descricao"]) ?? "—")]));
    const parentCol: Column = {
      key: hierarchy.parentKey,
      header: "Pai",
      fields: [hierarchy.parentKey],
      sortable: false,
      render: (row) => {
        const p = pick(row, [hierarchy.parentKey]);
        return p ? (names.get(String(p)) ?? "—") : <span className="text-muted-foreground">Grupo principal</span>;
      },
    };
    const [first, ...rest] = columns;
    return first ? [first, ...rest.slice(0, 1), parentCol, ...rest.slice(1)].map((col) => ({ ...col, sortable: false })) : columns;
  }, [columns, hierarchy, scoped]);

  const allFields = useMemo<Field[]>(() => {
    if (!hierarchy || !tree) return fields;
    const blocked = record ? descendantIds(scoped, hierarchy.parentKey, String(rowId(record))) : new Set<string>();
    const options = [
      { value: "__all__", label: "Nenhum (grupo principal)" },
      ...tree
        .filter((n) => !blocked.has(String(rowId(n.row))))
        .map((n) => ({ value: String(rowId(n.row)), label: n.path })),
    ];
    return [{ fields: [hierarchy.parentKey], label: hierarchy.label, type: "select", options, full: true }, ...fields];
  }, [fields, hierarchy, tree, scoped, record]);

  if (!perms.loading && !perms.canRead) {
    return <p className="text-muted-foreground text-sm">Você não tem acesso a esta página.</p>;
  }

  return (
    <>
      <DataTable
        title={title}
        columns={allColumns}
        {...(hierarchy ? { rowDepth: (row: Row) => depthMap.get(String(rowId(row))) ?? 0 } : {})}
        {...(hierarchy ? {
          rowHasChildren: (row: Row) => parentsWithChildren.has(String(rowId(row))),
          rowExpanded: (row: Row) => expanded.get(String(rowId(row))) ?? filtering,
          onToggleRow: (row: Row) => {
            const id = String(rowId(row));
            setExpanded((current) => new Map(current).set(id, !(current.get(id) ?? filtering)));
          },
        } : {})}
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
              onChange={(v) => { setF({ ...f, busca: v }); setExpanded(new Map()); }}
              placeholder={searchPlaceholder}
            />
            <FilterSelect
              label="Status"
              value={f.status}
              onChange={(v) => { setF({ ...f, status: v }); setExpanded(new Map()); }}
              options={STATUS_OPTIONS}
            />
          </>
        }
      />

      <RecordSheet
        auditTable={table}
        open={open}
        onOpenChange={setOpen}
        title={record ? `Editar ${singular}` : `Novo ${singular}`}
        fields={allFields}
        record={record}
        saving={save.isPending}
        readOnly={record ? !perms.canUpdate : !perms.canCreate}
        onSave={(values) =>
          save.mutate(
            {
              values: stamp(
                hierarchy && (values[hierarchy.parentKey] === "__all__" || values[hierarchy.parentKey] === "")
                  ? { ...values, [hierarchy.parentKey]: null }
                  : values,
                !record,
              ),
              original: record,
            },
            { onSuccess: () => { setOpen(false); setRecord(null); } },
          )
        }
      />
    </>
  );
}
