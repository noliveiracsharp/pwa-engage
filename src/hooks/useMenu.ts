import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";
import { useAuth } from "@/hooks/useAuth";

export type MenuItem = {
  id: string;
  label: string;
  path: string;
  icon: string;
  order: number;
};

const FALLBACK: MenuItem[] = [
  { id: "dashboard", label: "Dashboard", path: "/dashboard", icon: "layout-dashboard", order: 1 },
  { id: "empresas", label: "Empresas", path: "/empresas", icon: "building-2", order: 2 },
  { id: "clientes", label: "Clientes", path: "/clientes", icon: "users", order: 3 },
  { id: "usuarios", label: "Usuários", path: "/usuarios", icon: "user-cog", order: 4 },
  { id: "funcoes", label: "Funções", path: "/funcoes", icon: "shield-check", order: 5 },
  { id: "kanban", label: "Kanban", path: "/kanban", icon: "kanban", order: 6 },
  { id: "atendimentos", label: "Atendimentos", path: "/atendimentos", icon: "message-circle", order: 7 },
];

function asBool(v: unknown, fallback = true): boolean {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "boolean") return v;
  return String(v) === "true" || String(v) === "1";
}

function normalize(row: Row, index: number): MenuItem {
  return {
    id: String(pick(row, ["funcoes_id", "menu_id", "id", "id_menu"], `menu-${index}`)),
    label: String(pick(row, ["funcao_descricao", "menu_descricao", "descricao", "menu_nome", "nome", "label", "titulo"], "Menu")),
    path: String(pick(row, ["funcao_path", "path", "menu_rota", "rota", "url", "link", "caminho"], "/dashboard")),
    icon: String(pick(row, ["funcao_icone", "icone", "menu_icone", "icon"], "circle")),
    order: Number(pick(row, ["funcao_ordem", "ordem", "menu_ordem", "order", "sequencia"], index + 1)),
  };
}

export function useMenu() {
  const { usuario, user } = useAuth();
  const perfilId = usuario ? pick<string | number>(usuario, ["perfil_id", "id_perfil"]) : undefined;

  return useQuery({
    queryKey: ["menu", String(perfilId ?? usuario?.["id"] ?? user?.id ?? null)],
    enabled: Boolean(user && perfilId !== undefined),
    queryFn: async (): Promise<MenuItem[]> => {
      const { data, error } = await supabase
        .from("vw_menu_usuario_perfil")
        .select("*")
        .eq("perfil_id", perfilId as string);
      if (error || !data || data.length === 0) return FALLBACK;

      const rows = (data as Row[]).filter(
        (row) =>
          asBool(row["can_read"]) &&
          asBool(row["menu_ativo"]) &&
          asBool(row["status"]) &&
          asBool(row["menu_status"]) &&
          asBool(row["funcao_status"]),
      );

      const items = rows.map(normalize).sort((a, b) => a.order - b.order);

      const seen = new Set<string>();
      const unique = items.filter((item) => {
        const key = item.path + item.label;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return unique.length > 0 ? unique : FALLBACK;
    },
  });
}
