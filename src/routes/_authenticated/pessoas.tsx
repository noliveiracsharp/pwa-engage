import { useMemo, useState } from "react";
import { User } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { RecordSheet, type Field } from "@/components/data-table/RecordSheet";
import { StarRating } from "@/components/data-table/StarRating";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { PessoaCampos } from "@/components/pessoas/PessoaCampos";
import { idColumn, rowId, useSaveRecord, useTableRows } from "@/lib/crud";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { pick, type Row } from "@/lib/row";
import { usePagePermissions, subtabKind } from "@/hooks/usePagePermissions";
import { formatCpfCnpj, formatPhoneDisplay, matchesAny } from "@/lib/input-masks";

export const Route = createFileRoute("/_authenticated/pessoas")({
  head: () => ({
    meta: [
      { title: "Pessoas — Atende.ai" },
      { name: "description", content: "Cadastro e gestão das pessoas atendidas pela empresa." },
      { property: "og:title", content: "Pessoas — Atende.ai" },
      { property: "og:description", content: "Cadastro e gestão das pessoas atendidas pela empresa." },
    ],
  }),
  component: PessoasPage,
});

const fields: Field[] = [
  { fields: ["nome"], label: "Nome", full: true },
  { fields: ["email"], label: "E-mail", type: "email" },
  { fields: ["telefone"], label: "Telefone", type: "tel" },
  { fields: ["cpf"], label: "CPF", type: "document" },
  { fields: ["status"], label: "Status", type: "boolean" },
  { fields: ["foto"], label: "Foto", type: "photo", full: true },
  { fields: ["nota"], label: "Nota", type: "rating" },
  { fields: ["observacao"], label: "Observações", type: "textarea", full: true },
];

const STATUS_OPTIONS = [
  { value: "todos", label: "Todos" },
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
];

function PessoasPage() {
  const { data: rows = [], isLoading } = useTableRows("pessoas");
  const save = useSaveRecord("pessoas");
  const perms = usePagePermissions("/pessoas");
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [removing, setRemoving] = useState(false);
  const inativar = async () => {
    if (!toDelete) return;
    setRemoving(true);
    const key = idColumn(toDelete);
    const { error } = await supabase.from("pessoas").update({ status: false }).eq(key, toDelete[key] as never);
    setRemoving(false);
    if (error) return void toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["table", "pessoas"] });
    toast.success("Contato inativado.");
    setToDelete(null);
  };
  const excluir = async () => {
    if (!toDelete) return;
    setRemoving(true);
    try {
      const key = idColumn(toDelete);
      const id = toDelete[key] as never;
      await supabase.from("pessoas_camposperson").delete().eq("pessoa_id", id);
      const { error } = await supabase.from("pessoas").delete().eq(key, id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["table", "pessoas"] });
      toast.success("Contato excluído.");
      setToDelete(null);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const fk = err.code === "23503" || /foreign key|violates|viola/i.test(err.message ?? "");
      toast.error(
        fk
          ? "Este contato possui atendimentos ou outros registros associados e não pode ser excluído. Recomendamos inativá-lo."
          : err.message || "Não foi possível excluir.",
      );
    } finally {
      setRemoving(false);
    }
  };
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [f, setF] = useState({ busca: "", status: "todos", nota: "todas" });
  const { data: parceiros = [] } = useTableRows("parceiros");
  const formFields = useMemo<Field[]>(() => {
    const opts = [
      { value: "__none__", label: "Nenhum" },
      ...parceiros
        .map((p) => ({ value: String(rowId(p)), label: String(p["razao_social"] || p["nome_fantasia"] || "—") }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    ];
    const out = [...fields];
    out.splice(4, 0, { fields: ["parceiro_id"], label: "Parceiro", type: "select", options: opts });
    return out;
  }, [parceiros]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          matchesAny(
            [
              pick(row, ["nome"]),
              pick(row, ["email"]),
              pick(row, ["telefone"]),
              pick(row, ["cpf"]),
              pick(row, ["observacao"]),
            ],
            f.busca,
          ) &&
          (f.status === "todos" ||
            (f.status === "ativo" ? row["status"] === true : row["status"] === false)) &&
          (f.nota === "todas" || String(Number(pick(row, ["nota"]) ?? 0)) === f.nota),
      ),
    [rows, f],
  );

  const columns: Column[] = [
    {
      key: "nome",
      header: "Nome",
      fields: ["nome"],
      render: (row) => {
        const foto = pick(row, ["foto"]);
        const nome = pick(row, ["nome"], "—");
        return (
          <div className="flex items-center gap-2.5">
            {foto ? (
              <img
                src={foto}
                alt={nome}
                className="border-border h-8 w-8 shrink-0 rounded-full border object-cover"
              />
            ) : (
              <span className="bg-muted text-muted-foreground border-border flex h-8 w-8 shrink-0 items-center justify-center rounded-full border">
                <User className="h-4 w-4" />
              </span>
            )}
            <span>{nome}</span>
          </div>
        );
      },
    },
    { key: "email", header: "E-mail", fields: ["email"] },
    {
      key: "telefone",
      header: "Telefone",
      fields: ["telefone"],
      render: (row) => formatPhoneDisplay(String(pick(row, ["telefone"], ""))) || "—",
    },
    {
      key: "cpf",
      header: "CPF",
      fields: ["cpf"],
      render: (row) => formatCpfCnpj(String(pick(row, ["cpf"], ""))) || "—",
    },
    {
      key: "status",
      header: "Status",
      fields: ["status"],
      render: (row) => <StatusBadge value={row["status"]} />,
    },
    {
      key: "nota",
      header: "Nota",
      fields: ["nota"],
      render: (row) => <StarRating size="sm" value={Number(pick(row, ["nota"]) ?? 0)} />,
    },
  ];

  return (
    <>
      <DataTable
        title="Pessoas"
        columns={columns}
        rows={filtered}
        loading={isLoading}
        getValue={(row, keys) => pick(row, keys)}
        rowKey={(row, i) => String(rowId(row) ?? i)}
        onAdd={
          perms.canCreate
            ? () => {
                setRecord(null);
                setOpen(true);
              }
            : undefined
        }
        onEdit={(row) => {
          setRecord(row);
          setOpen(true);
        }}
        editReadOnly={!perms.canUpdate}
        onDelete={perms.canDelete ? (row) => setToDelete(row) : undefined}
        skipDeleteConfirm
        filters={
          <>
            <FilterInput
              label="Buscar"
              value={f.busca}
              onChange={(v) => setF({ ...f, busca: v })}
              placeholder="Nome, e-mail, telefone ou CPF"
            />
            <FilterSelect
              label="Status"
              value={f.status}
              onChange={(v) => setF({ ...f, status: v })}
              options={STATUS_OPTIONS}
            />
            <FilterSelect
              label="Nota"
              value={f.nota}
              onChange={(v) => setF({ ...f, nota: v })}
              options={[
                { value: "todas", label: "Todas" },
                ...[0, 1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} estrela(s)` })),
              ]}
            />
          </>
        }
      />

      <RecordSheet
        open={open}
        onOpenChange={setOpen}
        title={record ? "Editar pessoa" : "Nova pessoa"}
        fields={formFields}
        record={record}
        saving={save.isPending}
        readOnly={(() => {
          const d = perms.subtabs.find((t) => subtabKind(t) === "dados");
          const ok = record ? perms.canUpdate && (!d || d.canUpdate) : perms.canCreate && (!d || d.canCreate);
          return !ok;
        })()}
        {...(() => {
          const campos = <PessoaCampos pessoaId={record ? rowId(record) : undefined} />;
          if (perms.subtabs.length === 0) return { extra: campos, extraTabLabel: "Campos personalizados" };
          const dados = perms.subtabs.find((t) => subtabKind(t) === "dados");
          return {
            dataTabLabel: dados?.descricao ?? "Dados",
            hideDataTab: !dados,
            tabs: perms.subtabs
              .filter((t) => subtabKind(t) !== "dados")
              .map((t) => ({
                key: t.id,
                label: t.descricao,
                content: subtabKind(t) === "campos" ? campos : <p className="text-sm text-muted-foreground">Em breve.</p>,
              })),
          };
        })()}
        onSave={(values) => {
          if (values["parceiro_id"] === "__none__" || values["parceiro_id"] === "") values["parceiro_id"] = null;
          save.mutate(
            { values, original: record },
            { onSuccess: () => setOpen(false) },
          );
        }}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover contato</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja inativar este contato ou excluí-lo permanentemente?
              {toDelete && <strong className="block pt-2">{String(pick(toDelete, ["nome", "email"], ""))}</strong>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" disabled={removing} onClick={inativar}>
              Inativar
            </Button>
            <Button variant="destructive" disabled={removing} onClick={excluir}>
              Excluir permanentemente
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
