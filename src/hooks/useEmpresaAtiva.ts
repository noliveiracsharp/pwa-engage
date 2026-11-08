import { useAuth } from "@/hooks/useAuth";
import { useTableRows, rowId } from "@/lib/crud";
import { pick } from "@/lib/row";
import { useTheme } from "@/components/theme-provider";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lerAmbiente, useAmbientes } from "@/hooks/useAmbientes";
import { emModoUnidade } from "@/lib/ambientes";

/** Empresa exibida no topo: a do contexto (Master) ou a do usuário. */
export function useEmpresaAtiva() {
  const { empresa, isMaster, empresaContextoId } = useAuth();
  const { theme } = useTheme();
  const { data: empresas = [] } = useTableRows("empresas", isMaster);
  const ctx = isMaster && empresaContextoId ? empresas.find((e) => String(rowId(e)) === String(empresaContextoId)) : undefined;
  // No acesso de condomínio, a marca (logo/cores) do condomínio substitui a da administradora.
  const ambId = lerAmbiente();
  const { data: ambientes } = useAmbientes();
  const amb = emModoUnidade(ambId) ? ambientes?.find((a) => a.id === ambId) : undefined;
  const condId = amb && amb.tipo === "unidade" ? amb.vinculo.condominio_id : "";
  const { data: marcaCond } = useQuery({
    queryKey: ["cond-marca", condId],
    enabled: !!condId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("cond_marca", { p_condominio: condId });
      if (error) return null;
      return ((Array.isArray(data) ? data[0] : data) ?? null) as Record<string, unknown> | null;
    },
  });
  const base = ctx ?? empresa;
  const atual = marcaCond
    ? { ...(base ?? {}), ...Object.fromEntries(Object.entries(marcaCond).filter(([, v]) => v != null && v !== "")) }
    : base;
  const logo = pick<string>(atual, ["logo", "logo_url", "url_logo", "imagem", "avatar"]);
  const logoEscuro = pick<string>(atual, ["logo_escuro"], "");
  return {
    nome: pick<string>(atual, ["nome_fantasia", "nome", "empresa_nome", "razao_social"], "Atende.ai"),
    titulo: pick<string>(atual, ["titulo", "nome_fantasia", "nome", "razao_social"], "Atende.ai"),
    logo,
    logoEscuro,
    /** Logo conforme o tema atual; sem logo escuro, usa o padrão. */
    logoAtivo: theme === "dark" && logoEscuro ? logoEscuro : logo,
    favicon: pick<string>(atual, ["favicon"], ""),
    claro: pick<string>(atual, ["cor_primaria_claro"], ""),
    escuro: pick<string>(atual, ["cor_primaria_escuro"], ""),
    site: pick<string>(atual, ["site_url"], ""),
    slug: pick<string>(atual, ["slug"], ""),
  };
}
