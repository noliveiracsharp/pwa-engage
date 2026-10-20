import { useMemo } from "react";
import { OrcamentoSheet } from "@/components/orcamentos/OrcamentoSheet";
import { useSaveOrcamento } from "@/hooks/useSaveOrcamento";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useAudit } from "@/lib/audit";
import { rowId, useTableRows } from "@/lib/crud";
import type { Row } from "@/lib/row";

const mesma = (r: Row, emp: unknown) => emp === undefined || !r["empresa_id"] || String(r["empresa_id"]) === String(emp);

/** Abre o formulário completo da Oferta dentro do Kanban, sem sair do funil. */
export function OfertaKanbanSheet({ oferta, onClose }: { oferta: Row | null; onClose: () => void }) {
  const perms = usePagePermissions("/orcamentos");
  const { empresaId, usuarioId } = useAudit();
  const { data: todos = [] } = useTableRows("orcamentos");
  const { data: linhas = [] } = useTableRows("orcamento_itens");
  const { data: parceiros = [] } = useTableRows("parceiros");
  const { data: usuarios = [] } = useTableRows("usuarios");
  const { data: itens = [] } = useTableRows("itens");
  const { data: unidades = [] } = useTableRows("unidade_medida");
  const { data: marcas = [] } = useTableRows("itens_marcas");
  const save = useSaveOrcamento();

  const id = oferta ? String(rowId(oferta) ?? oferta["id"] ?? "") : "";
  const record = useMemo(() => (id ? todos.find((t) => String(rowId(t)) === id) ?? oferta : null), [id, todos, oferta]);
  const linhasRecord = useMemo(() => linhas.filter((l) => String(l["orcamento_id"] ?? "") === id), [linhas, id]);

  return (
    <OrcamentoSheet
      open={!!oferta}
      onOpenChange={(o) => !o && onClose()}
      record={record}
      linhasRecord={linhasRecord}
      saving={save.isPending}
      readOnly={!perms.canUpdate}
      clientes={parceiros.filter((p) => mesma(p, empresaId) && p["is_cliente"] === true)}
      vendedores={usuarios.filter((u) => mesma(u, empresaId))}
      itens={itens.filter((i) => mesma(i, empresaId))}
      unidades={unidades}
      marcas={marcas}
      vendedorPadraoId={usuarioId !== undefined ? String(usuarioId) : undefined}
      onSave={({ header, linhas: l, manterAberto }) =>
        save.mutate({ header, linhas: l, original: record }, { onSuccess: () => { if (!manterAberto) onClose(); } })
      }
    />
  );
}
