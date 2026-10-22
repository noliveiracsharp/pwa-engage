import { Package } from "lucide-react";
import type { Column } from "@/components/data-table/DataTable";
import type { Field } from "@/components/data-table/RecordSheet";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { pick } from "@/lib/row";

const statusColumn: Column = {
  key: "status",
  header: "Status",
  fields: ["status"],
  render: (row) => <StatusBadge value={row["status"]} />,
};

export const unidadeConfig = {
  table: "unidade_medida",
  title: "Unidades de Medida",
  path: "/unid_medida",
  singular: "unidade de medida",
  searchFields: ["descricao"],
  searchPlaceholder: "Descrição",
  columns: [{ key: "descricao", header: "Descrição", fields: ["descricao"] }, statusColumn] as Column[],
  fields: [
    { fields: ["descricao"], label: "Descrição", full: true },
    { fields: ["status"], label: "Status", type: "boolean" },
  ] as Field[],
};

export const centroCustoConfig = {
  table: "centro_custo",
  title: "Centros de Custo",
  path: "/centro_custos",
  singular: "centro de custo",
  searchFields: ["codigo", "descricao"],
  searchPlaceholder: "Código ou descrição",
  hierarchy: { parentKey: "centro_custo_pai_id", label: "Centro de Custo Pai" },
  columns: [
    { key: "codigo", header: "Código", fields: ["codigo"] },
    { key: "descricao", header: "Descrição", fields: ["descricao"] },
    statusColumn,
  ] as Column[],
  fields: [
    { fields: ["codigo"], label: "Código" },
    { fields: ["descricao"], label: "Descrição" },
    { fields: ["status"], label: "Status", type: "boolean" },
  ] as Field[],
};

export const marcaConfig = {
  table: "itens_marcas",
  title: "Marcas",
  path: "/marcas",
  singular: "marca",
  searchFields: ["descricao"],
  searchPlaceholder: "Descrição",
  columns: [
    {
      key: "descricao",
      header: "Descrição",
      fields: ["descricao"],
      render: (row) => {
        const foto = pick(row, ["foto"]);
        const nome = pick(row, ["descricao"], "—");
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
                <Package className="h-4 w-4" />
              </span>
            )}
            <span>{nome}</span>
          </div>
        );
      },
    },
    statusColumn,
  ] as Column[],
  fields: [
    { fields: ["foto"], label: "Foto", type: "photo", full: true },
    { fields: ["descricao"], label: "Descrição", full: true },
    { fields: ["status"], label: "Status", type: "boolean" },
  ] as Field[],
};

const NATUREZAS_PLANO = [
  { value: "custo", label: "Custo direto" },
  { value: "deducao", label: "Dedução da receita" },
  { value: "despesa", label: "Despesa operacional" },
  { value: "receita", label: "Receita" },
  { value: "financeiro", label: "Resultado financeiro" },
];

export const planoContasConfig = {
  table: "plano_contas",
  title: "Plano de Contas",
  path: "/plano_contas",
  singular: "conta gerencial",
  searchFields: ["codigo", "descricao"],
  searchPlaceholder: "Código ou descrição",
  hierarchy: { parentKey: "plano_contas_pai_id", label: "Conta Pai" },
  columns: [
    { key: "codigo", header: "Código", fields: ["codigo"] },
    { key: "descricao", header: "Descrição", fields: ["descricao"] },
    { key: "natureza", header: "Natureza", fields: ["natureza"],
      render: (row) => NATUREZAS_PLANO.find((n) => n.value === row["natureza"])?.label ?? "—" },
    statusColumn,
  ] as Column[],
  fields: [
    { fields: ["codigo"], label: "Código" },
    { fields: ["descricao"], label: "Descrição" },
    { fields: ["natureza"], label: "Natureza", type: "select", options: NATUREZAS_PLANO },
    { fields: ["status"], label: "Status", type: "boolean" },
  ] as Field[],
};
