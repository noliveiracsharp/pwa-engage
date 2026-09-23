import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTableRows, rowId } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";

export type Perms = { canRead: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean };
export type SubTab = Perms & { id: string; descricao: string };

const ALL: Perms = { canRead: true, canCreate: true, canUpdate: true, canDelete: true };
const NONE: Perms = { canRead: false, canCreate: false, canUpdate: false, canDelete: false };

function asBool(v: unknown, fallback = true): boolean {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "boolean") return v;
  return String(v) === "true" || String(v) === "1";
}

function permsOf(row: Row | undefined): Perms {
  if (!row) return NONE;
  return {
    canRead: asBool(row["can_read"], false),
    canCreate: asBool(row["can_create"], false),
    canUpdate: asBool(row["can_update"], false),
    canDelete: asBool(row["can_delete"], false),
  };
}

/** Linhas da view vw_menu_usuario_perfil para o perfil logado (null = não verificável). */
export function usePerfilMenuRows() {
  const { usuario, user } = useAuth();
  const perfilId = usuario ? pick<string | number>(usuario, ["perfil_id", "id_perfil"]) : undefined;
  return useQuery({
    queryKey: ["table", "menu", "perfil-view", String(perfilId ?? "")],
    enabled: Boolean(user && perfilId !== undefined && perfilId !== null),
    queryFn: async (): Promise<Row[] | null> => {
      const { data, error } = await supabase
        .from("vw_menu_usuario_perfil")
        .select("*")
        .eq("perfil_id", perfilId as string)
        .order("ordem_hierarquia");
      if (error) return null;
      return (data ?? []) as Row[];
    },
  });
}

/**
 * Permissões da página (can_create/can_update/can_delete da tabela menu)
 * e submenus (funções filhas com menu_ativo = false) liberados ao perfil.
 */
export function usePagePermissions(path: string) {
  const { data: viewRows, isLoading } = usePerfilMenuRows();
  const { data: funcoes = [] } = useTableRows("funcoes");

  return useMemo(() => {
    const unrestricted = viewRows === null || (viewRows !== undefined && viewRows.length === 0);
    const byFuncao = new Map<string, Row>();
    for (const r of viewRows ?? []) byFuncao.set(String(pick(r, ["funcao_id", "funcoes_id"]) ?? ""), r);

    const pageFuncao =
      funcoes.find((f) => String(pick(f, ["path"]) ?? "") === path && !pick(f, ["funcoes_pai_id"])) ??
      funcoes.find((f) => String(pick(f, ["path"]) ?? "") === path);
    const pageId = pageFuncao ? String(rowId(pageFuncao) ?? "") : "";
    const viewPageRow =
      (pageId && byFuncao.get(pageId)) || (viewRows ?? []).find((r) => String(r["path"] ?? "") === path);

    const page: Perms = unrestricted ? ALL : viewRows === undefined ? NONE : permsOf(viewPageRow);

    const funcById = new Map<string, Row>();
    for (const f of funcoes) funcById.set(String(rowId(f) ?? ""), f);
    const parentOf = (id: string, r?: Row) =>
      String(
        (r && pick(r, ["funcoes_pai_id", "funcao_pai_id"])) ??
          pick(funcById.get(id) ?? {}, ["funcoes_pai_id"]) ??
          "",
      );
    const isSubmenu = (id: string, r?: Row) => {
      const v = r ? pick(r, ["menu_ativo", "funcao_menu_ativo"]) : undefined;
      if (v !== undefined) return !asBool(v);
      return funcById.get(id)?.["menu_ativo"] === false;
    };

    let subtabs: SubTab[];
    if (!unrestricted && viewRows) {
      // Submenus vindos da view (perfil logado): menu_ativo = false, pai = página, funcao_status = true.
      subtabs = viewRows
        .map((r) => ({ r, id: String(pick(r, ["funcao_id", "funcoes_id"]) ?? "") }))
        .filter(
          ({ r, id }) =>
            pageId !== "" &&
            parentOf(id, r) === pageId &&
            isSubmenu(id, r) &&
            asBool(r["funcao_status"]),
        )
        .sort(
          (a, b) =>
            Number(pick(a.r, ["funcao_ordem"]) ?? pick(funcById.get(a.id) ?? {}, ["ordem"]) ?? 0) -
              Number(pick(b.r, ["funcao_ordem"]) ?? pick(funcById.get(b.id) ?? {}, ["ordem"]) ?? 0) ||
            String(a.r["funcao_descricao"] ?? "").localeCompare(String(b.r["funcao_descricao"] ?? ""), "pt-BR"),
        )
        .map(({ r, id }) => ({
          id,
          descricao: String(pick(r, ["funcao_descricao"]) ?? funcById.get(id)?.["descricao"] ?? ""),
          ...permsOf(r),
        }))
        .filter((t) => t.canRead);
    } else {
      subtabs = funcoes
        .filter(
          (f) =>
            pageId !== "" &&
            String(pick(f, ["funcoes_pai_id"]) ?? "") === pageId &&
            f["menu_ativo"] === false &&
            f["status"] !== false,
        )
        .sort(
          (a, b) =>
            Number(pick(a, ["ordem"]) ?? 0) - Number(pick(b, ["ordem"]) ?? 0) ||
            String(a["descricao"] ?? "").localeCompare(String(b["descricao"] ?? ""), "pt-BR"),
        )
        .map((f) => ({ id: String(rowId(f) ?? ""), descricao: String(f["descricao"] ?? ""), ...ALL }));
    }

    return { ...page, loading: isLoading, subtabs, hasSubtabDefinitions: funcoes.some((f) => pageId && String(pick(f, ["funcoes_pai_id"]) ?? "") === pageId && f["menu_ativo"] === false) };
  }, [viewRows, funcoes, path, isLoading]);
}

/** Identifica qual aba do formulário a função filha representa. */
export function subtabKind(tab: { id: string; descricao: string }): string {
  const ids: Record<string, string> = {
    "2ffe6a6b-309f-4b4d-97dc-3dd8fe7cbff0": "dados",
    "bdef6529-5256-46fb-be13-a5ba66ccbbec": "instancias",
    "3ae37a9b-2c12-4e4c-9f04-ec30cdf44573": "campos",
    "eca0f01f-63f1-46f3-a1c3-dc26214af3e7": "etiquetas",
  };
  if (ids[tab.id]) return ids[tab.id]!;
  const d = tab.descricao.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (d.includes("instanc")) return "instancias";
  if (d.includes("etiquet")) return "etiquetas";
  if (d.includes("nota")) return "notas";
  if (d.includes("campo")) return "campos";
  if (d.includes("dado")) return "dados";
  return "outro";
}
