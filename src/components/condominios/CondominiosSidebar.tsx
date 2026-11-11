import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Briefcase, FolderOpen, Users, Building2, LayoutDashboard, Megaphone, ChevronLeft, ChevronRight, ParkingSquare, Shuffle, Vote, BellRing, PackageSearch, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useTableRows } from "@/lib/crud";
import { cn } from "@/lib/utils";
import { ChatInterno } from "@/components/chat-interno/ChatInterno";
import { VersaoSidebar } from "@/components/layout/NovidadesDialog";

type P = { canRead: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean };
export type Secao = P & { key: string; label: string; icon: LucideIcon };

const DEF = [
  { key: "unidades", label: "Estrutura & Unidades", path: "/condominios/unidades", icon: Building2 },
  { key: "vagas", label: "Garagem & Vagas", path: "/condominios/vagas", icon: ParkingSquare },
  { key: "sorteio", label: "Sorteio de Vagas", path: "/condominios/sorteio", icon: Shuffle },
  { key: "equipe", label: "Equipe & Diretoria", path: "/condominios/equipe", icon: Users },
  { key: "gestao", label: "Gestão & Terceiros", path: "/condominios/gestao", icon: Briefcase },
  { key: "documentos", label: "Documentos", path: "/condominios/documentos", icon: FolderOpen },
  { key: "avisos", label: "Avisos & Comunicados", path: "/condominios/avisos", icon: Megaphone },
  { key: "enquetes", label: "Enquetes & Pesquisas", path: "/condominios/enquetes", icon: Vote },
  { key: "interfone", label: "Interfone Virtual", path: "/condominios/interfone", icon: BellRing },
  { key: "achados", label: "Achados & Perdidos", path: "/condominios/achados", icon: PackageSearch },
] as const;

/**
 * Seções do menu lateral, cada uma liberada pela sua função filha em Perfis.
 * Enquanto a função filha não existir no banco, herda as permissões da página.
 */
export function useSecoesCondominio(pagina: P): Secao[] {
  const { data: funcoes = [] } = useTableRows("funcoes");
  const u = usePagePermissions(DEF[0].path);
  const v = usePagePermissions(DEF[1].path);
  const s = usePagePermissions(DEF[2].path);
  const e = usePagePermissions(DEF[3].path);
  const g = usePagePermissions(DEF[4].path);
  const dc = usePagePermissions(DEF[5].path);
  const av = usePagePermissions(DEF[6].path);
  const eq = usePagePermissions(DEF[7].path);
  const it = usePagePermissions(DEF[8].path);
  const ap = usePagePermissions(DEF[9].path);
  return useMemo(() => {
    const existe = (path: string) => funcoes.some((f) => String(f["path"] ?? "") === path);
    const painel: Secao = { key: "painel", label: "Painel", icon: LayoutDashboard, canRead: pagina.canRead, canCreate: false, canUpdate: pagina.canUpdate, canDelete: false };
    return [painel, ...DEF.map((d, i) => {
      const p = existe(d.path) ? [u, v, s, e, g, dc, av, eq, it, ap][i]! : pagina;
      return { key: d.key, label: d.label, icon: d.icon, canRead: p.canRead, canCreate: p.canCreate, canUpdate: p.canUpdate, canDelete: p.canDelete };
    })].filter((x) => x.canRead);
  }, [funcoes, u, v, s, e, g, dc, av, eq, it, ap, pagina]);
}

export function CondominiosSidebar({ secoes, ativa, onChange, topo, direto, chatCondominioId }: { chatCondominioId?: string | undefined; secoes: Secao[]; ativa: string; onChange: (k: string) => void; topo?: ReactNode; direto?: { nome: string; logo?: string | null; cargo?: string | null } | undefined }) {
  const [aberto, setAberto] = useState(false);
  // No acesso direto do condomínio, o botão de menu do cabeçalho abre/recolhe este menu.
  useEffect(() => {
    if (!direto) return;
    const alternar = () => setAberto((v) => !v);
    window.addEventListener("cond-menu-toggle", alternar);
    return () => window.removeEventListener("cond-menu-toggle", alternar);
  }, [direto]);
  return (
    <TooltipProvider delayDuration={100}>
    <aside
      aria-label="Menu de condomínios"
      className={cn(
        "flex shrink-0 flex-col border-b border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:self-stretch md:border-b-0 md:border-r",
        aberto ? "w-full md:w-60" : "w-full md:w-16",
      )}
    >
      <div className="flex flex-col md:sticky md:top-0">
        {direto && !aberto && <div className="h-2" />}
        {direto ? (
          aberto ? (
            <div className="mx-3 mb-3 mt-3 flex flex-col items-center gap-1 border-b border-sidebar-border pb-3 text-center">
              {direto.logo ? (
                <img src={direto.logo} alt={direto.nome} className="h-10 w-auto max-w-full object-contain" />
              ) : (
                <>
                  <span className="flex size-10 items-center justify-center rounded-full bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
                    {direto.nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
                  </span>
                  <span className="line-clamp-2 text-sm font-bold">{direto.nome}</span>
                </>
              )}
            </div>
          ) : null
        ) : (
        <div className={cn("flex items-center gap-2 px-3 pb-2 pt-4", !aberto && "md:justify-center md:px-0")}>
          <Building2 className="size-5 shrink-0" />
          {aberto && <span className="truncate text-base font-semibold">Condomínio</span>}
          <Button
            size="icon"
            variant="ghost"
            className={cn("ml-auto size-7 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", !aberto && "md:hidden")}
            onClick={() => setAberto((v) => !v)}
            aria-label={aberto ? "Recolher menu" : "Mostrar menu"}
            title={aberto ? "Recolher menu" : "Mostrar menu"}
          >
            {aberto ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>
        </div>
        )}
        {aberto && topo && !direto && <div className="px-3 pb-3 text-foreground">{topo}</div>}
        <nav className={cn("flex flex-col gap-0.5 pb-3", aberto ? "px-3" : "hidden md:flex md:px-2")}>
          {secoes.map((x) => {
            const ativo = ativa === x.key;
            const btn = (
              <button
                key={x.key}
                type="button"
                aria-label={x.label}
                aria-current={ativo ? "page" : undefined}
                onClick={() => onChange(x.key)}
                className={cn(
                  "flex w-full items-center gap-3 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  aberto ? "rounded-lg px-3" : "justify-center rounded-lg px-0",
                  ativo ? "bg-sidebar-primary font-semibold text-sidebar-primary-foreground hover:bg-sidebar-primary" : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <x.icon className={cn("shrink-0", aberto ? "size-4" : "size-5")} />
                {aberto && <span className="truncate">{x.label}</span>}
              </button>
            );
            if (aberto) return btn;
            return (
              <Tooltip key={x.key}>
                <TooltipTrigger asChild>{btn}</TooltipTrigger>
                <TooltipContent side="right">{x.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
        {!aberto && !direto && (
          <Button size="icon" variant="ghost" className="mx-auto mb-3 hidden size-8 text-sidebar-foreground hover:bg-sidebar-accent md:inline-flex" onClick={() => setAberto(true)} aria-label="Mostrar menu" title="Mostrar menu">
            <ChevronRight className="size-4" />
          </Button>
        )}
      </div>
      {/* Só quando este é o menu único (morador/síndico no acesso direto): o menu da empresa, que já tem chat e versão, fica oculto. */}
      {chatCondominioId && (
        <div className="mt-auto hidden flex-col gap-1 border-t border-sidebar-border p-2 md:sticky md:bottom-0 md:flex">
          <ChatInterno sidebarOpen={aberto} condominioId={chatCondominioId} />
          <VersaoSidebar open={aberto} />
        </div>
      )}
    </aside>
    </TooltipProvider>
  );
}
