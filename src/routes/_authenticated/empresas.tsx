import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { EmpresaSheet } from "@/components/empresas/EmpresaSheet";
import { matches, rowId, text, useSaveRecord, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";

export const Route = createFileRoute("/_authenticated/empresas")({
  head: () => ({
    meta: [
      { title: "Empresas — Atende.ai" },
      { name: "description", content: "Empresas atendidas, instâncias vinculadas e campos personalizados." },
      { property: "og:title", content: "Empresas — Atende.ai" },
      {
        property: "og:description",
        content: "Empresas atendidas, instâncias vinculadas e campos personalizados.",
      },
    ],
  }),
  component: EmpresasPage,
});

const NOME = ["nome", "empresa_nome", "razao_social", "titulo"];
const DOC = ["documento", "cnpj", "cpf_cnpj"];
const STATUS = ["status", "empresa_status", "situacao", "ativo"];
const CRIADO = ["created_at", "criado_em", "data_cadastro", "datacadastro"];

function EmpresasPage() {
  const { data: rows = [], isLoading } = useTableRows("empresas");
  const save = useSaveRecord("empresas");
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [f, setF] = useState({ nome: "", documento: "", status: "todos" });

  const statusOptions = useMemo(() => {
    const set = new Set(rows.map((row) => text(pick(row, STATUS))).filter(Boolean));
    return [{ value: "todos", label: "Todos" }, ...[...set].map((s) => ({ value: s.toLowerCase(), label: s }))];
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          matches(pick(row, NOME), f.nome) &&
          matches(pick(row, DOC), f.documento) &&
          (f.status === "todos" || text(pick(row, STATUS)).toLowerCase() === f.status),
      ),
    [rows, f],
  );

  const columns: Column[] = [
    { key: "nome", header: "Nome", fields: NOME },
    { key: "documento", header: "Documento", fields: DOC },
    { key: "status", header: "Status", fields: STATUS },
    {
      key: "criado",
      header: "Criado em",
      fields: CRIADO,
      render: (row) => {
        const raw = pick<string>(row, CRIADO);
        if (!raw) return "—";
        const date = new Date(raw);
        return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString("pt-BR");
      },
    },
  ];

  return (
    <>
      <DataTable
        title="Empresas"
        columns={columns}
        rows={filtered}
        loading={isLoading}
        getValue={(row, keys) => pick(row, keys)}
        rowKey={(row, i) => String(rowId(row) ?? i)}
        onAdd={() => {
          setRecord(null);
          setOpen(true);
        }}
        onEdit={(row) => {
          setRecord(row);
          setOpen(true);
        }}
        filters={
          <>
            <FilterInput label="Nome" value={f.nome} onChange={(v) => setF({ ...f, nome: v })} />
            <FilterInput
              label="Documento"
              value={f.documento}
              onChange={(v) => setF({ ...f, documento: v })}
            />
            <FilterSelect
              label="Status"
              value={f.status}
              onChange={(v) => setF({ ...f, status: v })}
              options={statusOptions}
            />
          </>
        }
      />

      <EmpresaSheet
        open={open}
        onOpenChange={setOpen}
        empresa={record}
        saving={save.isPending}
        onSave={(values) => save.mutate({ values, original: record }, { onSuccess: () => setOpen(false) })}
      />
    </>
  );
}
