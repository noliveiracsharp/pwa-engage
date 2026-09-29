import { useAuth } from "@/hooks/useAuth";
import { rowId } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";

/** empresa_id da empresa ativa e alterado_por do usuário logado. */
export function useAudit() {
  const { usuario, empresa } = useAuth();
  const empresaId =
    (empresa ? rowId(empresa) : undefined) ??
    (usuario ? pick<string | number>(usuario, ["empresa_id", "id_empresa"]) : undefined);
  const usuarioId = usuario ? rowId(usuario) : undefined;

  /** Injeta empresa_id (apenas na criação) e alterado_por no payload. */
  const stamp = (values: Row, isNew: boolean): Row => {
    const payload: Row = { ...values };
    if (isNew && empresaId !== undefined) payload["empresa_id"] = empresaId;
    if (usuarioId !== undefined) payload["alterado_por"] = usuarioId;
    return payload;
  };

  return { empresaId, usuarioId, stamp };
}
