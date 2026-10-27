import { tx } from "@/lib/i18n-termos";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronUp, Eye, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
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
import { rowId, useTableRows } from "@/lib/crud";
import { Switch } from "@/components/ui/switch";
import { NovoItemCompleto } from "@/components/itens/NovoItemCompleto";
import { agruparPorBloco, calcLinha, formatBRL, formatPct, NATUREZAS, precoPorMarkup, num, type Linha, type Natureza } from "@/lib/orcamentos";

function NaturezaBadge({ n }: { n: Natureza }) {
  const meta = NATUREZAS.find((x) => x.value === n)!;
  return (
    <span
      className={cn(
        "mr-1.5 inline-block rounded px-1.5 py-0.5 align-middle text-[10px] font-medium",
        n === "recorrente" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
      )}
    >
      {meta.curto}
    </span>
  );
}
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { confirmar } from "@/components/layout/DialogoGlobal";

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
  onAdd: (bloco?: string) => void;
  onRemove: (key: string) => void;
  /** Chamado ao confirmar um item (grava a oferta e mantém aberta). */
  onItemSalvo?: () => void;
  /** Pagadores possíveis para cada item (faturamento misto). */
  pagadorOptions?: SearchOption[];
  /** Esconde custo e lucro (dados estratégicos). */
  ocultarCusto?: boolean;
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
  onItemSalvo,
  pagadorOptions = [],
  ocultarCusto = false,
}: Props) {
  const { data: parceirosTodos = [] } = useTableRows("parceiros");
  const fornecedorOptions: SearchOption[] = parceirosTodos
    .filter((p) => p["is_fornecedor"] === true && p["status"] !== false)
    .map((p) => ({ value: String(rowId(p) ?? ""), label: String(p["razao_social"] ?? p["nome_fantasia"] ?? "—") }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  const pagadorNome = new Map(pagadorOptions.map((o) => [o.value, o.label]));
  const [quickFor, setQuickFor] = useState<string | null>(null);
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set());
  // Ambientes criados que ainda não têm itens (só existem na tela até receber um item).
  const [blocosVazios, setBlocosVazios] = useState<string[]>([]);
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [renomeando, setRenomeando] = useState<{ bloco: string; valor: string } | null>(null);

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
  const grupos = agruparPorBloco(linhas, (l) => l.bloco.trim());
  const blocosUsados = grupos.map((g) => g.bloco).filter(Boolean);
  const ordenadas = grupos.flatMap((g) => g.rows);
  const numero = new Map(ordenadas.map((l, i) => [l.key, i]));
  const todosBlocos = [...blocosUsados, ...blocosVazios.filter((b) => !blocosUsados.includes(b))];

  const renderLinha = (l: Linha, index: number) => {
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
                    aria-label={tx("Remover item")}
                    title={tx("Remover item")}
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
                        {tx("Item (produto ou serviço)")}
                      </Label>
                      <div className="flex gap-1.5">
                      <SearchSelect
                        className="min-w-0 flex-1"
                        id={`item-${l.key}`}
                        value={l.item_id}
                        onChange={(id) => onSelectItem(l.key, id)}
                        options={itemOptions}
                        placeholder={tx("Selecione o item")}
                        searchPlaceholder="Código ou descrição…"
                        emptyText="Nenhum item ativo encontrado."
                        disabled={Boolean(readOnly)}
                      />
                      {!readOnly && (
                        <Button type="button" variant="outline" size="icon" className="shrink-0" aria-label={tx("Cadastrar novo item")} title={tx("Cadastrar novo item")} onClick={() => setQuickFor(l.key)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      )}
                      </div>
                      {nomeMarca && (
                        <p className="text-muted-foreground text-xs">Marca: {nomeMarca}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Label className="text-xs font-medium">Natureza</Label>
                        <Select
                          value={l.natureza}
                          onValueChange={(v) => onChange(l.key, { natureza: v as Natureza })}
                          disabled={Boolean(readOnly)}
                        >
                          <SelectTrigger className="h-8 w-56 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {NATUREZAS.map((n) => (
                              <SelectItem key={n.value} value={n.value}>
                                {n.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {todosBlocos.length > 0 && (
                          <>
                            <Label className="ml-2 text-xs font-medium">{tx("Ambiente")}</Label>
                            <Select
                              value={l.bloco.trim() || NONE}
                              onValueChange={(v) => onChange(l.key, { bloco: v === NONE ? "" : v })}
                              disabled={Boolean(readOnly)}
                            >
                              <SelectTrigger className="h-8 w-56 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>{tx("Itens gerais")}</SelectItem>
                                {todosBlocos.map((b) => (
                                  <SelectItem key={b} value={b}>{b}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </>
                        )}
                      </div>
                      {pagadorOptions.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Label className="text-xs font-medium">{tx("Faturar para")}</Label>
                          <SearchSelect
                            className="w-72 max-w-full"
                            value={l.faturar_para_id}
                            onChange={(v) => onChange(l.key, { faturar_para_id: v })}
                            options={pagadorOptions}
                            placeholder={tx("Próprio cliente da Oferta")}
                            searchPlaceholder="Nome ou CNPJ…"
                            emptyText="Nenhum parceiro encontrado."
                            disabled={Boolean(readOnly)}
                          />
                          {l.faturar_para_id && !readOnly && (
                            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange(l.key, { faturar_para_id: "" })}>
                              {tx("Usar o cliente")}
                            </Button>
                          )}
                        </div>
                      )}
                      {l.natureza !== "produto" && !ocultarCusto && (
                        <ServicoTerceiro linha={l} fornecedores={fornecedorOptions} readOnly={Boolean(readOnly)} onChange={(p) => onChange(l.key, p)} />
                      )}
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      {!readOnly && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="mt-6 h-8 w-8"
                          aria-label={tx("Recolher item")}
                          title={tx("Recolher")}
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
                          aria-label={tx("Remover item")}
                          title={tx("Remover item")}
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
                        {tx("Detalhe")}
                      </Label>
                      <Input
                        id={`detalhe-${l.key}`}
                        value={l.detalhe}
                        placeholder={tx("Observação da linha")}
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
                      <SearchSelect
                        id={`unid-${l.key}`}
                        value={l.unidade_medida_id}
                        onChange={(v) => onChange(l.key, { unidade_medida_id: v })}
                        options={unidadeOptions}
                        placeholder={tx("Unid.")}
                        searchPlaceholder="Pesquisar…"
                        disabled={Boolean(readOnly)}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor={`vu-${l.key}`} className="block text-xs font-medium">
                        {tx("Unitário (R$)")}
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
                      <Label className="block text-xs font-medium">{tx("Total da linha")}</Label>
                      <div className="bg-muted/50 flex h-10 items-center justify-end rounded-md border px-3 text-sm font-semibold tabular-nums">
                        {formatBRL(c.total_linha)}
                      </div>
                    </div>
                  </div>

                  <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 pl-7 text-xs">
                    {!ocultarCusto && <span>
                      Custo:{" "}
                      <strong className="text-foreground font-medium">
                        {formatBRL(c.custo_total)}
                      </strong>
                      {l.preco_custo > 0 && (
                        <span className="ml-1">({formatBRL(l.preco_custo)}/un)</span>
                      )}
                    </span>}
                    <span>
                      Imposto ({formatPct(l.imposto_pct)}):{" "}
                      <strong className="text-foreground font-medium">
                        {formatBRL(c.imposto_valor)}
                      </strong>
                    </span>
                    {!ocultarCusto && <span>
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
                    </span>}
                    {semCusto && !ocultarCusto && (
                      <span className="text-warning-foreground bg-warning/40 rounded px-1.5">
                        {tx("Item sem custo cadastrado")}
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
                        <X className="mr-1 h-4 w-4" /> {tx("Cancelar edição")}
                      </Button>
                      <Button type="button" size="sm" onClick={() => { toggleAberta(l.key); onItemSalvo?.(); }}>
                        <Check className="mr-1 h-4 w-4" /> {tx("Salvar item")}
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
                    <p className="text-sm font-medium break-words"><NaturezaBadge n={l.natureza} />{nomeItem || "—"}</p>
                    {l.faturar_para_id && pagadorNome.has(l.faturar_para_id) && pagadorOptions.find((o) => o.value === l.faturar_para_id)?.hint !== "Cliente da Oferta" && (
                      <p className="text-muted-foreground text-xs">Faturado para: {pagadorNome.get(l.faturar_para_id)}</p>
                    )}
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
                        {tx("Item sem custo cadastrado")}
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
                    <p className="text-sm font-medium break-words" title={nomeItem}><NaturezaBadge n={l.natureza} />{nomeItem || "—"}</p>
                    {l.faturar_para_id && pagadorNome.has(l.faturar_para_id) && pagadorOptions.find((o) => o.value === l.faturar_para_id)?.hint !== "Cliente da Oferta" && (
                      <p className="text-muted-foreground text-xs">Faturado para: {pagadorNome.get(l.faturar_para_id)}</p>
                    )}
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
  };

  // Ambientes exibidos: os usados nas linhas + os criados ainda vazios.
  const vaziosVisiveis = blocosVazios.filter((b) => !blocosUsados.includes(b));
  const secoes: Array<{ bloco: string; rows: Linha[] }> = [
    ...grupos.filter((g) => g.bloco !== ""),
    ...vaziosVisiveis.map((b) => ({ bloco: b, rows: [] as Linha[] })),
  ];
  const gerais = grupos.find((g) => g.bloco === "")?.rows ?? [];

  const criarAmbiente = () => {
    const nome = novoNome.trim();
    if (!nome) return;
    if (!todosBlocos.some((b) => b.toLowerCase() === nome.toLowerCase())) {
      setBlocosVazios((prev) => [...prev, nome]);
    }
    setNovoNome("");
    setCriando(false);
  };

  const renomear = (antigo: string) => {
    const nome = (renomeando?.valor ?? "").trim();
    setRenomeando(null);
    if (!nome || nome === antigo) return;
    for (const l of linhasRef.current) if (l.bloco.trim() === antigo) onChange(l.key, { bloco: nome });
    setBlocosVazios((prev) => prev.map((b) => (b === antigo ? nome : b)));
  };

  const excluirAmbiente = async (bloco: string, rows: Linha[]) => {
    if (rows.length > 0 && !await confirmar(`Excluir o ambiente "${bloco}"? Os ${rows.length} item(ns) irão para "Itens gerais".`)) return;
    for (const l of rows) onChange(l.key, { bloco: "" });
    setBlocosVazios((prev) => prev.filter((b) => b !== bloco));
  };

  const cabecalhoTabela = (
    <div className={cn("text-muted-foreground bg-muted/40 hidden border-b px-3 py-2 text-xs font-medium", GRID)}>
      <span>#</span>
      <span>{tx("Item")}</span>
      <span className="text-right">{tx("Qtd")}</span>
      <span className="text-right">{tx("Unitário")}</span>
      <span className="text-right">Total</span>
      <span className="text-right">Ações</span>
    </div>
  );

  const renderSecao = (bloco: string, rows: Linha[]) => {
    const subtotal = rows.reduce((s, x) => s + calcLinha(x).total_linha, 0);
    const editandoNome = renomeando?.bloco === bloco && bloco !== "";
    return (
      <div key={bloco || "__geral__"} className="overflow-hidden rounded-lg border">
        <div className="bg-muted/60 flex flex-wrap items-center gap-2 border-b px-3 py-2">
          {editandoNome ? (
            <Input
              autoFocus
              className="h-8 max-w-xs text-sm"
              value={renomeando!.valor}
              onChange={(e) => setRenomeando({ bloco, valor: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); renomear(bloco); }
                if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setRenomeando(null); }
              }}
              onBlur={() => renomear(bloco)}
            />
          ) : (
            <span className="text-sm font-semibold">
              {bloco ? <><MapPin className="text-primary mr-1 inline h-4 w-4 align-text-bottom" />{bloco}</> : "Itens gerais"}{" "}
              <span className="text-muted-foreground text-xs font-normal">({rows.length})</span>
            </span>
          )}
          {!readOnly && bloco && !editandoNome && (
            <>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title={tx("Renomear ambiente")} aria-label={tx("Renomear ambiente")} onClick={() => setRenomeando({ bloco, valor: bloco })}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title={tx("Excluir ambiente")} aria-label={tx("Excluir ambiente")} onClick={() => excluirAmbiente(bloco, rows)}>
                <Trash2 className="text-destructive h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <span className="ml-auto text-sm font-semibold tabular-nums">Subtotal: {formatBRL(subtotal)}</span>
        </div>
        {!readOnly && (
          <div className="border-b p-2">
            <Button type="button" variant="ghost" size="sm" className="text-primary w-full" onClick={() => onAdd(bloco)}>
              <Plus className="mr-1 h-4 w-4" /> Adicionar item {bloco ? `em "${bloco}"` : "geral"}
            </Button>
          </div>
        )}
        {rows.length > 0 && cabecalhoTabela}
        {rows.length === 0 && (
          <p className="text-muted-foreground p-4 text-center text-xs">{tx("Nenhum item neste ambiente ainda.")}</p>
        )}
        {[...rows.filter((l) => novas.current.has(l.key)), ...rows.filter((l) => !novas.current.has(l.key))].map((l) =>
          renderLinha(l, numero.get(l.key) ?? 0),
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">
          Itens da oferta{" "}
          {linhas.length > 0 && (
            <span className="text-muted-foreground font-normal">({linhas.length})</span>
          )}
        </h3>
        {!readOnly && !criando && (
          <Button type="button" variant="outline" size="sm" onClick={() => setCriando(true)}>
            <MapPin className="mr-1 h-4 w-4" /> {tx("Novo ambiente / bloco")}
          </Button>
        )}
      </div>

      {!readOnly && criando && (
        <div className="bg-muted/30 flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3">
          <Input
            autoFocus
            className="h-9 max-w-sm flex-1"
            placeholder={tx("Nome do ambiente (ex.: Frente do condomínio)")}
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); criarAmbiente(); }
              if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setCriando(false); setNovoNome(""); }
            }}
          />
          <Button type="button" size="sm" onClick={criarAmbiente} disabled={!novoNome.trim()}>
            <Check className="mr-1 h-4 w-4" /> {tx("Criar")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setCriando(false); setNovoNome(""); }}>
            {tx("Cancelar")}
          </Button>
        </div>
      )}

      {secoes.map((s) => renderSecao(s.bloco, s.rows))}

      {(gerais.length > 0 || secoes.length === 0) && (
        linhas.length === 0 && secoes.length === 0 ? (
          <>
            <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
              Nenhum item adicionado. {readOnly ? "" : "Crie um ambiente ou adicione itens gerais."}
            </div>
            {!readOnly && (
              <Button type="button" variant="outline" className="w-full" onClick={() => onAdd("")}>
                <Plus className="mr-1 h-4 w-4" /> {tx("Adicionar item geral")}
              </Button>
            )}
          </>
        ) : (
          renderSecao("", gerais)
        )
      )}
      {!readOnly && gerais.length === 0 && secoes.length > 0 && (
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground w-full" onClick={() => onAdd("")}>
          <Plus className="mr-1 h-4 w-4" /> {tx("Adicionar item geral (sem ambiente)")}
        </Button>
      )}
      <NovoItemCompleto
        open={quickFor !== null}
        onOpenChange={(o) => !o && setQuickFor(null)}
        onCreated={(item) => quickFor && onSelectItem(quickFor, String(rowId(item)))}
      />
    </div>
  );
}

/** Serviço próprio x terceirizado: fornecedor, custo cobrado por ele e margem → preço de venda. */
function ServicoTerceiro({ linha: l, fornecedores, readOnly, onChange }: {
  linha: Linha; fornecedores: SearchOption[]; readOnly: boolean; onChange: (p: Partial<Linha>) => void;
}) {
  const vu = num(l.valor_unitario);
  const margemAtual = vu > 0 ? Math.round(((vu - l.preco_custo - (vu * l.imposto_pct) / 100) / vu) * 10000) / 100 : 0;
  const [margem, setMargem] = useState(String(margemAtual));
  const recalcular = (custo: number, m: number) => {
    const p = precoPorMarkup(custo, m, l.imposto_pct);
    onChange(p !== null ? { preco_custo: custo, valor_unitario: String(p) } : { preco_custo: custo });
  };
  const terceiro = l.execucao === "terceiro";
  return (
    <div className="bg-muted/30 mt-2 space-y-2 rounded-md border p-2">
      <div className="flex items-center gap-2">
        <Switch id={`terc-${l.key}`} checked={terceiro} disabled={readOnly}
          onCheckedChange={(v) => onChange({ execucao: v ? "terceiro" : "interno", ...(v ? {} : { fornecedor_id: "" }) })} />
        <Label htmlFor={`terc-${l.key}`} className="text-xs font-medium">Serviço terceirizado (fornecedor executa)</Label>
      </div>
      {terceiro && (
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-3">
            <Label className="text-xs">Fornecedor</Label>
            <SearchSelect value={l.fornecedor_id} onChange={(v) => onChange({ fornecedor_id: v })} options={fornecedores}
              placeholder="Selecione o fornecedor" searchPlaceholder="Nome ou CNPJ…" emptyText="Nenhum fornecedor encontrado." disabled={readOnly} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`cf-${l.key}`} className="text-xs">Custo do fornecedor (R$/un)</Label>
            <Input id={`cf-${l.key}`} type="number" inputMode="decimal" min={0} step="0.01" disabled={readOnly}
              value={l.preco_custo || ""} onChange={(e) => recalcular(num(e.target.value), num(margem))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`mg-${l.key}`} className="text-xs">Margem de lucro (%)</Label>
            <Input id={`mg-${l.key}`} type="number" inputMode="decimal" step="0.01" disabled={readOnly}
              value={margem} onChange={(e) => { setMargem(e.target.value); recalcular(l.preco_custo, num(e.target.value)); }} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Imposto (%)</Label>
            <div className="bg-background flex h-10 items-center rounded-md border px-3 text-sm tabular-nums">{formatPct(l.imposto_pct)}</div>
          </div>
          <p className="text-muted-foreground text-xs sm:col-span-3">
            Preço = custo ÷ (1 − margem − imposto). Use unidade UN/SV (avulso) ou MÊS (mensal). Ao ativar a Oferta, o contas a pagar sai no nome do fornecedor
            {l.natureza === "recorrente" ? ", todo mês." : "."}
            {!l.fornecedor_id && <strong className="text-destructive"> Escolha o fornecedor.</strong>}
          </p>
        </div>
      )}
    </div>
  );
}
