import { useAuth } from "@/hooks/useAuth";
import { useTableRows, rowId } from "@/lib/crud";
import { pick } from "@/lib/row";
import { useTheme } from "@/components/theme-provider";

/** Empresa exibida no topo: a do contexto (Master) ou a do usuário. */
export function useEmpresaAtiva() {
  const { empresa, isMaster, empresaContextoId } = useAuth();
  const { theme } = useTheme();
  const { data: empresas = [] } = useTableRows("empresas", isMaster);
  const ctx = isMaster && empresaContextoId ? empresas.find((e) => String(rowId(e)) === String(empresaContextoId)) : undefined;
  const atual = ctx ?? empresa;
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
  };
}
