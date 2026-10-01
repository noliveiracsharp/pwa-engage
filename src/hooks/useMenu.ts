import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";
import { useAuth } from "@/hooks/useAuth";
import { useTableRows } from "@/lib/crud";

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
  { id: "pessoas", label: "Pessoas", path: "/pessoas", icon: "users", order: 3 },
  { id: "usuarios", label: "Usuários", path: "/usuarios", icon: "user-cog", order: 4 },
  { id: "funcoes", label: "Funções", path: "/funcoes", icon: "shield-check", order: 5 },
  { id: "kanban", label: "Kanban", path: "/kanban", icon: "kanban", order: 6 },
  { id: "atendimentos", label: "Atendimentos", path: "/atendimentos", icon: "message-circle", order: 7 },
  { id: "itens", label: "Produtos e Serviços", path: "/itens", icon: "package", order: 8 },
  { id: "marcas", label: "Marcas", path: "/marcas", icon: "tag", order: 9 },
  { id: "unid_medida", label: "Unidades de Medida", path: "/unid_medida", icon: "ruler", order: 10 },
  { id: "centro_custos", label: "Centros de Custo", path: "/centro_custos", icon: "landmark", order: 11 },
  { id: "parceiros", label: "Parceiros", path: "/parceiros", icon: "handshake", order: 12 },
  { id: "orcamentos", label: "Orçamentos", path: "/orcamentos", icon: "file-text", order: 13 },
  { id: "relatorios", label: "Relatórios", path: "/relatorios", icon: "bar-chart-3", order: 14 },
];


function asBool(v: unknown, fallback = true): boolean {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "boolean") return v;
  return String(v) === "true" || String(v) === "1";
}

// Colunas reais da view vw_menu_usuario_perfil:
// menu_id, perfil_id, funcao_id, can_create, can_read, can_update, can_delete,
// funcao_descricao, funcao_ordem, funcao_status, path, icone, perfil_descricao
function normalize(row: Row, index: number): MenuItem {
  return {
    id: String(pick(row, ["funcao_id", "menu_id", "funcoes_id", "id"], `menu-${index}`)),
    label: String(pick(row, ["funcao_descricao", "descricao", "nome", "label"], "Menu")),
    path: String(pick(row, ["path", "funcao_path", "rota", "url"], "/dashboard")),
    icon: String(pick(row, ["icone", "funcao_icone", "icon"], "circle")),
    order: Number(pick(row, ["ordem_hierarquia", "funcao_ordem", "ordem", "order"], index + 1)),
  };
}

export function useMenu() {
  const { usuario, user } = useAuth();
  const perfilId = usuario ? pick<string | number>(usuario, ["perfil_id", "id_perfil"]) : undefined;

  const { data: funcoes } = useTableRows("funcoes");
  const submenuIds = new Set(
    (funcoes ?? []).filter((f) => f["menu_ativo"] === false).map((f) => String(f["id"])),
  );

  const query = useQuery({
    queryKey: ["menu", String(perfilId ?? usuario?.["id"] ?? user?.id ?? null)],
    enabled: Boolean(user && perfilId !== undefined),
    queryFn: async (): Promise<MenuItem[]> => {
      const { data, error } = await supabase
        .from("vw_menu_usuario_perfil")
        .select("*")
        .eq("perfil_id", perfilId as string)
        .order("ordem_hierarquia");
      if (error || !data || data.length === 0) return FALLBACK;

      // Menu lateral: somente funcao_status = true e menu_ativo = true (da view, com fallback na tabela funcoes).
      const rows = (data as Row[]).filter((row) => {
        const menuAtivo = pick(row, ["menu_ativo", "funcao_menu_ativo"]);
        const idFn = String(pick(row, ["funcao_id", "funcoes_id"]) ?? "");
        const isMenu = menuAtivo !== undefined ? asBool(menuAtivo) : !submenuIds.has(idFn);
        return asBool(row["can_read"]) && asBool(row["funcao_status"]) && isMenu;
      });

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
  // Itens com menu_ativo = false são submenus (abas dentro da página), não aparecem no menu lateral.
  const data = query.data?.filter((item) => !submenuIds.has(item.id));
  return { ...query, data };
}
