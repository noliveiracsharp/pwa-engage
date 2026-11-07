import { useMemo, useState } from "react";
import { Briefcase, FolderOpen, Users, Building2, LayoutDashboard, Megaphone, PanelLeftClose, PanelLeftOpen, ParkingSquare, Shuffle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useTableRows } from "@/lib/crud";
import { cn } from "@/lib/utils";

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
  return useMemo(() => {
    const existe = (path: string) => funcoes.some((f) => String(f["path"] ?? "") === path);
    const painel: Secao = { key: "painel", label: "Painel", icon: LayoutDashboard, canRead: pagina.canRead, canCreate: false, canUpdate: pagina.canUpdate, canDelete: false };
    return [painel, ...DEF.map((d, i) => {
      const p = existe(d.path) ? [u, v, s, e, g, dc, av][i]! : pagina;
      return { key: d.key, label: d.label, icon: d.icon, canRead: p.canRead, canCreate: p.canCreate, canUpdate: p.canUpdate, canDelete: p.canDelete };
    })].filter((x) => x.canRead);
  }, [funcoes, u, v, s, e, g, dc, av, pagina]);
}

export function CondominiosSidebar({ secoes, ativa, onChange }: { secoes: Secao[]; ativa: string; onChange: (k: string) => void }) {
  const [aberto, setAberto] = useState(true);
  if (!aberto)
    return (
      <aside className="shrink-0 self-start rounded-lg border border-border bg-card p-1" aria-label="Menu de condomínios">
        <Button size="sm" variant="ghost" className="h-8 gap-1 px-2" onClick={() => setAberto(true)} aria-label="Mostrar menu" title="Mostrar menu">
          <PanelLeftOpen className="h-4 w-4" /><span className="text-xs md:hidden">Condomínio</span>
        </Button>
      </aside>
    );
  return (
    <aside className="w-full shrink-0 self-start rounded-lg border border-border bg-card p-2 md:w-64" aria-label="Menu de condomínios">
      <div className="mb-2 flex items-center gap-1 px-1">
        <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAberto(false)} aria-label="Recolher menu" title="Recolher menu"><PanelLeftClose className="h-4 w-4" /></Button>
          Condomínio
        </span>
      </div>
      <nav className="flex flex-col gap-0.5">
        {secoes.map((x) => (
          <button
            key={x.key}
            type="button"
            aria-current={ativa === x.key ? "page" : undefined}
            onClick={() => onChange(x.key)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ativa === x.key && "bg-primary/10 font-semibold text-primary",
            )}
          >
            <x.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{x.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
