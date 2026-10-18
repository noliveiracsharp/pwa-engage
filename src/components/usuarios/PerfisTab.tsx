import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput } from "@/components/data-table/FilterField";
import { RecordSheet, type Field } from "@/components/data-table/RecordSheet";
import { rowId, text, useDeleteRecord, useSaveRecord, useTableRows } from "@/lib/crud";
import { matchesAny } from "@/lib/input-masks";
import { pick, type Row } from "@/lib/row";
import { useAuth } from "@/hooks/useAuth";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { toast } from "sonner";
import { useAudit } from "@/lib/audit";

const fields: Field[] = [
  { fields: ["descricao"], label: "Descrição", full: true },
  { fields: ["ordem"], label: "Nível (ordem)", type: "number" },
];

/** Cadastro de perfis; permissões vêm da função /perfil (tabela menu). */
export function PerfisTab() {
  const perms = usePagePermissions("/perfil");
  const { data: rows = [], isLoading } = useTableRows("perfil");
  const save = useSaveRecord("perfil");
  const remove = useDeleteRecord("perfil");
  const { usuario, isMaster } = useAuth();
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [busca, setBusca] = useState("");
  const { empresaId, stamp } = useAudit();

  const { data: minhaOrdem } = useQuery({
    queryKey: ["perfil-minha-ordem", text(pick(usuario, ["perfil_id", "id_perfil"]))],
    enabled: !isMaster && Boolean(pick(usuario, ["perfil_id", "id_perfil"])),
    queryFn: async () => {
      const { data } = await supabase
        .from("perfil")
        .select("ordem")
        .eq("id", pick(usuario, ["perfil_id", "id_perfil"]) as never)
        .maybeSingle();
      return Number((data as Row | null)?.["ordem"] ?? 0);
    },
  });

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => !r["empresa_id"] || empresaId === undefined || String(r["empresa_id"]) === String(empresaId))
        .filter((r) => matchesAny([pick(r, ["descricao"])], busca))
        .sort((a, b) => Number(a["ordem"] ?? 0) - Number(b["ordem"] ?? 0)),
    [rows, busca, empresaId],
  );

  const columns: Column[] = [
    { key: "descricao", header: "Descrição", fields: ["descricao"] },
    { key: "ordem", header: "Nível", fields: ["ordem"] },
    { key: "empresa_id", header: "Escopo", fields: ["empresa_id"], render: (r) => (r["empresa_id"] ? "Desta empresa" : "Padrão do sistema") },
  ];

  const handleSave = (values: Row) => {
    const ordem = Number(values["ordem"]);
    if (!(ordem > 0)) {
      toast.error("Informe um nível maior que zero.");
      return;
    }
    if (!isMaster && minhaOrdem !== undefined && ordem < minhaOrdem) {
      toast.error("Você não pode cadastrar um perfil acima do seu nível.");
      return;
    }
    save.mutate({ values: record ? { ...values, ordem } : stamp({ ...values, ordem }, true), original: record }, { onSuccess: () => { setOpen(false); setRecord(null); } });
  };

  if (!perms.loading && !perms.canRead) {
    return <p className="text-muted-foreground p-4 text-sm">Sem permissão para visualizar perfis.</p>;
  }

  return (
    <>
      <DataTable
        title="Perfis"
        columns={columns}
        rows={filtered}
        loading={isLoading}
        getValue={(row, keys) => pick(row, keys)}
        rowKey={(row, i) => String(rowId(row) ?? i)}
        onAdd={perms.canCreate ? () => { setRecord(null); setOpen(true); } : undefined}
        onEdit={(row) => { setRecord(row); setOpen(true); }}
        editReadOnly={!perms.canUpdate}
        onDelete={perms.canDelete ? (row) => remove.mutate(row) : undefined}
        filters={<FilterInput label="Buscar" value={busca} onChange={setBusca} placeholder="Descrição" />}
      />
      <RecordSheet
        auditTable="perfil"
        open={open}
        onOpenChange={setOpen}
        title={record ? "Editar perfil" : "Novo perfil"}
        description="Quanto menor o nível, maior a hierarquia."
        fields={fields}
        record={record}
        readOnly={record ? !perms.canUpdate : !perms.canCreate}
        saving={save.isPending}
        onSave={handleSave}
      />
    </>
  );
}
