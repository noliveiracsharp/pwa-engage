import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, RefreshCw } from "lucide-react";
import { useAuth, AuthEscopoFinanceiro } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { Button } from "@/components/ui/button";
import { contextoFinanceiroAtual, type ContextoFinanceiro } from "@/lib/financeiro-contexto";
import { pick } from "@/lib/row";

export function ContextoFinanceiro({ children }: { children: ReactNode }) {
  const { empresa, user } = useAuth();
  const origemId = String(empresa?.["id"] ?? "");
  const [selecionada, setSelecionada] = useState("");
  const consulta = useQuery({
    queryKey: ["financeiro-contextos", user?.id, origemId],
    enabled: !!user && !!origemId,
    staleTime: 0,
    refetchInterval: 30_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cond_financeiro_contextos" as never, { p_empresa_id: origemId } as never);
      if (error) throw error;
      return (data ?? []) as unknown as ContextoFinanceiro[];
    },
  });
  const propria: ContextoFinanceiro | null = empresa && origemId ? {
    id: origemId, nome: pick<string>(empresa, ["titulo", "nome_fantasia", "nome", "razao_social"], "Administradora") ?? "Administradora",
    documento: String(empresa["cnpj_cpf"] ?? ""), tipo: "administradora", empresa,
  } : null;
  // Em erro de autorização/rede, nunca conserva um condomínio previamente autorizado.
  const carteira = consulta.isError ? (propria ? [propria] : []) : consulta.data ?? (propria ? [propria] : []);
  const opcoes = carteira.map((o) => o.id === origemId && propria ? { ...o, empresa: { ...propria.empresa, ...o.empresa } } : o);
  const atual = contextoFinanceiroAtual(opcoes, selecionada, origemId);
  if (!atual) return <p role="status" className="text-muted-foreground text-sm">Carregando empresa financeira…</p>;
  return <div className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
      <Building2 className="size-5 shrink-0 text-muted-foreground" />
      <div className="w-full min-w-0 sm:w-96">
        <SearchSelect value={atual.id} onChange={setSelecionada} options={opcoes.map((o) => ({ value: o.id, label: `${o.nome} · ${o.tipo === "condominio" ? "Condomínio" : "Empresa"}`, hint: o.documento })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))} placeholder="Empresa financeira" />
      </div>
      <Button size="icon" variant="ghost" aria-label="Atualizar carteira financeira" title="Atualizar carteira financeira" disabled={consulta.isFetching} onClick={() => void consulta.refetch()}><RefreshCw className={consulta.isFetching ? "size-4 animate-spin" : "size-4"} /></Button>
      {consulta.isError && <p role="status" className="text-muted-foreground w-full text-xs">Carteira de condomínios indisponível. Exibindo apenas a empresa atual.</p>}
    </div>
    <AuthEscopoFinanceiro key={`${user?.id}:${atual.id}`} empresa={atual.empresa}>
      {children}
    </AuthEscopoFinanceiro>
  </div>;
}