import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect, type SearchOption } from "@/components/data-table/SearchSelect";
import { OrcamentoLinhas } from "@/components/orcamentos/OrcamentoLinhas";
import { OrcamentoTotais } from "@/components/orcamentos/OrcamentoTotais";
import { SituacaoBadge } from "@/components/orcamentos/SituacaoBadge";
import { dateOrNull, type LinhaPayload } from "@/hooks/useSaveOrcamento";
import { rowId } from "@/lib/crud";
import { formatCpfCnpj } from "@/lib/input-masks";
import {
  addDaysISO,
  aplicarItem,
  calcLinha,
  calcTotais,
  formatBRL,
  linhaFromRow,
  novaLinha,
  num,
  situacaoOf,
  SITUACOES,
  toISODate,
  todayISO,
  type DescontoTipo,
  type Linha,
  type Situacao,
} from "@/lib/orcamentos";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";

const NONE = "__none__";
/** Validade padrão de um novo orçamento (dias após a data). */
const VALIDADE_PADRAO_DIAS = 15;

type Header = {
  situacao: Situacao;
  dt_orcamento: string;
  validade_orcamento: string;
  parceiro_id: string;
  usuario_id: string;
  descricao: string;
  desconto_tipo: DescontoTipo;
  desconto: string;
  frete: string;
  valores_adicionais: string;
};

const emptyHeader = (vendedorId: string): Header => {
  const hoje = todayISO();
  return {
    situacao: "Em andamento",
    dt_orcamento: hoje,
    validade_orcamento: addDaysISO(hoje, VALIDADE_PADRAO_DIAS),
    parceiro_id: "",
    usuario_id: vendedorId,
    descricao: "",
    desconto_tipo: "valor",
    desconto: "",
    frete: "",
    valores_adicionais: "",
  };
};

const headerFromRecord = (r: Row): Header => ({
  situacao: situacaoOf(r["situacao"]),
  dt_orcamento: toISODate(r["dt_orcamento"]) || todayISO(),
  validade_orcamento: toISODate(r["validade_orcamento"]),
  parceiro_id: String(pick(r, ["parceiro_id", "parceiros_id"]) ?? ""),
  usuario_id: String(pick(r, ["usuario_id", "vendedor_id"]) ?? ""),
  descricao: String(pick(r, ["descricao"]) ?? ""),
  desconto_tipo: String(r["desconto_tipo"] ?? "") === "percentual" ? "percentual" : "valor",
  desconto: num(r["desconto"]) ? String(num(r["desconto"])) : "",
  frete: num(r["frete"]) ? String(num(r["frete"])) : "",
  valores_adicionais: num(r["valores_adicionais"]) ? String(num(r["valores_adicionais"])) : "",
});

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: Row | null;
  /** Linhas já gravadas em orcamento_itens para o registro em edição. */
  linhasRecord: Row[];
  saving?: boolean;
  readOnly?: boolean;
  clientes: Row[];
  vendedores: Row[];
  itens: Row[];
  unidades: Row[];
  vendedorPadraoId?: string | undefined;
  onSave: (input: { header: Row; linhas: LinhaPayload[] }) => void;
};

export function OrcamentoSheet({
  open,
  onOpenChange,
  record,
  linhasRecord,
  saving,
  readOnly,
  clientes,
  vendedores,
  itens,
  unidades,
  vendedorPadraoId,
  onSave,
}: Props) {
  const [h, setH] = useState<Header>(() => emptyHeader(vendedorPadraoId ?? ""));
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const dirty = useRef(false);
  const initKey = useRef("");

  const recordId = record ? String(rowId(record) ?? "") : "";

  // Inicializa ao abrir / trocar de registro; recarrega as linhas se elas
  // chegarem do banco depois da abertura e o usuário ainda não alterou nada.
  useEffect(() => {
    if (!open) {
      initKey.current = "";
      return;
    }
    const key = `${recordId}`;
    const linhasDb = linhasRecord
      .slice()
      .sort((a, b) => Number(a["ordem"] ?? 0) - Number(b["ordem"] ?? 0))
      .map(linhaFromRow);
    if (initKey.current !== key) {
      initKey.current = key;
      dirty.current = false;
      setH(record ? headerFromRecord(record) : emptyHeader(vendedorPadraoId ?? ""));
      setLinhas(record ? linhasDb : [novaLinha()]);
      return;
    }
    if (record && !dirty.current) {
      setLinhas((atual) => (atual.length !== linhasDb.length ? linhasDb : atual));
    }
  }, [open, record, recordId, linhasRecord, vendedorPadraoId]);

  const patchHeader = (patch: Partial<Header>) => {
    dirty.current = true;
    setH((s) => ({ ...s, ...patch }));
  };

  /* ------------------------- opções dos selects ------------------------- */

  const itemById = useMemo(() => new Map(itens.map((i) => [String(rowId(i) ?? ""), i])), [itens]);

  const clienteOptions = useMemo<SearchOption[]>(
    () =>
      clientes
        .filter((c) => c["status"] !== false || String(rowId(c)) === h.parceiro_id)
        .map((c) => {
          const doc = formatCpfCnpj(String(c["documento"] ?? ""));
          const fantasia = String(c["nome_fantasia"] ?? "");
          return {
            value: String(rowId(c) ?? ""),
            label: String(c["razao_social"] ?? fantasia ?? "—"),
            hint: doc || undefined,
            keywords: [doc, String(c["documento"] ?? ""), fantasia, String(c["email"] ?? "")].filter(Boolean),
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    [clientes, h.parceiro_id],
  );

  const vendedorOptions = useMemo(
    () =>
      vendedores
        .filter((u) => u["status"] !== false || String(rowId(u)) === h.usuario_id)
        .map((u) => ({ value: String(rowId(u) ?? ""), label: String(pick(u, ["nome", "email"]) ?? "—") }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    [vendedores, h.usuario_id],
  );

  const selecionados = useMemo(() => new Set(linhas.map((l) => l.item_id)), [linhas]);
  const itemOptions = useMemo<SearchOption[]>(
    () =>
      itens
        .filter((i) => i["status"] !== false || selecionados.has(String(rowId(i))))
        .map((i) => {
          const codigo = String(i["codigo"] ?? "");
          const descricao = String(i["descricao"] ?? "—");
          return {
            value: String(rowId(i) ?? ""),
            label: codigo ? `${codigo} — ${descricao}` : descricao,
            hint: formatBRL(num(i["preco_venda"])),
            keywords: [codigo, String(i["tipo"] ?? "")].filter(Boolean),
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true })),
    [itens, selecionados],
  );

  const unidadeOptions = useMemo(
    () =>
      unidades
        .filter((u) => u["status"] !== false)
        .map((u) => ({ value: String(rowId(u) ?? ""), label: String(u["descricao"] ?? "—") }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    [unidades],
  );

  /* ------------------------------ linhas ------------------------------ */

  const updateLinha = (key: string, patch: Partial<Linha>) => {
    dirty.current = true;
    setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };
  const selectItem = (key: string, itemId: string) => {
    dirty.current = true;
    setLinhas((ls) => ls.map((l) => (l.key === key ? aplicarItem(l, itemById.get(itemId)) : l)));
  };
  const addLinha = () => {
    dirty.current = true;
    setLinhas((ls) => [...ls, novaLinha()]);
  };
  const removeLinha = (key: string) => {
    dirty.current = true;
    setLinhas((ls) => ls.filter((l) => l.key !== key));
  };

  /* ------------------------------ totais ------------------------------ */

  const linhasValidas = useMemo(() => linhas.filter((l) => l.item_id !== "" || l.detalhe.trim() !== ""), [linhas]);
  const calcs = useMemo(() => linhasValidas.map(calcLinha), [linhasValidas]);
  const totais = useMemo(
    () =>
      calcTotais(calcs, {
        desconto_tipo: h.desconto_tipo,
        desconto: h.desconto,
        frete: h.frete,
        valores_adicionais: h.valores_adicionais,
      }),
    [calcs, h.desconto_tipo, h.desconto, h.frete, h.valores_adicionais],
  );
  const itensSemCusto = linhasValidas.filter((l) => l.item_id !== "" && l.preco_custo <= 0).length;

  /* ------------------------------ salvar ------------------------------ */

  const submit = () => {
    if (!h.parceiro_id) {
      toast.error("Selecione o cliente do orçamento.");
      return;
    }
    if (!h.dt_orcamento) {
      toast.error("Informe a data do orçamento.");
      return;
    }
    if (h.validade_orcamento && h.validade_orcamento < h.dt_orcamento) {
      toast.error("A validade não pode ser anterior à data do orçamento.");
      return;
    }
    if (linhasValidas.length === 0) {
      toast.error("Adicione pelo menos um item ao orçamento.");
      return;
    }
    const semQuantidade = linhasValidas.find((l) => num(l.quantidade) <= 0);
    if (semQuantidade) {
      toast.error("Todas as linhas precisam de quantidade maior que zero.");
      return;
    }

    const header: Row = {
      situacao: h.situacao,
      dt_orcamento: h.dt_orcamento,
      validade_orcamento: dateOrNull(h.validade_orcamento),
      parceiro_id: h.parceiro_id || null,
      usuario_id: h.usuario_id || null,
      descricao: h.descricao.trim() || null,
      total_itens: totais.total_itens,
      desconto_tipo: h.desconto_tipo,
      desconto: num(h.desconto),
      desconto_valor: totais.desconto_valor,
      frete: totais.frete,
      valores_adicionais: totais.valores_adicionais,
      total_liquido: totais.total_liquido,
      total_custo: totais.total_custo,
      total_imposto: totais.total_imposto,
      total_lucro: totais.total_lucro,
      margem_pct: totais.margem_pct,
    };

    const payloadLinhas: LinhaPayload[] = linhasValidas.map((l, index) => {
      const c = calcs[index]!;
      return {
        id: l.id,
        ordem: index + 1,
        item_id: l.item_id || null,
        detalhe: l.detalhe.trim() || null,
        quantidade: c.quantidade,
        unidade_medida_id: l.unidade_medida_id || null,
        valor_unitario: c.valor_unitario,
        total_linha: c.total_linha,
        preco_custo: l.preco_custo,
        imposto_pct: l.imposto_pct,
        imposto_valor: c.imposto_valor,
        custo_total: c.custo_total,
        lucro: c.lucro,
        margem_pct: c.margem_pct,
      };
    });

    onSave({ header, linhas: payloadLinhas });
  };

  const numero = record ? String(record["numero"] ?? "") : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader className="px-6 pb-4">
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {record ? `Orçamento ${numero || ""}`.trim() : "Novo orçamento"}
            {record && <SituacaoBadge value={h.situacao} />}
          </SheetTitle>
          <SheetDescription>
            {record
              ? "Altere os dados, itens e condições comerciais do orçamento."
              : "O número é gerado automaticamente no formato #ano-sequência ao salvar."}
          </SheetDescription>
        </SheetHeader>

        <fieldset disabled={readOnly} className="min-w-0 space-y-6 px-6 disabled:opacity-70">
          {/* ------------------------ cabeçalho ------------------------ */}
          <div className="grid gap-x-4 gap-y-5 pt-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0 space-y-1.5">
              <Label className="block text-sm font-medium">Número</Label>
              <div className="bg-muted/50 text-muted-foreground flex h-10 items-center rounded-md border px-3 text-sm font-medium tabular-nums">
                {numero || "Automático ao salvar"}
              </div>
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="situacao" className="block text-sm font-medium">
                Situação
              </Label>
              <Select value={h.situacao} onValueChange={(v) => patchHeader({ situacao: v as Situacao })} disabled={readOnly}>
                <SelectTrigger id="situacao">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SITUACOES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      <span className="flex items-center gap-2">
                        <span className={cn("h-2.5 w-2.5 rounded-full", s.dot)} />
                        {s.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="dt_orcamento" className="block text-sm font-medium">
                Data do orçamento
              </Label>
              <Input
                id="dt_orcamento"
                type="date"
                value={h.dt_orcamento}
                onChange={(e) => patchHeader({ dt_orcamento: e.target.value })}
              />
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="validade_orcamento" className="block text-sm font-medium">
                Validade
              </Label>
              <Input
                id="validade_orcamento"
                type="date"
                min={h.dt_orcamento || undefined}
                value={h.validade_orcamento}
                onChange={(e) => patchHeader({ validade_orcamento: e.target.value })}
              />
            </div>

            <div className="min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="parceiro_id" className="block text-sm font-medium">
                Cliente
              </Label>
              <SearchSelect
                id="parceiro_id"
                value={h.parceiro_id}
                onChange={(v) => patchHeader({ parceiro_id: v })}
                options={clienteOptions}
                placeholder="Selecione o cliente"
                searchPlaceholder="Nome, documento ou e-mail…"
                emptyText="Nenhum cliente encontrado. Cadastre em Parceiros marcando “É Cliente?”."
                disabled={readOnly}
              />
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="usuario_id" className="block text-sm font-medium">
                Vendedor
              </Label>
              <Select
                value={h.usuario_id || NONE}
                onValueChange={(v) => patchHeader({ usuario_id: v === NONE ? "" : v })}
                disabled={readOnly}
              >
                <SelectTrigger id="usuario_id">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informado</SelectItem>
                  {vendedorOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-4">
              <Label htmlFor="descricao" className="block text-sm font-medium">
                Descrição
              </Label>
              <Textarea
                id="descricao"
                rows={2}
                value={h.descricao}
                placeholder="Objeto do orçamento, condições de pagamento, prazo de entrega…"
                onChange={(e) => patchHeader({ descricao: e.target.value })}
              />
            </div>
          </div>

          {/* -------------------------- itens -------------------------- */}
          <OrcamentoLinhas
            linhas={linhas}
            itemOptions={itemOptions}
            unidadeOptions={unidadeOptions}
            readOnly={readOnly}
            onChange={updateLinha}
            onSelectItem={selectItem}
            onAdd={addLinha}
            onRemove={removeLinha}
          />

          {/* -------------------------- totais ------------------------- */}
          <OrcamentoTotais
            totais={totais}
            descontoTipo={h.desconto_tipo}
            desconto={h.desconto}
            frete={h.frete}
            valoresAdicionais={h.valores_adicionais}
            readOnly={readOnly}
            itensSemCusto={itensSemCusto}
            onChange={(patch) => patchHeader(patch)}
          />
        </fieldset>

        <div className="bg-background sticky bottom-0 mt-4 flex justify-end gap-2 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || readOnly}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
