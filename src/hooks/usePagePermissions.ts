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
        .eq("perfil_id", perfilId as string);
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

    const subtabs: SubTab[] = funcoes
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
      .map((f) => {
        const id = String(rowId(f) ?? "");
        const p = unrestricted ? ALL : permsOf(byFuncao.get(id));
        return { id, descricao: String(f["descricao"] ?? ""), ...p };
      })
      .filter((t) => t.canRead);

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
