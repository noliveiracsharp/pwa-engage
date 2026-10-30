import { createContext, Suspense, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSubmenuAbas } from "@/hooks/useMenu";
import { useTableRows } from "@/lib/crud";
import { pick } from "@/lib/row";
import { SUBMENU_REGISTRY } from "@/lib/submenu-registry";
import { usePagePermissions } from "@/hooks/usePagePermissions";

const PAGINA = "__pagina__";

/** Telas que já têm abas próprias recebem as abas filhas na mesma barra (sem duas fileiras). */
const ABAS_EMBUTIDAS = new Set(["/financeiro"]);
type AbaFilha = { id: string; path: string; label: string };
const AbasFilhasCtx = createContext<AbaFilha[]>([]);
export const useAbasFilhas = () => useContext(AbasFilhasCtx);

/** Conteúdo de uma aba filha (componente registrado), com carregamento. */
export function ConteudoAbaFilha({ path }: { path: string }) {
  const C = SUBMENU_REGISTRY[path];
  if (!C) return null;
  return <Suspense fallback={<p className="text-muted-foreground text-sm">Carregando…</p>}><C /></Suspense>;
}

/** Abas da página atual: funções filhas ocultas do menu, liberadas ao perfil (mesma view do menu lateral). */
export function SubmenuTabs({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (l) => l.pathname });
  const abas = useSubmenuAbas(pathname).filter((a) => SUBMENU_REGISTRY[a.path] && a.path !== pathname && !(pathname === "/empresas" && a.path === "/instancias"));
  const { data: funcoes = [] } = useTableRows("funcoes");
  const pai = funcoes.find((f) => String(f["path"] ?? "") === pathname);
  const [aba, setAba] = useState<string>(PAGINA);
  // Perfil sem leitura na tela principal (só em alguma aba): esconde a aba principal.
  const permsPai = usePagePermissions(pathname);
  const semPrincipal = !permsPai.loading && !permsPai.canRead && abas.length > 0;

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("aba");
    setAba(q ? `/${q.replace(/^\//, "")}` : PAGINA);
  }, [pathname]);

  if (abas.length === 0) return <>{children}</>;
  if (ABAS_EMBUTIDAS.has(pathname)) return <AbasFilhasCtx.Provider value={abas}>{children}</AbasFilhasCtx.Provider>;
  const padrao = semPrincipal ? abas[0]!.path : PAGINA;
  const ativa = abas.some((a) => a.path === aba) ? aba : aba === PAGINA && !semPrincipal ? PAGINA : padrao;

  const trocar = (v: string) => {
    setAba(v);
    const url = new URL(window.location.href);
    if (v === PAGINA) url.searchParams.delete("aba");
    else url.searchParams.set("aba", v.replace(/^\//, ""));
    window.history.replaceState(window.history.state, "", url.toString());
  };

  return (
    <Tabs value={ativa} onValueChange={trocar} className="min-w-0 space-y-4">
      <div className="min-w-0 overflow-x-auto">
        <TabsList className="h-9 w-max justify-start">
          {!semPrincipal && (
            <TabsTrigger value={PAGINA} className="px-3 text-sm">
              {String(pick(pai ?? {}, ["descricao", "nome"]) ?? "Principal")}
            </TabsTrigger>
          )}
          {abas.map((a) => (
            <TabsTrigger key={a.id} value={a.path} className="px-3 text-sm">
              {a.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {!semPrincipal && <TabsContent value={PAGINA}>{children}</TabsContent>}
      {abas.map((a) => {
        const C = SUBMENU_REGISTRY[a.path]!;
        return (
          <TabsContent key={a.id} value={a.path}>
            {ativa === a.path && (
              <Suspense fallback={<p className="text-muted-foreground text-sm">Carregando…</p>}>
                <C />
              </Suspense>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
