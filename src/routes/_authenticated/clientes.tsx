import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { RecordSheet, type Field } from "@/components/data-table/RecordSheet";
import { StarRating } from "@/components/data-table/StarRating";
import { matches, rowId, text, useSaveRecord, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — Atende.ai" },
      { name: "description", content: "Cadastro e gestão dos clientes atendidos pela empresa." },
      { property: "og:title", content: "Clientes — Atende.ai" },
      { property: "og:description", content: "Cadastro e gestão dos clientes atendidos pela empresa." },
    ],
  }),
  component: ClientesPage,
});

const NOME = ["nome", "cliente_nome", "nome_completo", "razao_social"];
const EMAIL = ["email", "cliente_email", "e_mail"];
const TELEFONE = ["telefone", "cliente_telefone", "celular", "whatsapp", "fone"];
const CPF = ["cpf", "cliente_cpf", "documento", "cpf_cnpj"];
const STATUS = ["status", "cliente_status", "ativo", "situacao"];
const NOTA = ["nota", "cliente_nota", "avaliacao", "rating"];
const OBS = ["observacoes", "observacao", "obs", "cliente_observacoes"];
const FOTO = ["foto", "avatar", "imagem", "foto_url"];

const fields: Field[] = [
  { fields: NOME, label: "Nome", full: true },
  { fields: EMAIL, label: "E-mail", type: "email" },
  { fields: TELEFONE, label: "Telefone", type: "tel" },
  { fields: CPF, label: "CPF/CNPJ" },
  { fields: STATUS, label: "Status" },
  { fields: FOTO, label: "Foto (URL)", full: true },
  { fields: NOTA, label: "Nota", type: "rating" },
  { fields: OBS, label: "Observações", type: "textarea", full: true },
];

function ClientesPage() {
  const { data: rows = [], isLoading } = useTableRows("clientes");
  const save = useSaveRecord("clientes");
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [f, setF] = useState({ nome: "", email: "", telefone: "", cpf: "", status: "todos", nota: "todas" });

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          matches(pick(row, NOME), f.nome) &&
          matches(pick(row, EMAIL), f.email) &&
          matches(pick(row, TELEFONE), f.telefone) &&
          matches(pick(row, CPF), f.cpf) &&
          (f.status === "todos" || text(pick(row, STATUS)).toLowerCase() === f.status) &&
          (f.nota === "todas" || String(Number(pick(row, NOTA) ?? 0)) === f.nota),
      ),
    [rows, f],
  );

  const statusOptions = useMemo(() => {
    const set = new Set(rows.map((row) => text(pick(row, STATUS))).filter(Boolean));
    return [{ value: "todos", label: "Todos" }, ...[...set].map((s) => ({ value: s.toLowerCase(), label: s }))];
  }, [rows]);

  const columns: Column[] = [
    { key: "nome", header: "Nome", fields: NOME },
    { key: "email", header: "E-mail", fields: EMAIL },
    { key: "telefone", header: "Telefone", fields: TELEFONE },
    { key: "cpf", header: "CPF/CNPJ", fields: CPF },
    { key: "status", header: "Status", fields: STATUS },
    {
      key: "nota",
      header: "Nota",
      fields: NOTA,
      render: (row) => <StarRating size="sm" value={Number(pick(row, NOTA) ?? 0)} />,
    },
  ];

  return (
    <>
      <DataTable
        title="Clientes"
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
            <FilterInput label="E-mail" value={f.email} onChange={(v) => setF({ ...f, email: v })} />
            <FilterInput label="Telefone" value={f.telefone} onChange={(v) => setF({ ...f, telefone: v })} />
            <FilterInput label="CPF" value={f.cpf} onChange={(v) => setF({ ...f, cpf: v })} />
            <FilterSelect
              label="Status"
              value={f.status}
              onChange={(v) => setF({ ...f, status: v })}
              options={statusOptions}
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
        title={record ? "Editar cliente" : "Novo cliente"}
        fields={fields}
        record={record}
        saving={save.isPending}
        onSave={(values) =>
          save.mutate(
            { values, original: record },
            { onSuccess: () => setOpen(false) },
          )
        }
      />
    </>
  );
}
