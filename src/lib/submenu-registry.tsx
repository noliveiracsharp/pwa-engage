import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * Liga o caminho (path) de uma função filha de /funcoes à tela que a aba exibe.
 * A aba só aparece se o caminho estiver aqui E a view vw_menu_usuario_perfil liberar a função.
 */
type Loader = () => Promise<{ Route: { options: { component?: unknown } } }>;
const fromRoute = (load: Loader): LazyExoticComponent<ComponentType> =>
  lazy(async () => {
    const m = await load();
    return { default: m.Route.options.component as ComponentType };
  });

export const SUBMENU_REGISTRY: Record<string, LazyExoticComponent<ComponentType>> = {
  "/marcas": fromRoute(() => import("@/routes/_authenticated/marcas")),
  "/unid_medida": fromRoute(() => import("@/routes/_authenticated/unid_medida")),
  "/centro_custos": fromRoute(() => import("@/routes/_authenticated/centro_custos")),
  "/instancias": fromRoute(() => import("@/routes/_authenticated/instancias")),
  "/estoque": fromRoute(() => import("@/routes/_authenticated/estoque")),
  "/comissoes": fromRoute(() => import("@/routes/_authenticated/comissoes")),
  "/projetos/templates": fromRoute(() => import("@/routes/_authenticated/projetos_.templates")),
  "/perfil": fromRoute(() => import("@/routes/_authenticated/perfil")),
  "/funcoes": fromRoute(() => import("@/routes/_authenticated/funcoes")),
  "/usuarios": fromRoute(() => import("@/routes/_authenticated/usuarios")),
  "/empresas": fromRoute(() => import("@/routes/_authenticated/empresas")),
  "/pessoas": fromRoute(() => import("@/routes/_authenticated/pessoas")),
  "/parceiros": fromRoute(() => import("@/routes/_authenticated/parceiros")),
  "/itens": fromRoute(() => import("@/routes/_authenticated/itens")),
  "/orcamentos": fromRoute(() => import("@/routes/_authenticated/orcamentos")),
  "/kanban": fromRoute(() => import("@/routes/_authenticated/kanban")),
  "/laudos": fromRoute(() => import("@/routes/_authenticated/laudos")),
  "/cotacoes": fromRoute(() => import("@/routes/_authenticated/cotacoes")),
  "/relatorios": fromRoute(() => import("@/routes/_authenticated/relatorios")),
  "/admin/planos": fromRoute(() => import("@/routes/_authenticated/admin.planos")),
  "/admin/modulos": fromRoute(() => import("@/routes/_authenticated/admin.modulos")),
  "/admin/clientes": fromRoute(() => import("@/routes/_authenticated/admin.clientes")),
  "/admin/versoes": fromRoute(() => import("@/routes/_authenticated/admin.versoes")),
};
