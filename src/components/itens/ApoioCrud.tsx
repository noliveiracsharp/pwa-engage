import { useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { RecordSheet, type Field } from "@/components/data-table/RecordSheet";
import { rowId, useDeleteRecord, useSaveRecord, useTableRows } from "@/lib/crud";
import { matchesAny } from "@/lib/input-masks";
import { useAudit } from "@/lib/audit";
import { pick, type Row } from "@/lib/row";
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
}: Props) {
  const { data: rows = [], isLoading } = useTableRows(table);
  const perms = usePagePermissions(path);
  const save = useSaveRecord(table);
  const remove = useDeleteRecord(table);
  const { stamp } = useAudit();
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [f, setF] = useState({ busca: "", status: "todos" });

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          matchesAny(
            searchFields.map((key) => pick(row, [key])),
            f.busca,
          ) &&
          (f.status === "todos" || (f.status === "ativo" ? row["status"] === true : row["status"] === false)),
      ),
    [rows, f, searchFields],
  );

  if (!perms.loading && !perms.canRead) {
    return <p className="text-muted-foreground text-sm">Você não tem acesso a esta página.</p>;
  }

  return (
    <>
      <DataTable
        title={title}
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
              placeholder={searchPlaceholder}
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

      <RecordSheet
        open={open}
        onOpenChange={setOpen}
        title={record ? `Editar ${singular}` : `Novo ${singular}`}
        fields={fields}
        record={record}
        saving={save.isPending}
        readOnly={record ? !perms.canUpdate : !perms.canCreate}
        onSave={(values) =>
          save.mutate(
            { values: stamp(values, !record), original: record },
            { onSuccess: () => setOpen(false) },
          )
        }
      />
    </>
  );
}
