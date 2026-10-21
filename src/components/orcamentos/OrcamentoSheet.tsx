import { PessoaCampos } from "@/components/pessoas/PessoaCampos";
import { OfertaTimeline } from "@/components/orcamentos/OfertaTimeline";
import { ConsultorComercial } from "@/components/orcamentos/ConsultorComercial";
import { TEMPERATURAS } from "@/lib/temperatura";
import { MOTIVOS_PERDA, ORIGENS_LEAD, TIPOS_ACAO, negocioPerdido } from "@/lib/crm";
import { OrcamentoDespesas } from "@/components/orcamentos/OrcamentoDespesas";
import { OrcamentoCompra } from "@/components/orcamentos/OrcamentoCompra";
import { condicaoCompraFromValue, condicaoCompraPadrao, condicaoCompraToValue, cronogramaCompra, type CondicaoCompra } from "@/lib/orcamentos";
import {
  despesasFromValue,
  despesasToValue,
  totalDespesas,
  type DespesaOperacional,
} from "@/lib/orcamentos";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchSelect, type SearchOption } from "@/components/data-table/SearchSelect";
import { OrcamentoLinhas } from "@/components/orcamentos/OrcamentoLinhas";
import { OrcamentoTotais } from "@/components/orcamentos/OrcamentoTotais";
import { OrcamentoComissoes } from "@/components/orcamentos/OrcamentoComissoes";
import { useComissaoConfig } from "@/hooks/useComissaoConfig";
import { calcMemoria } from "@/lib/comissoes";
import {
  OrcamentoPagamento,
  type PagamentoState,
} from "@/components/orcamentos/OrcamentoPagamento";
import {
  OrcamentoModalidade,
  type ModalidadeState,
} from "@/components/orcamentos/OrcamentoModalidade";
import { SituacaoBadge } from "@/components/orcamentos/SituacaoBadge";
import { dateOrNull, type LinhaPayload } from "@/hooks/useSaveOrcamento";
import { rowId } from "@/lib/crud";
import { formatCpfCnpj } from "@/lib/input-masks";
import {
  addDaysISO,
  aplicarItem,
  calcAvista,
  calcLinha,
  calcTotais,
  modalidadeOf,
  round2,
  formatBRL,
  gerarParcelas,
  calcEntrada,
  type Parcela,
  somaParcelas,
  linhaFromRow,
  novaLinha,
  num,
  parcelasFromValue,
  situacaoOf,
  SITUACOES,
  toISODate,
  todayISO,
  type DescontoTipo,
  type Linha,
  type Situacao,
} from "@/lib/orcamentos";
import { pick, type Row } from "@/lib/row";
import { addMonthsISO } from "@/lib/orcamentos";
import { useQuery } from "@tanstack/react-query";
import { etapasDoKanban, kanbanDoModuloOrcamentos } from "@/lib/orcamento-kanban";
import { cn } from "@/lib/utils";
import { corEtapa } from "@/lib/kanban-cores";

const NONE = "__none__";
/** Validade padrão de um novo orçamento (dias após a data). */
const VALIDADE_PADRAO_DIAS = 15;

/** ISO do banco → valor de input datetime-local (hora local). */
const paraLocal = (v: unknown) => {
  const d = new Date(String(v ?? ""));
  if (!v || Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

type Header = {
  situacao: string;
  temperatura: string;
  origem_lead: string;
  origem_lead_desc: string;
  motivo_perda: string;
  motivo_perda_obs: string;
  proxima_acao_tipo: string;
  proxima_acao_em: string;
  proxima_acao_obs: string;
  kanban_etapa_id: string;
  dt_orcamento: string;
  validade_orcamento: string;
  parceiro_id: string;
  usuario_id: string;
  descricao: string;
  desconto_tipo: DescontoTipo;
  desconto: string;
  frete: string;
  valores_adicionais: string;
  despesas: DespesaOperacional[];
  compra: CondicaoCompra;
} & PagamentoState &
  ModalidadeState;

const emptyHeader = (vendedorId: string): Header => {
  const hoje = todayISO();
  return {
    situacao: "Em andamento",
    temperatura: "",
    origem_lead: "",
    origem_lead_desc: "",
    motivo_perda: "",
    motivo_perda_obs: "",
    proxima_acao_tipo: "",
    proxima_acao_em: "",
    proxima_acao_obs: "",
    kanban_etapa_id: "",
    dt_orcamento: hoje,
    validade_orcamento: addDaysISO(hoje, VALIDADE_PADRAO_DIAS),
    parceiro_id: "",
    usuario_id: vendedorId,
    descricao: "",
    desconto_tipo: "valor",
    desconto: "",
    frete: "",
    valores_adicionais: "",
    despesas: [],
    compra: condicaoCompraPadrao(),
    obs_nota_fiscal: "",
    forma_pagamento: "",
    forma_pagamento_obs: "",
    qtd_parcelas: "1",
    tem_juros: false,
    coeficiente_juros: "",
    primeira_parcela: hoje,
    entrada_tipo: "percentual",
    entrada: "",
    fixas: {},
    datas: {},
    modalidade: "prazo",
    desconto_avista_tipo: "percentual",
    desconto_avista: "",
    taxa_instalacao: "",
    taxa_instalacao_isenta: false,
    vigencia_meses: "36",
    prazo_indeterminado: false,
    reajuste_indice: "IPCA",
  };
};

/** Reconstrói entrada e valores fixados a partir do cronograma gravado. */
const entradaDoCronograma = (parcelas: Parcela[]) => {
  const datas: Record<number, string> = {};
  const p1 = parcelas[0]?.vencimento ?? "";
  parcelas.forEach((p, i) => {
    if (i > 0 && p1 && p.vencimento !== addMonthsISO(p1, i)) datas[p.numero] = p.vencimento;
  });
  const vazio = { entrada_tipo: "percentual" as const, entrada: "", fixas: {} as Record<number, number>, datas };
  if (parcelas.length < 3) return vazio;
  const ref = parcelas[parcelas.length - 2]!.valor;
  const fixas: Record<number, number> = {};
  parcelas.slice(1, -1).forEach((p) => {
    if (Math.abs(p.valor - ref) > 0.05) fixas[p.numero] = p.valor;
  });
  const temEntrada = Math.abs(parcelas[0]!.valor - ref) > 0.05;
  return {
    entrada_tipo: "valor" as const,
    entrada: temEntrada ? String(parcelas[0]!.valor) : "",
    fixas,
    datas,
  };
};

const headerFromRecord = (r: Row): Header => {
  const parcelas = parcelasFromValue(r["parcelas"]);
  const dt = toISODate(r["dt_orcamento"]) || todayISO();
  return {
    situacao: String(r["situacao"] ?? "") || "Em andamento",
    temperatura: String(r["temperatura"] ?? ""),
    origem_lead: String(r["origem_lead"] ?? ""),
    origem_lead_desc: String(r["origem_lead_desc"] ?? ""),
    motivo_perda: String(r["motivo_perda"] ?? ""),
    motivo_perda_obs: String(r["motivo_perda_obs"] ?? ""),
    proxima_acao_tipo: String(r["proxima_acao_tipo"] ?? ""),
    proxima_acao_em: paraLocal(r["proxima_acao_em"]),
    proxima_acao_obs: String(r["proxima_acao_obs"] ?? ""),
    kanban_etapa_id: String(r["kanban_etapa_id"] ?? ""),
    dt_orcamento: dt,
    validade_orcamento: toISODate(r["validade_orcamento"]),
    parceiro_id: String(pick(r, ["parceiro_id", "parceiros_id"]) ?? ""),
    usuario_id: String(pick(r, ["usuario_id", "vendedor_id"]) ?? ""),
    descricao: String(pick(r, ["descricao"]) ?? ""),
    desconto_tipo: String(r["desconto_tipo"] ?? "") === "percentual" ? "percentual" : "valor",
    desconto: num(r["desconto"]) ? String(num(r["desconto"])) : "",
    frete: num(r["frete"]) ? String(num(r["frete"])) : "",
    valores_adicionais: num(r["valores_adicionais"]) ? String(num(r["valores_adicionais"])) : "",
    despesas: despesasFromValue(r["despesas_operacionais"]),
    compra: condicaoCompraFromValue(r["compra_condicao"]),
    obs_nota_fiscal: String(pick(r, ["obs_nota_fiscal"]) ?? ""),
    forma_pagamento: String(pick(r, ["forma_pagamento"]) ?? ""),
    forma_pagamento_obs: String(pick(r, ["forma_pagamento_obs"]) ?? ""),
    qtd_parcelas: String(num(r["qtd_parcelas"]) || parcelas.length || 1),
    tem_juros: r["tem_juros"] === true,
    coeficiente_juros: num(r["coeficiente_juros"]) ? String(num(r["coeficiente_juros"])) : "",
    primeira_parcela: parcelas[0]?.vencimento || dt,
    ...entradaDoCronograma(parcelas),
    modalidade: modalidadeOf(r["modalidade"]),
    desconto_avista_tipo: String(r["desconto_avista_tipo"] ?? "") === "valor" ? "valor" : "percentual",
    desconto_avista: num(r["desconto_avista"]) ? String(num(r["desconto_avista"])) : "",
    taxa_instalacao: num(r["taxa_instalacao"]) ? String(num(r["taxa_instalacao"])) : "",
    taxa_instalacao_isenta: r["taxa_instalacao_isenta"] === true,
    vigencia_meses: String(num(r["vigencia_meses"]) || 36),
    prazo_indeterminado: r["prazo_indeterminado"] === true,
    reajuste_indice: String(r["reajuste_indice"] ?? "") || "IPCA",
  };
};

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
  marcas: Row[];
  vendedorPadraoId?: string | undefined;
  /** Abre a pré-visualização/PDF do orçamento em edição. */
  onPreview?: (() => void) | undefined;
  onSave: (input: { header: Row; linhas: LinhaPayload[]; manterAberto?: boolean }) => void;
  /** Quando informado (e record = null), abre um novo rascunho copiando esta oferta. */
  duplicarDe?: { record: Row; linhas: Row[] } | null;
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
  marcas,
  vendedorPadraoId,
  onPreview,
  onSave,
  duplicarDe,
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
    const key = record ? `r:${recordId}` : duplicarDe ? `dup:${String(rowId(duplicarDe.record) ?? "")}` : "novo";
    const paraLinha = (rows: Row[]) =>
      rows
        .slice()
        .sort((a, b) => Number(a["ordem"] ?? 0) - Number(b["ordem"] ?? 0))
        .map((row) => {
          const it = itens.find((i) => String(rowId(i)) === String(row["item_id"] ?? ""));
          return linhaFromRow(row, it?.["tipo"]);
        });
    const linhasDb = paraLinha(linhasRecord);
    if (initKey.current !== key) {
      initKey.current = key;
      dirty.current = false;
      if (record) {
        setH(headerFromRecord(record));
        setLinhas(linhasDb);
      } else if (duplicarDe) {
        const hoje = todayISO();
        const base = headerFromRecord(duplicarDe.record);
        setH({
          ...base,
          situacao: "Em andamento",
          kanban_etapa_id: "",
          dt_orcamento: hoje,
          validade_orcamento: addDaysISO(hoje, VALIDADE_PADRAO_DIAS),
          primeira_parcela: hoje,
        });
        const copia = paraLinha(duplicarDe.linhas).map((l, i) => ({
          ...l,
          id: undefined,
          key: `dup-${i}-${Math.random().toString(36).slice(2)}`,
        }));
        setLinhas(copia.length ? copia : [novaLinha()]);
        dirty.current = true;
      } else {
        setH(emptyHeader(vendedorPadraoId ?? ""));
        setLinhas([novaLinha()]);
      }
      return;
    }
    if (record && !dirty.current) {
      setLinhas((atual) => (atual.length !== linhasDb.length ? linhasDb : atual));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record, recordId, linhasRecord, vendedorPadraoId, duplicarDe]);

  const kanbanNomeIdRecord = record?.["kanban_nome_id"] ? String(record["kanban_nome_id"]) : null;
  const { data: etapas = [] } = useQuery({
    queryKey: ["orcamento-etapas", kanbanNomeIdRecord],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => etapasDoKanban(kanbanNomeIdRecord ?? (await kanbanDoModuloOrcamentos())),
  });
  const etapaAtual =
    etapas.find((e) => e.id === h.kanban_etapa_id) ??
    etapas.find((e) => e.descricao.trim().toLowerCase() === h.situacao.trim().toLowerCase());

  // Etapa gravada manda: se o Kanban moveu o card, o rótulo segue a etapa.
  useEffect(() => {
    if (!h.kanban_etapa_id) return;
    const e = etapas.find((x) => x.id === h.kanban_etapa_id);
    if (e && e.descricao !== h.situacao) setH((p) => ({ ...p, situacao: e.descricao }));
  }, [etapas, h.kanban_etapa_id, h.situacao]);

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
            keywords: [
              doc,
              String(c["documento"] ?? ""),
              fantasia,
              String(c["email"] ?? ""),
            ].filter(Boolean),
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    [clientes, h.parceiro_id],
  );

  /** Quem pode pagar um item: o cliente e, em destaque, os vinculados a ele (administradora, facilities…). */
  const pagadorOptions = useMemo<SearchOption[]>(() => {
    const cli = clientes.find((c) => String(rowId(c)) === h.parceiro_id);
    const pai = String(cli?.["parceiro_pai_id"] ?? "");
    return clienteOptions.map((o) =>
      o.value === h.parceiro_id ? { ...o, hint: "Cliente da Oferta" }
      : o.value === pai ? { ...o, hint: `Vinculado • ${o.hint ?? ""}`.trim() } : o);
  }, [clienteOptions, clientes, h.parceiro_id]);

  const vendedorOptions = useMemo(
    () =>
      vendedores
        .filter((u) => u["status"] !== false || String(rowId(u)) === h.usuario_id)
        .map((u) => ({
          value: String(rowId(u) ?? ""),
          label: String(pick(u, ["nome", "email"]) ?? "—"),
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    [vendedores, h.usuario_id],
  );

  const selecionados = useMemo(() => new Set(linhas.map((l) => l.item_id)), [linhas]);
  const marcaNome = useMemo(
    () => new Map(marcas.map((m) => [String(rowId(m) ?? ""), String(m["descricao"] ?? "")])),
    [marcas],
  );
  const itemOptions = useMemo<SearchOption[]>(
    () =>
      itens
        .filter((i) => i["status"] !== false || selecionados.has(String(rowId(i))))
        .map((i) => {
          const codigo = String(i["codigo"] ?? "");
          const descricao = String(i["descricao"] ?? "—");
          const marca = marcaNome.get(String(i["itens_marcas_id"] ?? "")) ?? "";
          const preco = formatBRL(num(i["preco_venda"]));
          return {
            value: String(rowId(i) ?? ""),
            label: codigo ? `${codigo} — ${descricao}` : descricao,
            hint: marca ? `${marca} • ${preco}` : preco,
            keywords: [codigo, String(i["tipo"] ?? ""), marca].filter(Boolean),
            images: Array.isArray(i["imagens"]) ? (i["imagens"] as unknown[]).map(String).filter(Boolean) : [],
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true })),
    [itens, selecionados, marcaNome],
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
  const addLinha = (bloco = "") => {
    dirty.current = true;
    setLinhas((ls) => [...ls, { ...novaLinha(), bloco }]);
  };
  const removeLinha = (key: string) => {
    dirty.current = true;
    setLinhas((ls) => ls.filter((l) => l.key !== key));
  };

  /* ------------------------------ totais ------------------------------ */

  const linhasValidas = useMemo(
    () => linhas.filter((l) => l.item_id !== "" || l.detalhe.trim() !== ""),
    [linhas],
  );
  const calcs = useMemo(() => linhasValidas.map(calcLinha), [linhasValidas]);
  // Implantação = produtos + serviços avulsos; recorrentes viram mensalidade.
  const calcsImplantacao = useMemo(
    () => calcs.filter((_, i) => linhasValidas[i]!.natureza !== "recorrente"),
    [calcs, linhasValidas],
  );
  const totalRecorrente = useMemo(
    () =>
      round2(
        calcs.reduce(
          (s, c, i) => s + (linhasValidas[i]!.natureza === "recorrente" ? c.total_linha : 0),
          0,
        ),
      ),
    [calcs, linhasValidas],
  );
  const totais = useMemo(
    () =>
      calcTotais(calcsImplantacao, {
        desconto_tipo: h.desconto_tipo,
        desconto: h.desconto,
        frete: h.frete,
        valores_adicionais: h.valores_adicionais,
      }),
    [calcsImplantacao, h.desconto_tipo, h.desconto, h.frete, h.valores_adicionais],
  );
  // Comissões: desconto comercial rateado nas linhas de implantação.
  const linhasComissao = useMemo(() => {
    const fator = totais.total_itens > 0 ? (totais.total_itens - totais.desconto_valor) / totais.total_itens : 1;
    return calcs.map((c, i) => {
      const natureza = linhasValidas[i]!.natureza;
      return { natureza, venda: natureza === "recorrente" ? c.total_linha : c.total_linha * fator, compra: c.custo_total };
    });
  }, [calcs, linhasValidas, totais.total_itens, totais.desconto_valor]);
  const comissaoCfg = useComissaoConfig();
  const [totalComissoes, setTotalComissoes] = useState(0);
  const [aba, setAba] = useState<"oferta" | "crm" | "financeiro">("oferta");
  const avista = calcAvista(totais.total_liquido, h.desconto_avista_tipo, h.desconto_avista);
  const ehAvista = h.modalidade === "avista";
  const ehComodato = h.modalidade === "comodato";
  const itensSemCusto = linhasValidas.filter((l) => l.item_id !== "" && l.preco_custo <= 0).length;

  /* ----------------------------- parcelas ----------------------------- */

  const qtdNum = Math.floor(num(h.qtd_parcelas) || 1);
  const entradaValor =
    !ehAvista && qtdNum >= 2 ? calcEntrada(totais.total_liquido, h.entrada_tipo, h.entrada) : 0;

  const parcelas = useMemo(
    () =>
      gerarParcelas({
        total: ehAvista ? avista.total : totais.total_liquido,
        quantidade: ehAvista ? 1 : num(h.qtd_parcelas) || 1,
        primeiraData: h.primeira_parcela,
        comJuros: !ehAvista && h.tem_juros,
        coeficiente: h.coeficiente_juros,
        entrada: ehAvista ? 0 : entradaValor,
        fixas: ehAvista ? {} : h.fixas,
        datas: h.datas,
      }),
    [h.datas, ehAvista, avista.total, totais.total_liquido, h.qtd_parcelas, h.primeira_parcela, h.tem_juros, h.coeficiente_juros, entradaValor, h.fixas],
  );

  // Acréscimo financeiro quando o parcelamento é "Com juros".
  const compraParcelas = useMemo(
    () => cronogramaCompra({ custo: totais.total_custo, condicao: h.compra, parcelasCliente: parcelas, dataPadrao: h.dt_orcamento }),
    [totais.total_custo, h.compra, parcelas, h.dt_orcamento],
  );
  const acrescimoJuros = !ehAvista && h.tem_juros
    ? Math.max(0, somaParcelas(parcelas) - totais.total_liquido)
    : 0;

  // Comodato sempre parcela com juros.
  useEffect(() => {
    if (ehComodato && !h.tem_juros) setH((p) => ({ ...p, tem_juros: true }));
  }, [ehComodato, h.tem_juros]);

  /* ------------------------------ salvar ------------------------------ */

  const submit = (manterAberto = false) => {
    if (manterAberto && (!h.parceiro_id || !h.dt_orcamento || readOnly)) return;
    if (!h.parceiro_id) {
      toast.error("Selecione o cliente da oferta.");
      return;
    }
    if (!h.dt_orcamento) {
      toast.error("Informe a data da oferta.");
      return;
    }
    if (h.validade_orcamento && h.validade_orcamento < h.dt_orcamento) {
      toast.error("A validade não pode ser anterior à data da oferta.");
      return;
    }
    if (linhasValidas.length === 0) {
      toast.error("Adicione pelo menos um item à oferta.");
      return;
    }
    const semQuantidade = linhasValidas.find((l) => num(l.quantidade) <= 0);
    if (semQuantidade) {
      toast.error("Todas as linhas precisam de quantidade maior que zero.");
      return;
    }

    if (negocioPerdido(h.situacao) && !h.motivo_perda) {
      toast.error("Informe o motivo da perda.");
      return;
    }
    const crm: Row = {};
    const campoCrm = (k: keyof Header, v: string | null) => {
      if (v || (record && record[k] != null)) crm[k] = v || null;
    };
    campoCrm("origem_lead", h.origem_lead);
    campoCrm("origem_lead_desc", h.origem_lead_desc);
    campoCrm("motivo_perda", negocioPerdido(h.situacao) ? h.motivo_perda : "");
    campoCrm("motivo_perda_obs", negocioPerdido(h.situacao) ? h.motivo_perda_obs : "");
    campoCrm("proxima_acao_tipo", h.proxima_acao_tipo);
    campoCrm("proxima_acao_em", h.proxima_acao_em ? new Date(h.proxima_acao_em).toISOString() : "");
    campoCrm("proxima_acao_obs", h.proxima_acao_obs);
    const header: Row = {
      ...crm,
      situacao: h.situacao,
      ...(h.temperatura || record?.["temperatura"] ? { temperatura: h.temperatura || null } : {}),
      ...(h.kanban_etapa_id ? { kanban_etapa_id: h.kanban_etapa_id } : {}),
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
      despesas_operacionais: despesasToValue(h.despesas),
      total_despesas: totalDespesas(h.despesas),
      compra_condicao: condicaoCompraToValue(h.compra),
      compra_parcelas: compraParcelas,
      obs_nota_fiscal: h.obs_nota_fiscal.trim() || null,
      forma_pagamento: h.forma_pagamento || null,
      forma_pagamento_obs: h.forma_pagamento_obs.trim() || null,
      qtd_parcelas: ehAvista ? 1 : Math.max(1, Math.floor(num(h.qtd_parcelas) || 1)),
      tem_juros: !ehAvista && h.tem_juros,
      coeficiente_juros: !ehAvista && h.tem_juros ? num(h.coeficiente_juros) : 0,
      parcelas,
      modalidade: h.modalidade,
      desconto_avista_tipo: h.desconto_avista_tipo,
      desconto_avista: ehAvista ? num(h.desconto_avista) : 0,
      desconto_avista_valor: ehAvista ? avista.desconto_valor : 0,
      total_avista: ehAvista ? avista.total : null,
      taxa_instalacao: ehComodato ? num(h.taxa_instalacao) : 0,
      taxa_instalacao_isenta: ehComodato && h.taxa_instalacao_isenta,
      total_recorrente: totalRecorrente,
      vigencia_meses: Math.max(1, Math.floor(num(h.vigencia_meses) || 36)),
      reajuste_indice: h.reajuste_indice.trim() || "IPCA",
      // Só envia a coluna quando já existe no banco (registro carregado) ou quando foi ligada.
      ...(h.prazo_indeterminado || (record && "prazo_indeterminado" in record) ? { prazo_indeterminado: h.prazo_indeterminado } : {}),
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
        natureza: l.natureza,
        bloco: l.bloco.trim() || null,
        faturar_para_id: l.faturar_para_id && l.faturar_para_id !== h.parceiro_id ? l.faturar_para_id : null,
      };
    });
    header["faturamento_misto"] = payloadLinhas.some((l) => l.faturar_para_id);

    onSave({ header, linhas: payloadLinhas, manterAberto });
  };

  const numero = record ? String(record["numero"] ?? "") : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[92vw] lg:max-w-5xl xl:max-w-6xl">
        <SheetHeader className="px-6 pb-4">
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {record ? `Oferta ${numero || ""}`.trim() : "Nova oferta"}
            {record && <SituacaoBadge value={etapaAtual?.descricao ?? h.situacao} cor={etapaAtual?.cor} />}
          </SheetTitle>
          <SheetDescription>
            {record
              ? "Altere os dados, itens e condições comerciais da oferta."
              : "O número é gerado automaticamente no formato #ano-sequência ao salvar."}
          </SheetDescription>
        </SheetHeader>

        <fieldset
          disabled={Boolean(readOnly)}
          className="min-w-0 space-y-6 px-6 disabled:opacity-70"
        >
          <div role="tablist" className="sticky top-0 z-10 -mx-6 flex gap-1 border-b border-border bg-background px-6 pt-2">
            {([["oferta", "Oferta & Itens"], ["crm", "CRM & Atendimento"], ["financeiro", "Financeiro & Comissões"]] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
                className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  aba === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {l}
              </button>
            ))}
          </div>

          <div hidden={aba !== "oferta"} className="space-y-6">
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
              <Select
                value={h.kanban_etapa_id || (etapaAtual?.id ?? "")}
                onValueChange={(v) => {
                  const e = etapas.find((x) => x.id === v);
                  if (e) patchHeader({ kanban_etapa_id: e.id, situacao: e.descricao });
                }}
                disabled={Boolean(readOnly) || etapas.length === 0}
              >
                <SelectTrigger id="situacao">
                  <SelectValue placeholder={h.situacao || "Sem etapas no Kanban"} />
                </SelectTrigger>
                <SelectContent>
                  {etapas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      <span className="flex items-center gap-2">
                        <span className={cn("h-2.5 w-2.5 rounded-full", corEtapa(e.cor).className)} />
                        {e.descricao}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="temperatura" className="block text-sm font-medium">
                Temperatura
              </Label>
              <Select
                value={h.temperatura || "nenhuma"}
                onValueChange={(v) => patchHeader({ temperatura: v === "nenhuma" ? "" : v })}
                disabled={Boolean(readOnly)}
              >
                <SelectTrigger id="temperatura"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Sem temperatura</SelectItem>
                  {TEMPERATURAS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="flex items-center gap-2">
                        <span className={cn("h-2.5 w-2.5 rounded-full", t.dot)} />
                        {t.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="dt_orcamento" className="block text-sm font-medium">
                Data da oferta
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
                disabled={Boolean(readOnly)}
              />
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="usuario_id" className="block text-sm font-medium">
                Vendedor
              </Label>
              <Select
                value={h.usuario_id || NONE}
                onValueChange={(v) => patchHeader({ usuario_id: v === NONE ? "" : v })}
                disabled={Boolean(readOnly)}
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
                placeholder="Objeto da oferta, condições de pagamento, prazo de entrega…"
                onChange={(e) => patchHeader({ descricao: e.target.value })}
              />
            </div>
          </div>

          {/* -------------------------- itens -------------------------- */}
          <OrcamentoLinhas
            linhas={linhas}
            itemOptions={itemOptions}
            unidadeOptions={unidadeOptions}
            itens={itens}
            marcas={marcas}
            readOnly={readOnly}
            onChange={updateLinha}
            onSelectItem={selectItem}
            onAdd={addLinha}
            onRemove={removeLinha}
            onItemSalvo={() => submit(true)}
            pagadorOptions={pagadorOptions}
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
            acrescimoJuros={acrescimoJuros}
            descontoAvista={ehAvista ? avista.desconto_valor : 0}
            comissoes={totalComissoes}
            despesas={totalDespesas(h.despesas)}
            onChange={(patch) => patchHeader(patch)}
          />
          </div>

          <div hidden={aba !== "financeiro"} className="space-y-6">
          <OrcamentoDespesas
            despesas={h.despesas}
            readOnly={readOnly}
            onChange={(despesas) => patchHeader({ despesas })}
          />

          <OrcamentoCompra
            value={h.compra}
            custo={totais.total_custo}
            cronograma={compraParcelas}
            readOnly={readOnly}
            onChange={(compra) => patchHeader({ compra })}
          />

          {/* ------------- memória de cálculo e comissões ------------- */}
          <OrcamentoComissoes
            linhas={linhasComissao}
            orcamentoId={record ? String(rowId(record) ?? "") || undefined : undefined}
            vendedorId={h.usuario_id || undefined}
            usuarios={vendedores}
            onTotalChange={setTotalComissoes}
          />
          </div>

          <div hidden={aba !== "crm"} className="space-y-6">
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label className="block text-sm font-medium">Origem do lead</Label>
              <SearchSelect
                value={h.origem_lead}
                onChange={(v) => patchHeader({ origem_lead: v })}
                options={ORIGENS_LEAD.map((o) => ({ value: o, label: o }))}
                placeholder="Selecione"
                searchPlaceholder="Pesquisar…"
                disabled={Boolean(readOnly)}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="origem_lead_desc" className="block text-sm font-medium">Detalhes da origem</Label>
              <Input id="origem_lead_desc" value={h.origem_lead_desc} disabled={Boolean(readOnly)}
                placeholder="Ex.: Feira Predial Expo 2026, indicação do Dr. Marcelo"
                onChange={(e) => patchHeader({ origem_lead_desc: e.target.value })} />
            </div>

            <div className="min-w-0 space-y-1.5 sm:col-span-2 rounded-md border border-border p-3">
              <p className="text-sm font-medium">Próxima ação</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <SearchSelect
                  value={h.proxima_acao_tipo}
                  onChange={(v) => patchHeader({ proxima_acao_tipo: v })}
                  options={TIPOS_ACAO.map((t) => ({ value: t.value, label: t.label }))}
                  placeholder="Tipo"
                  searchPlaceholder="Pesquisar…"
                  disabled={Boolean(readOnly)}
                />
                <Input type="datetime-local" value={h.proxima_acao_em} disabled={Boolean(readOnly)}
                  onChange={(e) => patchHeader({ proxima_acao_em: e.target.value })} aria-label="Data e hora da próxima ação" />
                <Input value={h.proxima_acao_obs} disabled={Boolean(readOnly)} placeholder="O que fazer"
                  onChange={(e) => patchHeader({ proxima_acao_obs: e.target.value })} />
              </div>
            </div>

            {negocioPerdido(h.situacao) && (
              <div className="min-w-0 space-y-1.5 sm:col-span-2 rounded-md border border-destructive/40 p-3">
                <p className="text-sm font-medium">Motivo da perda *</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <SearchSelect
                    value={h.motivo_perda}
                    onChange={(v) => patchHeader({ motivo_perda: v })}
                    options={MOTIVOS_PERDA.map((m) => ({ value: m, label: m }))}
                    placeholder="Selecione o motivo"
                    searchPlaceholder="Pesquisar…"
                    disabled={Boolean(readOnly)}
                  />
                  <Input value={h.motivo_perda_obs} disabled={Boolean(readOnly)} placeholder="Detalhes (ex.: concorrente)"
                    onChange={(e) => patchHeader({ motivo_perda_obs: e.target.value })} />
                </div>
              </div>
            )}
          </div>

          {record && recordId && (
            <ConsultorComercial
              orcamentoId={String(recordId)}
              contexto={{
                numero: record["numero"], situacao: h.situacao, temperatura: h.temperatura,
                origem: h.origem_lead, origem_detalhe: h.origem_lead_desc,
                data_oferta: h.dt_orcamento, validade: h.validade_orcamento,
                cliente: clienteOptions.find((c) => c.value === h.parceiro_id)?.label ?? null,
                vendedor: vendedorOptions.find((v) => v.value === h.usuario_id)?.label ?? null,
                descricao: h.descricao,
                proxima_acao: { tipo: h.proxima_acao_tipo, em: h.proxima_acao_em, obs: h.proxima_acao_obs },
                motivo_perda: h.motivo_perda || null,
                totais: { liquido: totais.total_liquido, custo: totais.total_custo, mensal: totalRecorrente },
                itens: linhas.map((l) => ({ ...(l as unknown as Record<string, unknown>) })).slice(0, 40),
              }}
              empresaId={record["empresa_id"]}
              readOnly={Boolean(readOnly)}
            />
          )}

          {record && (
            <div className="rounded-lg border p-4">
              <PessoaCampos pessoaId={recordId} templates={["ofertas"]} tabela="orcamentos_camposperson" fk="orcamento_id" titulo="Campos personalizados da Oferta" />
            </div>
          )}

          {record && recordId && (
            <div className="rounded-lg border p-4">
              <OfertaTimeline orcamentoId={String(recordId)} empresaId={record["empresa_id"]} readOnly={Boolean(readOnly)} />
            </div>
          )}
          {!record && <p className="text-sm text-muted-foreground">Salve a oferta para registrar a linha do tempo e usar o Consultor Comercial.</p>}
          </div>

          <div hidden={aba !== "oferta"} className="space-y-6">
          {/* ------------- modalidade e serviços recorrentes ------------- */}
          <OrcamentoModalidade
            value={h}
            totalImplantacao={totais.total_liquido}
            totalAvista={avista.total}
            totalRecorrente={totalRecorrente}
            readOnly={readOnly}
            onChange={(patch) => patchHeader(patch)}
          />

          {/* ---------------- pagamento e nota fiscal ------------------ */}
          <OrcamentoPagamento
            value={h}
            parcelas={parcelas}
            totalLiquido={ehAvista ? avista.total : totais.total_liquido}
            entradaValor={entradaValor}
            modalidade={h.modalidade}
            readOnly={readOnly}
            onChange={(patch) => patchHeader(patch)}
          />
          </div>
        </fieldset>

        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t px-6 py-4">
          {record && onPreview && (
            <Button variant="secondary" onClick={onPreview} className="mr-auto">
              <FileText className="mr-2 h-4 w-4" />
              Visualizar / PDF
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => submit()} disabled={saving || readOnly}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
