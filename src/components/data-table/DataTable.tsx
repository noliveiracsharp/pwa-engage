import { FilterBar } from "./FilterField";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronsUpDown, Copy, Eye, GripVertical, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Row } from "@/lib/row";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { Checkbox } from "@/components/ui/checkbox";

export type Column = {
  key: string;
  header: string;
  /** Column name candidates in the database row. */
  fields: string[];
  sortable?: boolean;
  render?: (row: Row) => ReactNode;
  className?: string;
};

type Props = {
  title: string;
  columns: Column[];
  rows: Row[];
  loading?: boolean;
  filters?: ReactNode;
  getValue: (row: Row, fields: string[]) => unknown;
  /** Omit to hide the "Adicionar" button (no can_create). */
  onAdd?: (() => void) | undefined;
  /** Omit to hide the edit button (no can_update). */
  onEdit?: ((row: Row) => void) | undefined;
  editReadOnly?: boolean;
  /** When set, shows a duplicate button per row (can_create). */
  onDuplicate?: ((row: Row) => void) | undefined;
  /** When set, shows a delete button per row (can_delete). */
  onDelete?: ((row: Row) => void) | undefined;
  /** Skips the built-in confirm (the page shows its own dialog). */
  skipDeleteConfirm?: boolean;
  rowKey: (row: Row, index: number) => string;
  /** Enables drag-and-drop row reordering (active when no column sort is applied). */
  onReorder?: (ordered: Row[]) => void;
  rowDepth?: (row: Row) => number;
  rowHasChildren?: (row: Row) => boolean;
  rowExpanded?: (row: Row) => boolean;
  onToggleRow?: (row: Row) => void;
  /** When set, row actions collapse into a ⋮ menu with these items plus Editar/Excluir. */
  rowMenu?: (row: Row) => ReactNode;
  /** Per-row toggle of the built-in Editar/Excluir actions in the ⋮ menu. */
  rowActions?: (row: Row) => { edit: boolean; delete: boolean };
  /** Enables a checkbox per row (keys come from rowKey). */
  selection?: { selected: Set<string>; onChange: (s: Set<string>) => void } | undefined;
  /** Rendered above the table (e.g. bulk actions bar). */
  bulkBar?: ReactNode;
};

export function DataTable({
  title,
  columns,
  rows,
  loading,
  filters,
  getValue,
  onAdd,
  onEdit,
  editReadOnly,
  onDelete,
  onDuplicate,
  skipDeleteConfirm,
  rowMenu,
  rowActions,
  rowKey,
  onReorder,
  rowDepth,
  rowHasChildren,
  rowExpanded,
  onToggleRow,
  selection,
  bulkBar,
}: Props) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = getValue(a, col.fields);
      const vb = getValue(b, col.fields);
      if (va === undefined || va === null) return 1;
      if (vb === undefined || vb === null) return -1;
      const na = Number(va);
      const nb = Number(vb);
      const cmp =
        !Number.isNaN(na) && !Number.isNaN(nb) && va !== "" && vb !== ""
          ? na - nb
          : String(va).localeCompare(String(vb), "pt-BR", { sensitivity: "base" });
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort, columns, getValue]);

  const total = sorted.length;
  const size = pageSize || Math.max(total, 1);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(page, totalPages);
  const pageRows = sorted.slice((current - 1) * size, current * size);
  const colSpan = columns.length + (onReorder ? 2 : 1) + (selection ? 1 : 0);
  const canDrag = Boolean(onReorder) && !sort;

  const handleDrop = (target: number) => {
    if (dragIndex === null || !onReorder || dragIndex === target) {
      setDragIndex(null);
      setDropIndex(null);
      return;
    }
    const next = [...sorted];
    const [moved] = next.splice(dragIndex, 1);
    if (!moved) {
      setDragIndex(null);
      setDropIndex(null);
      return;
    }
    next.splice(target, 0, moved);
    setDragIndex(null);
    setDropIndex(null);
    onReorder(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {onAdd && (
          <Button onClick={onAdd}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar
          </Button>
        )}
      </div>

      {filters && (
        <FilterBar className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
          {filters}
        </FilterBar>
      )}

      {bulkBar}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {selection && (
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Selecionar página"
                    checked={pageRows.length > 0 && pageRows.every((r, i) => selection.selected.has(rowKey(r, i)))}
                    onCheckedChange={(v) => {
                      const n = new Set(selection.selected);
                      pageRows.forEach((r, i) => (v ? n.add(rowKey(r, i)) : n.delete(rowKey(r, i))));
                      selection.onChange(n);
                    }}
                  />
                </TableHead>
              )}
              {onReorder && <TableHead className="w-10" />}
              {columns.map((col) => (
                <TableHead key={col.key} className={col.className}>
                  {col.sortable === false ? (
                    col.header
                  ) : (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                      onClick={() =>
                        setSort((prev) =>
                          prev?.key === col.key
                            ? { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" }
                            : { key: col.key, dir: "asc" },
                        )
                      }
                    >
                      {col.header}
                      {sort?.key === col.key ? (
                        sort.dir === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
                      )}
                    </button>
                  )}
                </TableHead>
              ))}
              <TableHead className="w-px whitespace-nowrap text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!loading && pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
                  Nenhum registro encontrado.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              pageRows.map((row, index) => {
                const globalIndex = (current - 1) * size + index;
                return (
                <TableRow
                  key={rowKey(row, index)}
                  draggable={canDrag}
                  onDragStart={canDrag ? () => setDragIndex(globalIndex) : undefined}
                  onDragOver={canDrag ? (e) => { e.preventDefault(); setDropIndex(globalIndex); } : undefined}
                  onDrop={canDrag ? () => handleDrop(globalIndex) : undefined}
                  onDragEnd={canDrag ? () => { setDragIndex(null); setDropIndex(null); } : undefined}
                  className={cn(
                    canDrag && "cursor-grab active:cursor-grabbing",
                    dragIndex === globalIndex && "opacity-50",
                    dropIndex === globalIndex && dragIndex !== null && dragIndex !== globalIndex && "border-t-2 border-primary",
                  )}
                >
                  {selection && (
                    <TableCell className="w-10">
                      <Checkbox
                        aria-label="Selecionar registro"
                        checked={selection.selected.has(rowKey(row, index))}
                        onCheckedChange={() => {
                          const k = rowKey(row, index);
                          const n = new Set(selection.selected);
                          if (n.has(k)) n.delete(k); else n.add(k);
                          selection.onChange(n);
                        }}
                      />
                    </TableCell>
                  )}
                  {onReorder && (
                    <TableCell className="w-10 text-muted-foreground">
                      <GripVertical className="h-4 w-4" />
                    </TableCell>
                  )}
                  {columns.map((col, columnIndex) => {
                    const content = col.render ? col.render(row) : ((getValue(row, col.fields) as ReactNode) ?? "—");
                    const depth = rowDepth?.(row) ?? 0;
                    const hasChildren = rowHasChildren?.(row) ?? false;
                    return (
                      <TableCell key={col.key} className={cn("whitespace-nowrap", col.className)}>
                        {columnIndex === 0 && rowDepth ? (
                          <div className="flex items-center" style={{ paddingInlineStart: `${depth * 24}px` }}>
                            {hasChildren && onToggleRow ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="mr-1 h-7 w-7 shrink-0"
                                aria-label={rowExpanded?.(row) ? "Recolher itens filhos" : "Expandir itens filhos"}
                                aria-expanded={rowExpanded?.(row) ?? false}
                                onClick={() => onToggleRow(row)}
                              >
                                {rowExpanded?.(row) ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                            ) : (
                              <span className="mr-1 block h-7 w-7 shrink-0" />
                            )}
                            <span>{content}</span>
                          </div>
                        ) : (
                          content
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right">
                    {(rowMenu || onEdit || onDuplicate || onDelete) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Ações" title="Ações">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-60">
                          {rowMenu?.(row)}
                          {rowMenu && ((onEdit && rowActions?.(row).edit !== false) || onDuplicate || (onDelete && rowActions?.(row).delete !== false)) && <DropdownMenuSeparator />}
                          {onEdit && rowActions?.(row).edit !== false && (
                            <DropdownMenuItem onClick={() => onEdit(row)}>
                              {editReadOnly ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                              {editReadOnly ? "Visualizar" : "Editar"}
                            </DropdownMenuItem>
                          )}
                          {onDuplicate && (
                            <DropdownMenuItem onClick={() => onDuplicate(row)}>
                              <Copy className="h-4 w-4" />
                              Duplicar
                            </DropdownMenuItem>
                          )}
                          {onDelete && rowActions?.(row).delete !== false && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={async () => {
                                if (skipDeleteConfirm || await confirmar("Deseja realmente excluir este registro?")) onDelete(row);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Linhas por página</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 50, 100, 0].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n || "Todos"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span>
            {total === 0 ? 0 : (current - 1) * size + 1}–{Math.min(current * size, total)} de {total}
          </span>
          <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={current >= totalPages}
            onClick={() => setPage(current + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}
