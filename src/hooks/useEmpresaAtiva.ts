import { useAuth } from "@/hooks/useAuth";
import { useTableRows, rowId } from "@/lib/crud";
import { pick } from "@/lib/row";

/** Empresa exibida no topo: a do contexto (Master) ou a do usuário. */
export function useEmpresaAtiva() {
  const { empresa, isMaster, empresaContextoId } = useAuth();
  const { data: empresas = [] } = useTableRows("empresas", isMaster);
  const ctx = isMaster && empresaContextoId ? empresas.find((e) => String(rowId(e)) === String(empresaContextoId)) : undefined;
  const atual = ctx ?? empresa;
  return {
    nome: pick<string>(atual, ["nome_fantasia", "nome", "empresa_nome", "razao_social"], "Atende.ai"),
    titulo: pick<string>(atual, ["titulo", "nome_fantasia", "nome", "razao_social"], "Atende.ai"),
    logo: pick<string>(atual, ["logo", "logo_url", "url_logo", "imagem", "avatar"]),
  };
}
