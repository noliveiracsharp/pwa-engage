import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ApoioCrud } from "@/components/itens/ApoioCrud";
import type { Field } from "@/components/data-table/RecordSheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { rowId, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { usePagePermissions } from "@/hooks/usePagePermissions";

export const Route = createFileRoute("/_authenticated/condominios")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Condomínios — Atende.ai" },
      { name: "description", content: "Blocos, unidades, moradores e veículos dos condomínios administrados." },
      { property: "og:title", content: "Condomínios — Atende.ai" },
      { property: "og:description", content: "Blocos, unidades, moradores e veículos dos condomínios administrados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CondominiosPagina,
});

const ord = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, "pt-BR");
const opts = (rows: Row[], label: (r: Row) => string) =>
  rows.map((r) => ({ value: String(rowId(r)), label: label(r) })).sort(ord);
const lista = (pares: Array<[string, string]>) => pares.map(([value, label]) => ({ value, label })).sort(ord);
const nomeDe = (map: Map<string, string>, k: string) => (row: Row) => map.get(String(pick(row, [k]) ?? "")) ?? "—";

function CondominiosPagina() {
  const perms = usePagePermissions("/condominios");
  const p = { canRead: perms.canRead, canCreate: perms.canCreate, canUpdate: perms.canUpdate, canDelete: perms.canDelete };
  const { data: parceiros = [] } = useTableRows("parceiros");
  const { data: blocos = [] } = useTableRows("cond_blocos");
  const { data: unidades = [] } = useTableRows("cond_unidades");
  const { data: pessoas = [] } = useTableRows("pessoas");
  const [aba, setAba] = useState("blocos");

  const condos = useMemo(() => parceiros.filter((r) => r["is_condominio"] === true), [parceiros]);
  const nomeParc = (r: Row) => String(pick(r, ["nome_fantasia", "fantasia", "razao_social", "nome"]) ?? "—");
  const mCondo = useMemo(() => new Map(condos.map((r) => [String(rowId(r)), nomeParc(r)])), [condos]);
  const mBloco = useMemo(() => new Map(blocos.map((r) => [String(rowId(r)), String(r["nome"] ?? "—")])), [blocos]);
  const mUnid = useMemo(() => new Map(unidades.map((r) => [String(rowId(r)), `${mBloco.get(String(r["cond_bloco_id"])) ?? ""} · ${String(r["identificacao"] ?? "")}`])), [unidades, mBloco]);
  const mPessoa = useMemo(() => new Map(pessoas.map((r) => [String(rowId(r)), String(pick(r, ["nome"]) ?? "—")])), [pessoas]);

  const oCondo = opts(condos, nomeParc);
  const oBloco = opts(blocos, (r) => `${mCondo.get(String(r["parceiro_id"])) ?? ""} · ${String(r["nome"] ?? "")}`);
  const oUnid = [...mUnid].map(([value, label]) => ({ value, label })).sort(ord);
  const oPessoa = [...mPessoa].map(([value, label]) => ({ value, label })).sort(ord);

  const blocoFields: Field[] = [
    { fields: ["parceiro_id"], label: "Condomínio", type: "select", options: oCondo, full: true },
    { fields: ["nome"], label: "Nome do bloco / torre" },
    { fields: ["ordem"], label: "Ordem", type: "number" },
    { fields: ["andares"], label: "Andares", type: "number" },
    { fields: ["unidades_por_andar"], label: "Unidades por andar", type: "number" },
  ];
  const unidFields: Field[] = [
    { fields: ["cond_bloco_id"], label: "Bloco", type: "select", options: oBloco, full: true },
    { fields: ["identificacao"], label: "Identificação (ex.: 101)" },
    { fields: ["tipo"], label: "Tipo", type: "select", options: lista([["apartamento", "Apartamento"], ["casa", "Casa"], ["sala", "Sala"], ["loja", "Loja"], ["garagem", "Garagem"], ["deposito", "Depósito"]]) },
    { fields: ["situacao"], label: "Situação", type: "select", options: lista([["ocupada", "Ocupada"], ["vazia", "Vazia"], ["obra", "Em obra"]]) },
    { fields: ["area_privativa"], label: "Área privativa (m²)", type: "number" },
    { fields: ["fracao_ideal"], label: "Fração ideal", type: "number" },
  ];
  const vincFields: Field[] = [
    { fields: ["cond_unidade_id"], label: "Unidade", type: "select", options: oUnid, full: true },
    { fields: ["pessoa_id"], label: "Pessoa", type: "select", options: oPessoa, full: true, nullable: true },
    { fields: ["papel"], label: "Papel", type: "select", options: lista([["proprietario", "Proprietário"], ["coproprietario", "Coproprietário"], ["inquilino", "Inquilino"], ["dependente", "Dependente"], ["colaborador_unidade", "Colaborador da unidade"]]) },
    { fields: ["inicio"], label: "Início (AAAA-MM-DD)" },
    { fields: ["fim"], label: "Fim (AAAA-MM-DD)", nullable: true },
    { fields: ["responsavel_financeiro"], label: "Responsável financeiro", type: "boolean" },
    { fields: ["ativo"], label: "Ativo", type: "boolean" },
  ];
  const veicFields: Field[] = [
    { fields: ["cond_unidade_id"], label: "Unidade", type: "select", options: oUnid, full: true },
    { fields: ["pessoa_id"], label: "Pessoa", type: "select", options: oPessoa, full: true, nullable: true },
    { fields: ["tipo"], label: "Tipo", type: "select", options: lista([["carro", "Carro"], ["moto", "Moto"], ["bicicleta", "Bicicleta"], ["moto_eletrica", "Moto elétrica"], ["outro", "Outro"]]) },
    { fields: ["placa"], label: "Placa" },
    { fields: ["marca"], label: "Marca" },
    { fields: ["modelo"], label: "Modelo" },
    { fields: ["cor"], label: "Cor" },
    { fields: ["ativo"], label: "Ativo", type: "boolean" },
    { fields: ["observacoes"], label: "Observações", type: "textarea", full: true },
  ];

  const cfgBase = { path: "/condominios", permsOverride: p };
  return (
    <div className="space-y-4 p-4">
      {condos.length === 0 && (
        <p className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
          Nenhum condomínio ainda. Em Clientes e Fornecedores, ative "É condomínio" no cadastro do cliente para ele aparecer aqui.
        </p>
      )}
      <Tabs value={aba} onValueChange={setAba} className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList className="h-9 w-max">
            <TabsTrigger value="blocos">Blocos</TabsTrigger>
            <TabsTrigger value="unidades">Unidades</TabsTrigger>
            <TabsTrigger value="moradores">Moradores</TabsTrigger>
            <TabsTrigger value="veiculos">Veículos</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="blocos">
          <ApoioCrud {...cfgBase} table="cond_blocos" title="Blocos" singular="bloco" searchFields={["nome"]} searchPlaceholder="Nome do bloco"
            columns={[
              { key: "nome", header: "Bloco", fields: ["nome"] },
              { key: "parceiro_id", header: "Condomínio", fields: ["parceiro_id"], render: nomeDe(mCondo, "parceiro_id") },
              { key: "andares", header: "Andares", fields: ["andares"] },
              { key: "unidades_por_andar", header: "Unid./andar", fields: ["unidades_por_andar"] },
            ]}
            fields={blocoFields} />
        </TabsContent>
        <TabsContent value="unidades">
          <ApoioCrud {...cfgBase} table="cond_unidades" title="Unidades" singular="unidade" searchFields={["identificacao"]} searchPlaceholder="Identificação"
            columns={[
              { key: "identificacao", header: "Unidade", fields: ["identificacao"] },
              { key: "cond_bloco_id", header: "Bloco", fields: ["cond_bloco_id"], render: nomeDe(mBloco, "cond_bloco_id") },
              { key: "tipo", header: "Tipo", fields: ["tipo"] },
              { key: "situacao", header: "Situação", fields: ["situacao"] },
              { key: "fracao_ideal", header: "Fração ideal", fields: ["fracao_ideal"] },
            ]}
            fields={unidFields} />
        </TabsContent>
        <TabsContent value="moradores">
          <ApoioCrud {...cfgBase} table="cond_unidades_vinculos" title="Moradores" singular="vínculo" searchFields={["papel"]} searchPlaceholder="Papel"
            columns={[
              { key: "pessoa_id", header: "Pessoa", fields: ["pessoa_id"], render: nomeDe(mPessoa, "pessoa_id") },
              { key: "cond_unidade_id", header: "Unidade", fields: ["cond_unidade_id"], render: nomeDe(mUnid, "cond_unidade_id") },
              { key: "papel", header: "Papel", fields: ["papel"] },
              { key: "responsavel_financeiro", header: "Resp. financeiro", fields: ["responsavel_financeiro"], render: (r) => (r["responsavel_financeiro"] ? "Sim" : "Não") },
            ]}
            fields={vincFields} />
        </TabsContent>
        <TabsContent value="veiculos">
          <ApoioCrud {...cfgBase} table="cond_unidades_veiculos" title="Veículos" singular="veículo" searchFields={["placa", "modelo", "marca"]} searchPlaceholder="Placa, marca ou modelo"
            columns={[
              { key: "placa", header: "Placa", fields: ["placa"] },
              { key: "modelo", header: "Veículo", fields: ["modelo"], render: (r) => `${String(r["marca"] ?? "")} ${String(r["modelo"] ?? "")}`.trim() || "—" },
              { key: "cond_unidade_id", header: "Unidade", fields: ["cond_unidade_id"], render: nomeDe(mUnid, "cond_unidade_id") },
              { key: "tipo", header: "Tipo", fields: ["tipo"] },
            ]}
            fields={veicFields} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
