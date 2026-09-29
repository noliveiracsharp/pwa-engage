import { rowId } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";

export type TreeNode = { row: Row; depth: number; path: string };

const labelOf = (r: Row) =>
  [pick(r, ["codigo"]), pick(r, ["descricao"])].filter(Boolean).join(" — ") || "—";

/** Ordena as linhas em árvore (pai seguido dos filhos), com profundidade e caminho "Pai > Filho". */
export function buildTree(rows: Row[], parentKey: string): TreeNode[] {
  const ids = new Set(rows.map((r) => String(rowId(r))));
  const byParent = new Map<string, Row[]>();
  for (const r of rows) {
    const p = pick(r, [parentKey]);
    const key = p != null && ids.has(String(p)) ? String(p) : "";
    byParent.set(key, [...(byParent.get(key) ?? []), r]);
  }
  const sortFn = (a: Row, b: Row) =>
    String(pick(a, ["codigo"], "") ?? "").localeCompare(String(pick(b, ["codigo"], "") ?? ""), "pt-BR", { numeric: true }) ||
    labelOf(a).localeCompare(labelOf(b), "pt-BR");
  const out: TreeNode[] = [];
  const seen = new Set<string>();
  const walk = (key: string, depth: number, prefix: string) => {
    for (const r of [...(byParent.get(key) ?? [])].sort(sortFn)) {
      const id = String(rowId(r));
      if (seen.has(id)) continue;
      seen.add(id);
      const path = prefix ? `${prefix} > ${labelOf(r)}` : labelOf(r);
      out.push({ row: r, depth, path });
      walk(id, depth + 1, path);
    }
  };
  walk("", 0, "");
  // Linhas em ciclo ficam no final, no nível raiz.
  for (const r of rows) if (!seen.has(String(rowId(r)))) out.push({ row: r, depth: 0, path: labelOf(r) });
  return out;
}

/** Ids do item e de todos os seus descendentes (para não permitir escolher como pai). */
export function descendantIds(rows: Row[], parentKey: string, id: string): Set<string> {
  const result = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of rows) {
      const rid = String(rowId(r));
      if (!result.has(rid) && result.has(String(pick(r, [parentKey]) ?? ""))) {
        result.add(rid);
        changed = true;
      }
    }
  }
  return result;
}
