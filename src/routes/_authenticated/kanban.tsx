import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useKanbansPermitidos } from "@/hooks/useKanbansPermitidos";
import { CalendarClock, FileText, Search, Settings2, Timer, X } from "lucide-react";
import { ROTULO_STATUS_ACAO, TIPOS_ACAO, statusProximaAcao } from "@/lib/crm";
import { rotuloSla, statusSla } from "@/lib/sla-etapa";

/** Selo de SLA do card: usa a hora em que entrou na etapa (etapa_desde), com fallback para a criação. */
function SeloSla({ card, etapa }: { card: Record<string, unknown>; etapa: Record<string, unknown> }) {
  if (etapa["is_default_encerrado"] === true || etapa["etapa_ganha"] === true) return null;
  const st = statusSla(card["etapa_desde"] ?? card["updated_at"] ?? card["created_at"], etapa["sla_horas"]);
  if (st.estado === "sem_sla") return null;
  return (
    <span className={cn("mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
      st.estado === "ok" ? "border-success/30 bg-success/10 text-success" : st.estado === "atencao" ? "border-warning/30 bg-warning/10 text-warning" : "border-destructive/30 bg-destructive/10 text-destructive")}>
      <Timer className="h-3 w-3" /> {rotuloSla(st)}
    </span>
  );
}
import { EtapaCorPicker } from "@/components/kanban/EtapaCorPicker";
import { corEtapa } from "@/lib/kanban-cores";
import { KanbanConfigDialog } from "@/components/kanban/KanbanConfigDialog";
import { useChecklistGate } from "@/components/kanban/ChecklistGate";
import { AvaliacaoSelo, usePesquisaSatisfacao } from "@/components/atendimentos/Pesquisa";
import { formatBRL } from "@/lib/orcamentos";
import { AtivacaoOfertaDialog } from "@/components/orcamentos/AtivacaoOfertaDialog";
import { situacaoAtivada } from "@/lib/oferta-ativacao";
import { executarHandoff } from "@/lib/kanban-handoff";
import { OfertaKanbanSheet } from "@/components/kanban/OfertaKanbanSheet";
import { temperaturaEfetiva, opcoesQuadro, valorOferta } from "@/lib/temperatura";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CAMPOS_CARD_ORCAMENTO,
  CAMPOS_CARD_PADRAO,
  camposDisponiveisDoVinculo,
  formatarValorCard,
  parseCamposCardTipado,
  type CampoCardTipado,
  salvarCamposCard,
  vinculoDoKanban, tabelaDoKanban,
} from "@/lib/orcamento-kanban";

import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, GripVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { pick, type Row } from "@/lib/row";
import { text } from "@/lib/crud";
import { cn } from "@/lib/utils";
import { COTACAO_STATUS } from "@/lib/laudos";
import { bloqueioMovimento } from "@/lib/cotacao-fluxo";
import { formatPhoneDisplay } from "@/lib/input-masks";

export const Route = createFileRoute("/_authenticated/kanban")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Kanban — Atende.ai" },
      { name: "description", content: "Acompanhe os atendimentos por etapa em um quadro Kanban." },
      { property: "og:title", content: "Kanban — Atende.ai" },
      {
        property: "og:description",
        content: "Acompanhe os atendimentos por etapa em um quadro Kanban.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KanbanPage,
});

const ETAPA_FIELDS = ["descricao", "nome", "titulo"];
const KANBAN_NAME_FIELDS = ["nome", "descricao", "titulo"];

function useRows(table: string) {
  return useQuery({
    queryKey: ["table", table],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.from(table).select("*");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
}

function KanbanPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { empresa, usuario, isMaster } = useAuth();
  const empresaId = empresa?.["id"];
  const kanbanPerms = usePagePermissions("/kanban");

  const { data: allKanbans = [], isLoading: loadingAll } = useRows("kanban_nome");
  const usuarioId = usuario?.["id"] ? String(usuario["id"]) : null;
  const acesso = useKanbansPermitidos();
  const kanbans = useMemo(() => {
    const daEmpresa =
      empresaId === undefined || empresaId === null
        ? allKanbans
        : allKanbans.filter((k) => {
            const e = pick(k, ["empresa_id", "id_empresa"]);
            return e === undefined || e === null || String(e) === String(empresaId);
          });
    if (isMaster) return daEmpresa;
    return daEmpresa.filter((k) => acesso.pode(k["id"]));
  }, [isMaster, allKanbans, empresaId, acesso]);
  const loadingKanbans = loadingAll || acesso.isLoading;
  void usuarioId;
  const { data: etapas = [] } = useRows("kanban_etapas");
  const { data: atendimentos = [] } = useRows("atendimentos");
  const { data: pessoas = [] } = useRows("pessoas");
  const { data: orcamentos = [] } = useRows("orcamentos");
  const { data: cotacoesQ = [] } = useRows("cotacoes");

  const [kanbanId, setKanbanId] = useState<string>("");
  const [newKanban, setNewKanban] = useState(false);
  const [newEtapa, setNewEtapa] = useState(false);
  const [form, setForm] = useState({ nome: "", descricao: "", status: true });
  const [etapaForm, setEtapaForm] = useState({ descricao: "", status: true, cor: "padrao" });
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragEtapaId, setDragEtapaId] = useState<string | null>(null);
  const [editEtapa, setEditEtapa] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState({ descricao: "", status: true, cor: "padrao", is_default_ia: false, is_default_humano: false, is_default_encerrado: false });

  useEffect(() => {
    const valido = kanbans.some((k) => String(k["id"]) === kanbanId);
    if (!valido) setKanbanId(kanbans.length > 0 ? String(kanbans[0]!["id"]) : "");
  }, [kanbans, kanbanId]);

  const boardEtapas = useMemo(
    () =>
      etapas
        .filter(
          (e) => String(pick(e, ["kanban_nome_id", "kanban_id", "id_kanban"]) ?? "") === kanbanId,
        )
        .sort((a, b) => Number(pick(a, ["ordem"], 0)) - Number(pick(b, ["ordem"], 0))),
    [etapas, kanbanId],
  );

  const pessoaById = useMemo(() => {
    const map = new Map<string, Row>();
    for (const c of pessoas) map.set(String(c["id"]), c);
    return map;
  }, [pessoas]);

  const { data: tabelaQuadro = null } = useQuery({
    queryKey: ["kanban-tabela", kanbanId],
    enabled: !!kanbanId,
    queryFn: () => tabelaDoKanban(kanbanId),
  });
  const quadroOfertas = tabelaQuadro === "orcamentos";
  const quadroCotacoes = tabelaQuadro === "cotacoes";
  const [ofertaAberta, setOfertaAberta] = useState<Row | null>(null);
  const kanbanAtual = kanbans.find((k) => String(k["id"]) === kanbanId) ?? null;
  const opc = opcoesQuadro(kanbanAtual, quadroOfertas);
  const cardsByEtapa = useMemo(() => {
    const map = new Map<string, Row[]>();
    // Cada quadro mostra só a entidade da função vinculada (padrão: atendimentos).
    // Quadros de Oferta/Cotação também mostram as conversas (leads do WhatsApp) que estão em suas etapas.
    const etapasDoQuadro = new Set(boardEtapas.map((e) => String(e["id"])));
    for (const a of atendimentos) {
      const etapaId = String(pick(a, ["kanban_etapa_id", "etapa_id", "id_etapa"]) ?? "");
      if (!etapaId) continue;
      if ((quadroOfertas || quadroCotacoes) && !etapasDoQuadro.has(etapaId)) continue;
      const list = map.get(etapaId) ?? [];
      list.push(a);
      map.set(etapaId, list);
    }
    const nrm = (v: unknown) =>
      String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (quadroOfertas) for (const o of orcamentos) {
      // Posição segue a Situação da oferta; o vínculo gravado é só fallback.
      const porSituacao = boardEtapas.find((e) => nrm(e["descricao"]) === nrm(o["situacao"]));
      const etapaId = String(porSituacao?.["id"] ?? o["kanban_etapa_id"] ?? "");
      if (!etapaId) continue;
      const list = map.get(etapaId) ?? [];
      list.push({ ...o, __orc: true });
      map.set(etapaId, list);
    }
    // Cotações: coluna = etapa cujo nome bate com o rótulo (ou código) do status.
    if (quadroCotacoes) for (const c of cotacoesQ) {
      const st = COTACAO_STATUS.find((x) => x.value === String(c["status"] ?? "pendente"));
      const e = boardEtapas.find((et) => [nrm(st?.label), nrm(st?.value)].includes(nrm(et["descricao"])));
      if (!e) continue;
      const id = String(e["id"]);
      map.set(id, [...(map.get(id) ?? []), { ...c, __cot: true }]);
    }
    return map;
  }, [atendimentos, orcamentos, cotacoesQ, quadroOfertas, quadroCotacoes, boardEtapas]);

  const { data: parceiros = [] } = useRows("parceiros");
  const { data: usuarios = [] } = useRows("usuarios");
  const { data: vinculo = null } = useQuery({
    queryKey: ["kanban-vinculo", kanbanId],
    enabled: !!kanbanId,
    queryFn: () => vinculoDoKanban(kanbanId),
  });
  const camposCard = useMemo(
    () =>
      (parseCamposCardTipado(vinculo?.row["campos_card"]) ??
        CAMPOS_CARD_PADRAO) as CampoCardTipado[],
    [vinculo],
  );
  const [cardCfgOpen, setCardCfgOpen] = useState(false);
  const [camposSel, setCamposSel] = useState<string[]>([]);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfgNovo, setCfgNovo] = useState(false);
  const {
    data: disponiveis,
    isLoading: loadingDisp,
    error: erroDisp,
  } = useQuery({
    queryKey: ["kanban-campos-disponiveis", kanbanId],
    enabled: !!vinculo && cardCfgOpen,
    queryFn: () => camposDisponiveisDoVinculo(vinculo!),
  });
  const opcoesCampos: CampoCardTipado[] = disponiveis?.campos.length
    ? disponiveis.campos
    : CAMPOS_CARD_ORCAMENTO;
  const saveCampos = useMutation({
    mutationFn: async () => {
      if (!vinculo) throw new Error("Este kanban não está ligado a uma função.");
      await salvarCamposCard(
        vinculo,
        camposSel
          .map((k) => opcoesCampos.find((c) => c.key === k) ?? camposCard.find((c) => c.key === k))
          .filter((c): c is CampoCardTipado => !!c),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kanban-vinculo"] });
      toast.success("Personalização salva.");
      setCardCfgOpen(false);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const resolverFk = (key: string, v: unknown): string | null => {
    if (key === "parceiro_id" || key === "parceiros_id") {
      const p = parceiros.find((r) => String(r["id"]) === String(v));
      return p ? text(pick(p, ["nome_fantasia", "razao_social", "nome"], "")) || null : null;
    }
    if (key === "usuario_id" || key === "vendedor_id") {
      const u = usuarios.find((r) =>
        ["id", "usuario_id", "user_id", "auth_id"].some((k) => String(r[k] ?? "") === String(v)),
      );
      return u ? text(pick(u, ["nome", "email"], "")) || null : null;
    }
    return null;
  };
  const valorCampo = (o: Row, c: CampoCardTipado): string =>
    formatarValorCard(o[c.key], c, resolverFk);

  const [busca, setBusca] = useState("");
  const [cfgAba, setCfgAba] = useState("dados");
  const cardsVisiveis = useMemo(() => {
    const nrm = (v: unknown) =>
      String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const termo = nrm(busca).trim();
    if (!termo) return cardsByEtapa;
    const digitos = termo.replace(/\D/g, "");
    const textoCard = (c: Row): string => {
      const partes: unknown[] = Object.entries(c)
        .filter(([, v]) => v !== null && typeof v !== "object")
        .map(([, v]) => v);
      for (const [k, v] of Object.entries(c)) {
        if (/(parceiro|vendedor|usuario)s?_id$/.test(k)) partes.push(resolverFk(k, v));
      }
      const pessoa = pessoaById.get(String(pick(c, ["pessoas_id", "pessoa_id", "clientes_id", "cliente_id"]) ?? ""));
      if (pessoa) partes.push(pessoa["nome"], pessoa["telefone"], pessoa["email"]);
      if (c["__orc"]) {
        const t = temperaturaEfetiva(c["situacao"], c["temperatura"]);
        if (t) partes.push(t.label);
        partes.push(formatBRL(valorOferta(c)));
      }
      return partes.map(nrm).join(" | ");
    };
    const out = new Map<string, Row[]>();
    for (const [k, lista] of cardsByEtapa) {
      out.set(k, lista.filter((c) => {
        const t = textoCard(c);
        if (t.includes(termo)) return true;
        return digitos.length >= 3 && t.replace(/\D/g, "").includes(digitos);
      }));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, cardsByEtapa, pessoaById, parceiros, usuarios]);

  const createKanban = useMutation({
    mutationFn: async (value: { nome: string; descricao: string; status: boolean }) => {
      const payload: Row = {
        nome: value.nome.trim(),
        descricao: value.descricao.trim(),
        status: value.status,
      };
      if (empresaId !== undefined) payload["empresa_id"] = empresaId;
      const { error } = await supabase.from("kanban_nome").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["table", "kanban_nome"] });
      toast.success("Kanban criado.");
      setNewKanban(false);
      setForm({ nome: "", descricao: "", status: true });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível criar."),
  });

  const createEtapa = useMutation({
    mutationFn: async (value: { descricao: string; status: boolean; cor: string }) => {
      const payload: Row = {
        descricao: value.descricao.trim(),
        cor: value.cor,
        kanban_nome_id: kanbanId,
        ordem: boardEtapas.length + 1,
        status: value.status,
      };
      const { error } = await supabase.from("kanban_etapas").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["table", "kanban_etapas"] });
      toast.success("Etapa criada.");
      setNewEtapa(false);
      setEtapaForm({ descricao: "", status: true, cor: "padrao" });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível criar."),
  });

  const updateEtapa = useMutation({
    mutationFn: async (value: { id: string; descricao: string; status: boolean; cor: string; is_default_ia: boolean; is_default_humano: boolean; is_default_encerrado: boolean }) => {
      const { error } = await supabase
        .from("kanban_etapas")
        .update({
          descricao: value.descricao.trim(),
          cor: value.cor,
          status: value.status,
          is_default_ia: value.is_default_ia === true,
          is_default_humano: value.is_default_humano === true,
          is_default_encerrado: value.is_default_encerrado === true,
        } as never)
        .eq("id", value.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["table", "kanban_etapas"] });
      toast.success("Etapa atualizada.");
      setEditEtapa(null);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const deleteEtapa = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("kanban_etapas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["table", "kanban_etapas"] });
      toast.success("Etapa excluída.");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir."),
  });

  const reorderEtapas = useMutation({
    mutationFn: async (ordered: Row[]) => {
      for (let i = 0; i < ordered.length; i += 1) {
        const { error } = await supabase
          .from("kanban_etapas")
          .update({ ordem: i + 1 })
          .eq("id", ordered[i]!["id"] as string);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["table", "kanban_etapas"] }),
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível reordenar."),
  });

  const onDropEtapa = (targetId: string) => {
    const sourceId = dragEtapaId;
    setDragEtapaId(null);
    if (!sourceId || sourceId === targetId) return;
    const list = [...boardEtapas];
    const from = list.findIndex((e) => String(e["id"]) === sourceId);
    const to = list.findIndex((e) => String(e["id"]) === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = list.splice(from, 1);
    if (!moved) return;
    list.splice(to, 0, moved);
    reorderEtapas.mutate(list);
  };

  const pesquisa = usePesquisaSatisfacao();
  const checklist = useChecklistGate();
  const moveCard = useMutation({
    mutationFn: async ({
      id,
      etapaId,
      column,
    }: {
      id: string;
      etapaId: string;
      column: string;
    }) => {
      // Status do atendimento = nome da etapa (fonte única da verdade).
      const etapa = etapas.find((e) => String(e["id"]) === etapaId);
      const desc = String(etapa?.["descricao"] ?? etapa?.["nome"] ?? "").trim();
      const patch: Row = { [column]: etapaId };
      if (desc) patch["status"] = desc;
      if (etapa && etapa["is_default_encerrado"] !== true) patch["nota"] = null;
      const { error } = await supabase
        .from("atendimentos")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["table", "atendimentos"] }),
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível mover."),
  });

  const moveOrcamento = useMutation({
    mutationFn: async ({ id, etapaId }: { id: string; etapaId: string }) => {
      const etapa = etapas.find((e) => String(e["id"]) === etapaId);
      const desc = String(etapa?.["descricao"] ?? "").trim();
      const patch: Row = { kanban_etapa_id: etapaId };
      if (String(desc ?? "").trim()) patch["situacao"] = String(desc).trim();
      const { error } = await supabase.from("orcamentos").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, { id, etapaId }) => {
      queryClient.invalidateQueries({ queryKey: ["table", "orcamentos"] });
      const alvo = etapas.find((e) => String(e["id"]) === etapaId);
      const o = orcamentos.find((r) => String(r["id"]) === id);
      const ganha = [true, 1, "true", "t"].includes(alvo?.["etapa_ganha"] as never);
      const antes = etapas.find((e) => String(e["id"]) === String(o?.["kanban_etapa_id"] ?? ""));
      const jaGanha = [true, 1, "true", "t"].includes(antes?.["etapa_ganha"] as never) || situacaoAtivada(o?.["situacao"]);
      if (o) void executarHandoff(etapaId, o, "orcamentos").then((r) => {
        if (!r) return;
        (r.ok ? toast.success : toast.warning)(r.msg);
        queryClient.invalidateQueries({ queryKey: ["table", "atendimentos"] });
      });
      if (o && !jaGanha && situacaoAtivada(alvo?.["descricao"], { id: etapaId, descricao: String(alvo?.["descricao"] ?? ""), ganha })) setAtivarOferta(o);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível mover."),
  });
  const [ativarOferta, setAtivarOferta] = useState<Row | null>(null);

  const onDrop = (etapaId: string) => {
    if (!dragId) return;
    if (dragId.startsWith("cot:")) {
      const id = dragId.slice(4);
      setDragId(null);
      const c = cotacoesQ.find((r) => String(r["id"]) === id);
      const alvo = etapas.find((e) => String(e["id"]) === etapaId);
      const n = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const para = COTACAO_STATUS.find((x) => [n(x.label), n(x.value)].includes(n(alvo?.["descricao"])))?.value;
      if (!c || !para) return void toast.error("Essa etapa não corresponde a um status de cotação.");
      const de = String(c["status"] ?? "pendente");
      const bloq = bloqueioMovimento(de, para);
      if (bloq) return void toast.error(bloq);
      if (de === para) return;
      void supabase.from("cotacoes").update({ status: para } as never).eq("id", id).then(({ error }) => {
        if (error) return void toast.error(error.message);
        queryClient.invalidateQueries({ queryKey: ["table", "cotacoes"] });
      });
      return;
    }
    if (dragId.startsWith("orc:")) {
      const id = dragId.slice(4);
      setDragId(null);
      const o = orcamentos.find((r) => String(r["id"]) === id);
      if (!o || String(o["kanban_etapa_id"] ?? "") === etapaId) return;
      moveOrcamento.mutate({ id, etapaId });
      return;
    }
    const card = atendimentos.find((a) => String(a["id"]) === dragId);
    setDragId(null);
    if (!card) return;
    const column =
      ["kanban_etapa_id", "etapa_id", "id_etapa"].find((k) => k in card) ?? "kanban_etapa_id";
    if (String(card[column] ?? "") === etapaId) return;
    const alvo = etapas.find((e) => String(e["id"]) === etapaId);
    const atual = etapas.find((e) => String(e["id"]) === String(card[column] ?? ""));
    const id = dragId;
    const mover = (): Promise<boolean> => {
      if (alvo?.["is_default_encerrado"] === true && atual?.["is_default_encerrado"] !== true) {
        return pesquisa.pedir({
          atendimento: card,
          pessoa: pessoaById.get(String(pick(card, ["pessoas_id", "pessoa_id"]) ?? "")),
          executar: () => moveCard.mutateAsync({ id, etapaId, column }).then(() => true, () => false),
        });
      }
      return moveCard.mutateAsync({ id, etapaId, column }).then(() => true, () => false);
    };
    if (alvo && checklist.precisa(alvo)) void checklist.exigir({ atendimento: card, etapa: alvo, ...(atual ? { origem: atual } : {}), executar: mover });
    else void mover();
  };

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-foreground">Kanban</h1>
          {opc.totais && quadroOfertas && (
            <span className="text-sm text-muted-foreground">
              Total do funil: <strong className="text-foreground">{formatBRL(boardEtapas.flatMap((e) => cardsVisiveis.get(String(e["id"])) ?? []).reduce((a, o) => a + valorOferta(o), 0))}</strong>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={kanbanId} onValueChange={setKanbanId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder={loadingKanbans ? "Carregando…" : "Selecione um kanban"} />
            </SelectTrigger>
            <SelectContent>
              {kanbans.map((k) => (
                <SelectItem key={String(k["id"])} value={String(k["id"])}>
                  {text(pick(k, KANBAN_NAME_FIELDS, "Sem nome"))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {kanbanId && (isMaster || kanbanPerms.canUpdate) && (
            <Button
              size="icon"
              variant="outline"
              aria-label="Configurar quadro"
              title="Configurar quadro"
              onClick={() => {
                setCfgNovo(false);
                setCfgAba("dados");
                setCfgOpen(true);
              }}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
          {(isMaster || kanbanPerms.canCreate) && (
            <Button
              size="icon"
              aria-label="Novo kanban"
              onClick={() => {
                setCfgNovo(true);
                setCfgOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {kanbanId && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setBusca("")}
              placeholder="Buscar por nome, número, telefone, vendedor ou valor..."
              className="pl-8 pr-8"
            />
            {busca && (
              <button type="button" aria-label="Limpar busca" onClick={() => setBusca("")} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {busca.trim() && (
            <span className="text-sm text-muted-foreground">
              {[...cardsVisiveis.values()].reduce((a, l) => a + l.length, 0)} card(s) encontrado(s)
            </span>
          )}
        </div>
      )}

      <KanbanConfigDialog
        open={cfgOpen}
        abaInicial={cfgAba}
        onOpenChange={setCfgOpen}
        kanban={cfgNovo ? null : (kanbans.find((k) => String(k["id"]) === kanbanId) ?? null)}
        etapas={cfgNovo ? [] : boardEtapas}
        etapasComCards={
          new Set([...cardsByEtapa.entries()].filter(([, l]) => l.length > 0).map(([k]) => k))
        }
        empresaId={empresaId}
        canDelete={kanbanPerms.canDelete}
        kanbans={kanbans}
        todasEtapas={etapas}
        onDeleted={() => setKanbanId("")}
        onCreated={(id) => {
          setKanbanId(id);
          setCfgNovo(false);
        }}
      />

      {!kanbanId && !loadingKanbans && (
        <div className="rounded-lg border border-border bg-card p-10 text-center text-muted-foreground">
          Nenhum kanban cadastrado. Clique em “+” para criar o primeiro.
        </div>
      )}

      {kanbanId && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {boardEtapas.map((etapa) => {
            const id = String(etapa["id"]);
            const cards = cardsVisiveis.get(id) ?? [];
            return (
              <div
                key={id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => (dragEtapaId ? onDropEtapa(id) : onDrop(id))}
                className={cn(
                  "flex w-72 shrink-0 flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3",
                  dragEtapaId === id && "opacity-50",
                )}
              >
                <div className="space-y-3">
                <div className={cn("h-1 w-full rounded-full", corEtapa(etapa["cor"]).className)} />
                <div className="flex items-center gap-1">
                  <span
                    draggable
                    onDragStart={() => setDragEtapaId(id)}
                    onDragEnd={() => setDragEtapaId(null)}
                    className="cursor-grab text-muted-foreground"
                    aria-label="Reordenar etapa"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
                    {text(pick(etapa, ETAPA_FIELDS, "Etapa"))}
                  </span>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                    {opc.totais && quadroOfertas
                      ? `${formatBRL(cards.reduce((a, c) => a + valorOferta(c), 0))} · ${cards.length}`
                      : cards.length}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label="Editar etapa"
                    title="Configurar etapas"
                    onClick={() => {
                      setCfgNovo(false);
                      setCfgAba("etapas");
                      setCfgOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {cards.length === 0 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      aria-label="Excluir etapa"
                      onClick={() => deleteEtapa.mutate(id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                </div>
                <div className="flex flex-col gap-2">
                  {cards.length === 0 && (
                    <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                      {quadroOfertas ? "Arraste ofertas para cá" : quadroCotacoes ? "Arraste cotações para cá" : "Arraste atendimentos para cá"}
                    </p>
                  )}
                  {cards.map((card) => {
                    if (card["__cot"]) {
                      const dk = `cot:${String(card["id"])}`;
                      return (
                        <button
                          key={dk}
                          type="button"
                          draggable
                          onDragStart={() => setDragId(dk)}
                          onDragEnd={() => setDragId(null)}
                          onClick={() => navigate({ to: "/cotacoes", search: { id: String(card["id"]) } })}
                          className={cn("flex w-full flex-col gap-1 rounded-md border border-border bg-card p-3 text-left shadow-sm transition hover:border-primary", dragId === dk && "opacity-50")}
                        >
                          <span className="font-semibold tabular-nums text-foreground">{String(card["numero"] ?? "—")}</span>
                          <span className="truncate text-sm text-foreground">{String(card["titulo"] ?? "")}</span>
                          {!!card["projeto_nome"] && <span className="truncate text-xs text-muted-foreground">{String(card["projeto_nome"])}</span>}
                        </button>
                      );
                    }
                    if (card["__orc"]) {
                      const dk = `orc:${String(card["id"])}`;
                      return (
                        <button
                          key={dk}
                          type="button"
                          draggable
                          onDragStart={() => setDragId(dk)}
                          onDragEnd={() => setDragId(null)}
                          onClick={() => setOfertaAberta(card)}
                          className={cn(
                            "flex w-full items-start gap-2 rounded-md border border-border bg-card p-3 text-left shadow-sm transition hover:border-primary",
                            opc.temperatura && temperaturaEfetiva(card["situacao"], card["temperatura"])?.card,
                            dragId === dk && "opacity-50",
                          )}
                        >
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1 space-y-1">
                            {camposCard.map((c) => (
                              <p key={c.key} className="truncate text-xs text-foreground">
                                <span className="text-muted-foreground">{c.label}: </span>
                                {valorCampo(card, c)}
                              </p>
                            ))}
                            {(() => {
                              const st = statusProximaAcao(card["proxima_acao_em"], card["situacao"]);
                              if (st === "encerrado") return null;
                              const tipo = TIPOS_ACAO.find((t) => t.value === card["proxima_acao_tipo"])?.label;
                              return (
                                <p className={cn("flex items-center gap-1 text-xs font-medium",
                                  st === "agendada" ? "text-muted-foreground" : st === "hoje" ? "text-warning" : "text-destructive")}>
                                  <CalendarClock className="h-3 w-3" />
                                  {ROTULO_STATUS_ACAO[st]}
                                  {st !== "sem_acao" && card["proxima_acao_em"]
                                    ? ` · ${tipo ? `${tipo} ` : ""}${new Date(String(card["proxima_acao_em"])).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                                    : ""}
                                </p>
                              );
                            })()}
                            <SeloSla card={card} etapa={etapa} />
                          </div>
                        </button>
                      );
                    }
                    const pessoaId = String(
                      pick(card, ["pessoas_id", "pessoa_id", "clientes_id", "cliente_id"]) ?? "",
                    );
                    const pessoa = pessoaById.get(pessoaId);
                    return (
                      <button
                        key={String(card["id"])}
                        type="button"
                        draggable
                        onDragStart={() => setDragId(String(card["id"]))}
                        onDragEnd={() => setDragId(null)}
                        onClick={() =>
                          navigate({ to: "/atendimentos", search: { id: String(card["id"]) } })
                        }
                        className={cn(
                          "flex w-full items-start gap-2 rounded-md border border-border bg-card p-3 text-left shadow-sm transition hover:border-primary",
                          dragId === String(card["id"]) && "opacity-50",
                        )}
                      >
                        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {text(pick(pessoa, ["nome"], `Atendimento #${text(card["id"])}`))}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {formatPhoneDisplay(text(pick(pessoa, ["telefone"], ""))) ||
                              text(pick(card, ["status"], "Sem status"))}
                          </p>
                          <div className="mt-1">
                            <AvaliacaoSelo atendimento={card} encerrado={etapa["is_default_encerrado"] === true} />
                          </div>
                          <SeloSla card={card} etapa={etapa} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="w-72 shrink-0">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setEtapaForm({ descricao: "", status: true, cor: "padrao" });
                setNewEtapa(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Nova etapa
            </Button>
          </div>
        </div>
      )}

      <Sheet open={newKanban} onOpenChange={setNewKanban}>
        <SheetContent className="flex flex-col overflow-hidden">
          <SheetHeader>
            <SheetTitle>Novo kanban</SheetTitle>
            <SheetDescription>Informe os dados do quadro.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <div>
              <Label htmlFor="kanban-nome" className="mb-1.5 block">
                Nome
              </Label>
              <Input
                id="kanban-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="kanban-descricao" className="mb-1.5 block">
                Descrição
              </Label>
              <Input
                id="kanban-descricao"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="kanban-status">Status</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">
                  {form.status ? "Ativo" : "Inativo"}
                </span>
                <Switch
                  id="kanban-status"
                  checked={form.status}
                  onCheckedChange={(v) => setForm({ ...form, status: v })}
                />
              </div>
            </div>
          </div>
          <SheetFooter className="mt-auto shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setNewKanban(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!form.nome.trim() || createKanban.isPending}
              onClick={() => createKanban.mutate(form)}
            >
              Criar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {pesquisa.dialog}
      {checklist.dialog}
      <OfertaKanbanSheet oferta={ofertaAberta} onClose={() => setOfertaAberta(null)} />
      <Sheet open={newEtapa} onOpenChange={setNewEtapa}>
        <SheetContent className="flex flex-col overflow-hidden">
          <SheetHeader>
            <SheetTitle>Nova etapa</SheetTitle>
            <SheetDescription>A etapa será adicionada ao final do quadro.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <div>
              <Label htmlFor="etapa-nome" className="mb-1.5 block">
                Descrição
              </Label>
              <Input
                id="etapa-nome"
                value={etapaForm.descricao}
                onChange={(e) => setEtapaForm({ ...etapaForm, descricao: e.target.value })}
              />
            </div>
            <EtapaCorPicker value={etapaForm.cor} onChange={(cor) => setEtapaForm({ ...etapaForm, cor })} />
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="etapa-status">Status</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">
                  {etapaForm.status ? "Ativo" : "Inativo"}
                </span>
                <Switch
                  id="etapa-status"
                  checked={etapaForm.status}
                  onCheckedChange={(v) => setEtapaForm({ ...etapaForm, status: v })}
                />
              </div>
            </div>
          </div>
          <SheetFooter className="mt-auto shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setNewEtapa(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!etapaForm.descricao.trim() || createEtapa.isPending}
              onClick={() => createEtapa.mutate(etapaForm)}
            >
              Criar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={editEtapa !== null} onOpenChange={(o) => !o && setEditEtapa(null)}>
        <SheetContent className="flex flex-col overflow-hidden">
          <SheetHeader>
            <SheetTitle>Editar etapa</SheetTitle>
            <SheetDescription>Altere o nome e o status da etapa.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <div>
              <Label htmlFor="etapa-edit-nome" className="mb-1.5 block">
                Descrição
              </Label>
              <Input
                id="etapa-edit-nome"
                value={editForm.descricao}
                onChange={(e) => setEditForm({ ...editForm, descricao: e.target.value })}
              />
            </div>
            <EtapaCorPicker value={editForm.cor} onChange={(cor) => setEditForm({ ...editForm, cor })} />
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="etapa-edit-status">Status</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">
                  {editForm.status ? "Ativo" : "Inativo"}
                </span>
                <Switch
                  id="etapa-edit-status"
                  checked={editForm.status}
                  onCheckedChange={(v) => setEditForm({ ...editForm, status: v })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="etapa-edit-ia">Padrão IA</Label>
              <Switch
                id="etapa-edit-ia"
                checked={editForm.is_default_ia}
                onCheckedChange={(v) => setEditForm({ ...editForm, is_default_ia: v })}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="etapa-edit-humano">Padrão Equipe</Label>
              <Switch
                id="etapa-edit-humano"
                checked={editForm.is_default_humano}
                onCheckedChange={(v) => setEditForm({ ...editForm, is_default_humano: v })}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="etapa-edit-encerrado">Etapa de Encerramento</Label>
              <Switch
                id="etapa-edit-encerrado"
                checked={editForm.is_default_encerrado}
                onCheckedChange={(v) => setEditForm({ ...editForm, is_default_encerrado: v })}
              />
            </div>
          </div>
          <SheetFooter className="mt-auto shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setEditEtapa(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!editForm.descricao.trim() || updateEtapa.isPending}
              onClick={() =>
                editEtapa && updateEtapa.mutate({ id: String(editEtapa["id"]), ...editForm })
              }
            >
              Salvar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <AtivacaoOfertaDialog
        open={!!ativarOferta}
        onOpenChange={(v) => !v && setAtivarOferta(null)}
        oferta={ativarOferta}
        cliente={(() => { const p = parceiros.find((r) => String(r["id"]) === String(ativarOferta?.["parceiro_id"] ?? "")); return p ? String(p["razao_social"] ?? p["nome_fantasia"] ?? "") : ""; })()}
        empresaId={String(ativarOferta?.["empresa_id"] ?? empresaId ?? "")}
      />
    </div>
  );
}
