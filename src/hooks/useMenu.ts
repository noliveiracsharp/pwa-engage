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

function normalize(row: Row, index: number): MenuItem {
  return {
    id: String(pick(row, ["menu_id", "id", "id_menu"], `menu-${index}`)),
    label: String(pick(row, ["menu_descricao", "descricao", "menu_nome", "nome", "label", "titulo"], "Menu")),
    path: String(pick(row, ["menu_rota", "rota", "path", "url", "link", "caminho"], "/dashboard")),
    icon: String(pick(row, ["menu_icone", "icone", "icon"], "circle")),
    order: Number(pick(row, ["menu_ordem", "ordem", "order", "sequencia"], index + 1)),
  };
}

export function useMenu() {
  const { usuario, user } = useAuth();

  return useQuery({
    queryKey: ["menu", usuario?.["id"] ?? user?.id ?? null],
    enabled: Boolean(user),
    queryFn: async (): Promise<MenuItem[]> => {
      const { data, error } = await supabase.from("vw_menu_usuario_perfil").select("*");
      if (error || !data || data.length === 0) return FALLBACK;

      const rows = data as Row[];
      const usuarioId = usuario?.["id"] ?? user?.id;
      const filtered = rows.filter((row) => {
        const rowUser = pick(row, ["usuario_id", "id_usuario", "user_id"]);
        if (rowUser === undefined || usuarioId === undefined) return true;
        return String(rowUser) === String(usuarioId);
      });

      const source = filtered.length > 0 ? filtered : rows;
      const items = source.map(normalize).sort((a, b) => a.order - b.order);

      const seen = new Set<string>();
      return items.filter((item) => {
        const key = item.path + item.label;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
  });
}
