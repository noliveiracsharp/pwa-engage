import { useEffect, useRef, useState } from "react";
import { Check, ChevronUp, Eye, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchSelect, type SearchOption } from "@/components/data-table/SearchSelect";
import { rowId } from "@/lib/crud";
import { QuickItemDialog } from "./QuickItemDialog";
import { calcLinha, formatBRL, formatPct, num, type Linha } from "@/lib/orcamentos";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";

const NONE = "__none__";

/** Colunas da tabela compacta (desktop). */
const GRID = "sm:grid sm:grid-cols-[1.75rem_minmax(0,1fr)_4.5rem_7rem_8rem_5.5rem] sm:gap-3";

const formatQtd = (v: string) => num(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

type Props = {
  linhas: Linha[];
  itemOptions: SearchOption[];
  unidadeOptions: Array<{ value: string; label: string }>;
  itens: Row[];
  marcas: Row[];
  readOnly?: boolean | undefined;
  onChange: (key: string, patch: Partial<Linha>) => void;
  onSelectItem: (key: string, itemId: string) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
};

/** Editor das linhas do orçamento: tabela compacta com edição por linha. */
export function OrcamentoLinhas({
  linhas,
  itemOptions,
  unidadeOptions,
  itens,
  marcas,
  readOnly,
  onChange,
  onSelectItem,
  onAdd,
  onRemove,
}: Props) {
  const [quickFor, setQuickFor] = useState<string | null>(null);
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set());

  // Estado da linha no momento em que a edição abriu, usado pelo "Cancelar".
  const linhasRef = useRef(linhas);
  linhasRef.current = linhas;
  const snapshots = useRef(new Map<string, Linha>());
  const novas = useRef(new Set<string>());

  const setAberta = (key: string, abrir: boolean) =>
    setAbertas((prev) => {
      const next = new Set(prev);
      if (abrir) next.add(key);
      else next.delete(key);
      return next;
    });

  /** Abre a linha guardando o estado atual; recolher confirma a edição. */
  const toggleAberta = (key: string) => {
    const abrir = !abertas.has(key);
    if (abrir) {
      const atual = linhasRef.current.find((l) => l.key === key);
      if (atual) snapshots.current.set(key, { ...atual });
    } else {
      snapshots.current.delete(key);
      novas.current.delete(key);
    }
    setAberta(key, abrir);
  };

  /** Descarta a edição: apaga a linha recém-criada ou restaura os valores anteriores. */
  const cancelar = (key: string) => {
    if (novas.current.has(key)) {
      onRemove(key);
    } else {
      const snapshot = snapshots.current.get(key);
      if (snapshot) onChange(key, snapshot);
    }
    snapshots.current.delete(key);
    novas.current.delete(key);
    setAberta(key, false);
  };

  // Linhas recém-adicionadas abrem automaticamente em modo de edição.
  const keysRef = useRef<Set<string>>(new Set(linhas.map((l) => l.key)));
  useEffect(() => {
    const novos = linhas.filter((l) => !keysRef.current.has(l.key));
    keysRef.current = new Set(linhas.map((l) => l.key));
    if (novos.length > 0) {
      for (const l of novos) {
        snapshots.current.set(l.key, { ...l });
        if (!l.id) novas.current.add(l.key);
      }
      setAbertas((prev) => {
        const next = new Set(prev);
        for (const l of novos) next.add(l.key);
        return next;
      });
    }
  }, [linhas]);

  const itemById = new Map(itens.map((item) => [String(rowId(item) ?? ""), item]));
  const marcaById = new Map(marcas.map((marca) => [String(rowId(marca) ?? ""), marca]));
  const unidadeById = new Map(unidadeOptions.map((o) => [o.value, o.label]));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">
          Itens do orçamento{" "}
          {linhas.length > 0 && (
            <span className="text-muted-foreground font-normal">({linhas.length})</span>
          )}
        </h3>
      </div>

      {linhas.length === 0 && (
        <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          Nenhum item adicionado. {readOnly ? "" : "Use o botão abaixo para começar."}
        </div>
      )}

      {linhas.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          {/* Cabeçalho da tabela (somente desktop) */}
          <div
            className={cn(
              "text-muted-foreground bg-muted/40 hidden border-b px-3 py-2 text-xs font-medium",
              GRID,
            )}
          >
            <span>#</span>
            <span>Item</span>
            <span className="text-right">Qtd</span>
            <span className="text-right">Unitário</span>
            <span className="text-right">Total</span>
            <span className="text-right">Ações</span>
          </div>

          {linhas.map((l, index) => {
            const c = calcLinha(l);
            const semCusto = l.item_id !== "" && l.preco_custo <= 0;
            const item = itemById.get(l.item_id);
            const marca = marcaById.get(String(pick(item ?? {}, ["itens_marcas_id"]) ?? ""));
            const nomeMarca = String(pick(marca ?? {}, ["descricao"]) ?? "").trim();
            const codigo = item ? String(item["codigo"] ?? "") : "";
            const descricao = item ? String(item["descricao"] ?? "") : "";
            const nomeItem = codigo ? `${codigo} — ${descricao}` : descricao;
            const unidadeLabel =
              (l.unidade_medida_id && unidadeById.get(l.unidade_medida_id)) || "";
            // Em leitura todas aparecem abertas com os dados desabilitados.
            const aberta = Boolean(readOnly) || abertas.has(l.key);

            const acoes = (
              <div className="flex items-center justify-end gap-0.5">
                {!readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={aberta ? "Recolher item" : "Editar item"}
                    title={aberta ? "Recolher" : "Editar"}
                    onClick={() => toggleAberta(l.key)}
                  >
                    {aberta ? <ChevronUp className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                  </Button>
                )}
                {!readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="Remover item"
                    title="Remover item"
                    onClick={() => onRemove(l.key)}
                  >
                    <Trash2 className="text-destructive h-4 w-4" />
                  </Button>
                )}
                {readOnly && <Eye className="text-muted-foreground h-4 w-4" />}
              </div>
            );

            if (aberta) {
              return (
                <div key={l.key} className="bg-card space-y-3 border-b p-3 last:border-b-0">
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground mt-2.5 w-5 shrink-0 text-right text-xs tabular-nums">
                      {index + 1}.
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Label htmlFor={`item-${l.key}`} className="block text-xs font-medium">
                        Item (produto ou serviço)
                      </Label>
                      <div className="flex gap-1.5">
                      <SearchSelect
                        className="min-w-0 flex-1"
                        id={`item-${l.key}`}
                        value={l.item_id}
                        onChange={(id) => onSelectItem(l.key, id)}
                        options={itemOptions}
                        placeholder="Selecione o item"
                        searchPlaceholder="Código ou descrição…"
                        emptyText="Nenhum item ativo encontrado."
                        disabled={Boolean(readOnly)}
                      />
                      {!readOnly && (
                        <Button type="button" variant="outline" size="icon" className="shrink-0" aria-label="Cadastrar novo item" title="Cadastrar novo item" onClick={() => setQuickFor(l.key)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      )}
                      </div>
                      {nomeMarca && (
                        <p className="text-muted-foreground text-xs">Marca: {nomeMarca}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      {!readOnly && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="mt-6 h-8 w-8"
                          aria-label="Recolher item"
                          title="Recolher"
                          onClick={() => toggleAberta(l.key)}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                      )}
                      {!readOnly && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="mt-6 h-8 w-8"
                          aria-label="Remover item"
                          title="Remover item"
                          onClick={() => onRemove(l.key)}
                        >
                          <Trash2 className="text-destructive h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pl-7 sm:grid-cols-12">
                    <div className="col-span-2 space-y-1.5 sm:col-span-4">
                      <Label htmlFor={`detalhe-${l.key}`} className="block text-xs font-medium">
                        Detalhe
                      </Label>
                      <Input
                        id={`detalhe-${l.key}`}
                        value={l.detalhe}
                        placeholder="Observação da linha"
                        onChange={(e) => onChange(l.key, { detalhe: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor={`qtd-${l.key}`} className="block text-xs font-medium">
                        Quantidade
                      </Label>
                      <Input
                        id={`qtd-${l.key}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.001"
                        value={l.quantidade}
                        onChange={(e) => onChange(l.key, { quantidade: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor={`unid-${l.key}`} className="block text-xs font-medium">
                        Unidade
                      </Label>
                      <Select
                        value={l.unidade_medida_id || NONE}
                        onValueChange={(v) =>
                          onChange(l.key, { unidade_medida_id: v === NONE ? "" : v })
                        }
                        disabled={Boolean(readOnly)}
                      >
                        <SelectTrigger id={`unid-${l.key}`}>
                          <SelectValue placeholder="Unid." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>—</SelectItem>
                          {unidadeOptions.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor={`vu-${l.key}`} className="block text-xs font-medium">
                        Unitário (R$)
                      </Label>
                      <Input
                        id={`vu-${l.key}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={l.valor_unitario}
                        onChange={(e) => onChange(l.key, { valor_unitario: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="block text-xs font-medium">Total da linha</Label>
                      <div className="bg-muted/50 flex h-10 items-center justify-end rounded-md border px-3 text-sm font-semibold tabular-nums">
                        {formatBRL(c.total_linha)}
                      </div>
                    </div>
                  </div>

                  <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 pl-7 text-xs">
                    <span>
                      Custo:{" "}
                      <strong className="text-foreground font-medium">
                        {formatBRL(c.custo_total)}
                      </strong>
                      {l.preco_custo > 0 && (
                        <span className="ml-1">({formatBRL(l.preco_custo)}/un)</span>
                      )}
                    </span>
                    <span>
                      Imposto ({formatPct(l.imposto_pct)}):{" "}
                      <strong className="text-foreground font-medium">
                        {formatBRL(c.imposto_valor)}
                      </strong>
                    </span>
                    <span>
                      Lucro:{" "}
                      <strong
                        className={cn(
                          "font-medium",
                          c.lucro < 0 ? "text-destructive" : "text-success",
                        )}
                      >
                        {formatBRL(c.lucro)}
                      </strong>{" "}
                      <span className={cn(c.lucro < 0 ? "text-destructive" : "")}>
                        ({formatPct(c.margem_pct)})
                      </span>
                    </span>
                    {semCusto && (
                      <span className="text-warning-foreground bg-warning/40 rounded px-1.5">
                        Item sem custo cadastrado
                      </span>
                    )}
                  </div>

                  {!readOnly && (
                    <div className="flex flex-wrap items-center justify-end gap-2 pl-7">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => cancelar(l.key)}
                      >
                        <X className="mr-1 h-4 w-4" /> Cancelar edição
                      </Button>
                      <Button type="button" size="sm" onClick={() => toggleAberta(l.key)}>
                        <Check className="mr-1 h-4 w-4" /> Salvar item
                      </Button>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div key={l.key} className="border-b last:border-b-0">
                {/* Linha compacta — mobile */}
                <div className="flex items-start gap-2 p-3 sm:hidden">
                  <span className="text-muted-foreground mt-0.5 w-5 shrink-0 text-right text-xs tabular-nums">
                    {index + 1}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{nomeItem || "—"}</p>
                    {nomeMarca && (
                      <p className="text-muted-foreground truncate text-xs">Marca: {nomeMarca}</p>
                    )}
                    {l.detalhe && (
                      <p className="text-muted-foreground truncate text-xs">{l.detalhe}</p>
                    )}
                    <p className="text-muted-foreground text-xs">
                      {formatQtd(l.quantidade)} {unidadeLabel} × {formatBRL(num(l.valor_unitario))}
                    </p>
                    {semCusto && (
                      <span className="text-warning-foreground bg-warning/40 mt-1 inline-block rounded px-1 text-[10px]">
                        Item sem custo cadastrado
                      </span>
                    )}
                  </div>
                  <div className="shrink-0 space-y-1 text-right">
                    <p className="text-sm font-semibold tabular-nums">{formatBRL(c.total_linha)}</p>
                    {acoes}
                  </div>
                </div>

                {/* Linha compacta — desktop */}
                <div className={cn("hidden items-center px-3 py-2 sm:grid", GRID)}>
                  <span className="text-muted-foreground text-xs tabular-nums">{index + 1}.</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{nomeItem || "—"}</p>
                    {nomeMarca && (
                      <p className="text-muted-foreground truncate text-xs">Marca: {nomeMarca}</p>
                    )}
                    {l.detalhe && (
                      <p className="text-muted-foreground truncate text-xs">{l.detalhe}</p>
                    )}
                  </div>
                  <span className="text-right text-sm tabular-nums">
                    {formatQtd(l.quantidade)}
                    {unidadeLabel && (
                      <span className="text-muted-foreground text-xs"> {unidadeLabel}</span>
                    )}
                  </span>
                  <span className="text-right text-sm tabular-nums">
                    {formatBRL(num(l.valor_unitario))}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatBRL(c.total_linha)}
                  </span>
                  {acoes}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!readOnly && (
        <Button type="button" variant="outline" className="w-full" onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" /> Adicionar item
        </Button>
      )}
      <QuickItemDialog
        open={quickFor !== null}
        onOpenChange={(o) => !o && setQuickFor(null)}
        itens={itens}
        unidadeOptions={unidadeOptions}
        onCreated={(item) => quickFor && onSelectItem(quickFor, String(rowId(item)))}
      />
    </div>
  );
}
