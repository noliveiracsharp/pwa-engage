import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";
import { useAuth } from "@/hooks/useAuth";
import { useTableRows } from "@/lib/crud";
import { SUBMENU_REGISTRY } from "@/lib/submenu-registry";

// Só caminhos que são telas de verdade podem substituir a rota de um módulo sem rota (evita 404).
const ROTAS_TELA = new Set(Object.keys(SUBMENU_REGISTRY).filter((p) => !/^\/(orcamentos|cotacoes)\//.test(p)));

export type MenuItem = {
  id: string;
  label: string;
  path: string;
  icon: string;
  order: number;
  children?: MenuItem[] | undefined;
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
  { id: "parceiros", label: "Parceiros", path: "/parceiros", icon: "handshake", order: 12 },
  { id: "orcamentos", label: "Ofertas", path: "/orcamentos", icon: "file-text", order: 13 },
  { id: "relatorios", label: "Relatórios", path: "/relatorios", icon: "bar-chart-3", order: 14 },
];

// Perfil sem nenhuma permissão: apenas o Dashboard (nunca liberar tudo).
const DASHBOARD_ONLY: MenuItem[] = [];

function asBool(v: unknown, fallback = true): boolean {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "boolean") return v;
  return String(v) === "true" || String(v) === "1";
}

// Colunas reais da view vw_menu_usuario_perfil:
// menu_id, perfil_id, funcao_id, can_create, can_read, can_update, can_delete,
// funcao_descricao, funcao_ordem, funcao_status, path, icone, perfil_descricao
function normalize(row: Row, index: number): MenuItem & { parentId?: string } {
  // ordem_hierarquia vem como array ([pai, filho]); usa o último nível como ordem local.
  const oh = row["ordem_hierarquia"];
  const local = Array.isArray(oh) && oh.length ? Number(oh[oh.length - 1]) : Number(oh);
  const ordem = Number.isFinite(local) ? local : Number(pick(row, ["funcao_ordem", "ordem"], index + 1));
  const pai = pick(row, ["funcao_pai_id", "funcoes_pai_id"]);
  return {
    id: String(pick(row, ["funcao_id", "funcoes_id", "menu_id", "id"], `menu-${index}`)),
    label: String(pick(row, ["funcao_descricao", "descricao", "nome", "label"], "Menu")),
    path: String(pick(row, ["path", "funcao_path", "rota", "url"], "") ?? ""),
    icon: String(pick(row, ["icone", "funcao_icone", "icon"], "circle")),
    order: Number.isFinite(ordem) ? ordem : index + 1,
    ...(pai ? { parentId: String(pai) } : {}),
  };
}

export function useMenu() {
  const { usuario, user, isMaster } = useAuth();
  const perfilId = usuario ? pick<string | number>(usuario, ["perfil_id", "id_perfil"]) : undefined;

  const { data: funcoes, dataUpdatedAt: funcoesAt } = useTableRows("funcoes");

  // Tempo real global (useRealtimeRefresh) já invalida ["table","funcoes"] e ["table","menu"].
  const query = useQuery({
    // Prefixo ["table","menu"]: qualquer alteração em permissões invalida o menu junto.
    queryKey: ["table", "menu", "sidebar", String(perfilId ?? usuario?.["id"] ?? user?.id ?? null), isMaster, funcoesAt],
    enabled: Boolean(user && perfilId !== undefined),
    queryFn: async (): Promise<MenuItem[]> => {
      // Master: todas as funções ativas que são menu, ignorando planos/módulos/menu.
      if (isMaster) {
        const all = (funcoes ?? [])
          .filter((f) => asBool(f["status"]))
          .map((f, i) => ({
            id: String(pick(f, ["id"], `menu-${i}`)),
            label: String(pick(f, ["descricao", "nome"], "Menu")),
            path: String(pick(f, ["path"], "")),
            icon: String(pick(f, ["icone", "icon"], "circle")),
            order: Number(pick(f, ["ordem_hierarquia", "ordem"], i + 1)),
            ...(pick(f, ["funcoes_pai_id"]) ? { parentId: String(pick(f, ["funcoes_pai_id"])) } : {}),
          }))
          .sort((a, b) => a.order - b.order);
        return all.length > 0 ? all : FALLBACK;
      }
      const { data, error } = await supabase
        .from("vw_menu_usuario_perfil")
        .select("*")
        .eq("perfil_id", perfilId as string)
        .order("ordem_hierarquia");
      if (error || !data || data.length === 0) return DASHBOARD_ONLY;

      // Menu lateral: somente funcao_status = true e menu_ativo = true (da view, com fallback na tabela funcoes).
      // Todas as funções liberadas; filhas viram abas e levam o módulo raiz ao menu.
      const rows = (data as Row[]).filter((row) => asBool(row["can_read"]) && asBool(row["funcao_status"]));

      const items = rows.map(normalize).sort((a, b) => a.order - b.order);

      // Deduplica por id da função (a view repete linhas); nunca por nome, senão
      // um agrupador homônimo descarta o pai verdadeiro e os filhos caem na raiz.
      const seen = new Set<string>();
      const unique = items.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });

      return unique.length > 0 ? unique : DASHBOARD_ONLY;
    },
  });
  const data = query.data ? buildFlatMenu(query.data, funcoes ?? []) : query.data;
  return { ...query, data };
}

/**
 * Menu lateral 100% plano: só módulos raiz, sempre clicáveis.
 * Funções filhas nunca aparecem no menu — são abas da tela do módulo raiz.
 * Ter acesso a uma aba já exibe o módulo raiz (sem itens soltos/duplicados).
 */
export function buildFlatMenu(items: (MenuItem & { parentId?: string })[], funcoes: Row[]): MenuItem[] {
  const byId = new Map(funcoes.map((f) => [String(f["id"]), f]));
  const paiDe = (id: string, fallback?: string) => String(pick(byId.get(id) ?? {}, ["funcoes_pai_id"]) ?? fallback ?? "");
  const raizDe = (id: string, fallback?: string): string => {
    let atual = id;
    let pai = paiDe(atual, fallback);
    const vistos = new Set<string>([atual]);
    while (pai && !vistos.has(pai) && (byId.has(pai) || pai === fallback)) {
      vistos.add(pai);
      atual = pai;
      pai = paiDe(atual);
    }
    return atual;
  };
  const porRaiz = new Map<string, MenuItem & { primeiroFilho?: string | undefined }>();
  const ordenados = [...items].sort((a, b) => a.order - b.order);
  for (const item of ordenados) {
    const raizId = raizDe(item.id, item.parentId);
    const ehRaiz = raizId === item.id;
    const f = byId.get(raizId);
    // Raiz desativada ou oculta pelo cliente: o módulo inteiro some.
    if (!ehRaiz && f && f["status"] === false) continue;
    const atual = porRaiz.get(raizId);
    if (ehRaiz) {
      porRaiz.set(raizId, { ...(atual ?? {}), id: item.id, label: item.label, path: item.path || atual?.path || "", icon: item.icon, order: item.order, primeiroFilho: atual?.primeiroFilho });
      continue;
    }
    if (atual) { if (!atual.primeiroFilho && item.path && ROTAS_TELA.has(item.path)) atual.primeiroFilho = item.path; continue; }
    porRaiz.set(raizId, {
      id: raizId,
      label: String(pick(f ?? {}, ["descricao", "nome"], item.label)),
      path: String(pick(f ?? {}, ["path"], "") ?? ""),
      icon: String(pick(f ?? {}, ["icone", "icon"], item.icon)),
      order: Number(pick(f ?? {}, ["ordem"], item.order)),
      primeiroFilho: item.path && ROTAS_TELA.has(item.path) ? item.path : undefined,
    });
  }
  return [...porRaiz.values()]
    .map(({ primeiroFilho, ...m }) => ({ ...m, path: m.path || primeiroFilho || "", children: undefined }))
    .filter((m) => m.path)
    .sort((a, b) => a.order - b.order);
}

/** Abas da página pai: funções filhas com menu_ativo = false que o perfil pode ler. */
export function useSubmenuAbas(pathPai: string) {
  const { usuario, isMaster } = useAuth();
  const perfilId = usuario ? pick<string | number>(usuario, ["perfil_id", "id_perfil"]) : undefined;
  const { data: funcoes = [] } = useTableRows("funcoes");
  const pai = funcoes.find((f) => String(f["path"] ?? "") === pathPai);
  const paiId = pai ? String(pai["id"]) : "";
  const filhas = funcoes
    .filter((f) => paiId && String(f["funcoes_pai_id"] ?? "") === paiId && asBool(f["status"]))
    .sort((a, b) => Number(pick(a, ["ordem_hierarquia", "ordem"]) ?? 0) - Number(pick(b, ["ordem_hierarquia", "ordem"]) ?? 0));

  const { data: leitura } = useQuery({
    queryKey: ["table", "menu", "submenu-abas", pathPai, String(perfilId ?? ""), isMaster],
    enabled: !isMaster && perfilId !== undefined && filhas.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("vw_menu_usuario_perfil").select("*").eq("perfil_id", perfilId as string);
      return new Set(
        ((data ?? []) as Row[])
          .filter((r) => asBool(r["can_read"]))
          .map((r) => String(pick(r, ["funcao_id", "funcoes_id"]) ?? "")),
      );
    },
  });

  return filhas
    .filter((f) => isMaster || leitura?.has(String(f["id"])))
    .map((f) => ({
      id: String(f["id"]),
      label: String(pick(f, ["descricao", "nome"], "Aba")),
      path: String(pick(f, ["path"], "")),
      icon: String(pick(f, ["icone"], "circle")),
    }));
}
