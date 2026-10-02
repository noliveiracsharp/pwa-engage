import type { ReactNode } from "react";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { rowId, idColumn } from "@/lib/crud";
import type { Row } from "@/lib/row";

/** Grava ordem 0..n apenas nas linhas cuja posição mudou. */
export async function salvarOrdem(table: string, rows: Row[]): Promise<void> {
  const changes = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => Number(r["ordem"]) !== i);
  const results = await Promise.all(
    changes.map(({ r, i }) =>
      supabase.from(table).update({ ordem: i } as never).eq(idColumn(r), rowId(r) as never),
    ),
  );
  const err = results.find((x) => x.error)?.error;
  if (err) throw err;
}

export function proximaOrdem(rows: Row[]): number {
  return rows.reduce((m, r) => Math.max(m, Number(r["ordem"] ?? -1) || 0), -1) + 1;
}

/** Envolve a lista; devolve a nova ordem (com ordem recalculada) em onReorder. */
export function SortableList({ rows, onReorder, children }: { rows: Row[]; onReorder: (rows: Row[]) => void; children: ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = rows.map((r) => String(rowId(r)));
  function end(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(rows, from, to));
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>{children}</SortableContext>
    </DndContext>
  );
}

/** Hook para cada linha arrastável: aplica style/ref na linha e retorna a alça. */
export function useSortableRow(id: string, disabled: boolean) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : undefined, position: "relative" as const, zIndex: isDragging ? 10 : undefined };
  const handle = disabled ? null : (
    <button type="button" className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing" aria-label="Arrastar para reordenar" onClick={(e) => e.stopPropagation()} {...attributes} {...listeners}>
      <GripVertical className="h-4 w-4" />
    </button>
  );
  return { setNodeRef, style, handle };
}
