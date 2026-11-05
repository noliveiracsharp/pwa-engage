import { useMemo, useState } from "react";
import { Building2, LayoutDashboard, PanelLeftClose, PanelLeftOpen, ParkingSquare, Shuffle, type LucideIcon } from "lucide-react";
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
  return useMemo(() => {
    const existe = (path: string) => funcoes.some((f) => String(f["path"] ?? "") === path);
    const painel: Secao = { key: "painel", label: "Painel", icon: LayoutDashboard, canRead: pagina.canRead, canCreate: false, canUpdate: pagina.canUpdate, canDelete: false };
    return [painel, ...DEF.map((d, i) => {
      const p = existe(d.path) ? [u, v, s][i]! : pagina;
      return { key: d.key, label: d.label, icon: d.icon, canRead: p.canRead, canCreate: p.canCreate, canUpdate: p.canUpdate, canDelete: p.canDelete };
    })].filter((x) => x.canRead);
  }, [funcoes, u, v, s, pagina]);
}

export function CondominiosSidebar({ secoes, ativa, onChange }: { secoes: Secao[]; ativa: string; onChange: (k: string) => void }) {
  const [aberto, setAberto] = useState(true);
  return (
    <aside className={cn("shrink-0 border-r bg-card transition-all", aberto ? "w-56" : "w-12")} aria-label="Menu de condomínios">
      <div className={cn("flex items-center p-2", aberto ? "justify-between" : "justify-center")}>
        {aberto && <span className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condomínio</span>}
        <Button size="icon" variant="ghost" className="size-8" aria-label={aberto ? "Recolher menu" : "Expandir menu"} onClick={() => setAberto(!aberto)}>
          {aberto ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
        </Button>
      </div>
      <nav className="flex flex-col gap-1 p-2">
        {secoes.map((x) => (
          <button
            key={x.key}
            type="button"
            title={x.label}
            aria-current={ativa === x.key ? "page" : undefined}
            onClick={() => onChange(x.key)}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ativa === x.key && "bg-primary/10 font-medium text-primary",
              !aberto && "justify-center",
            )}
          >
            <x.icon className="size-4 shrink-0" />
            {aberto && <span className="truncate">{x.label}</span>}
          </button>
        ))}
      </nav>
    </aside>
  );
}
