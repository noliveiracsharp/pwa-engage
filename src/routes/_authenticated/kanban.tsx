import { usePagePermissions } from "@/hooks/usePagePermissions";
import { FileText, Settings2 } from "lucide-react";
import { KanbanConfigDialog } from "@/components/kanban/KanbanConfigDialog";
import { SituacaoBadge } from "@/components/orcamentos/SituacaoBadge";
import { AvaliacaoSelo, usePesquisaSatisfacao } from "@/components/atendimentos/Pesquisa";
import { formatBRL } from "@/lib/orcamentos";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CAMPOS_CARD_ORCAMENTO,
  CAMPOS_CARD_PADRAO,
  camposDisponiveisDoVinculo,
  formatarValorCard,
  parseCamposCardTipado,
  type CampoCardTipado,
  salvarCamposCard,
  vinculoDoKanban,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatPhoneDisplay } from "@/lib/input-masks";

export const Route = createFileRoute("/_authenticated/kanban")({
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
  const { data: vinculosUsuario = [], isLoading: loadingVinc } = useQuery({
    queryKey: ["table", "usuario_kanban", usuarioId],
    enabled: !!usuarioId && !isMaster,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("usuario_kanban")
        .select("kanban_nome_id")
        .eq("usuario_id", usuarioId!);
      if (error) throw error;
      return ((data ?? []) as Row[]).map((r) => String(r["kanban_nome_id"]));
    },
  });
  const kanbans = useMemo(() => {
    if (isMaster) {
      // Master: todos os quadros da empresa selecionada no contexto.
      if (empresaId === undefined || empresaId === null) return allKanbans;
      return allKanbans.filter((k) => {
        const e = pick(k, ["empresa_id", "id_empresa"]);
        return e === undefined || e === null || String(e) === String(empresaId);
      });
    }
    if (!usuarioId) return [];
    // Usuário comum: só quadros vinculados em usuario_kanban, na ordem dos vínculos.
    const byId = new Map(allKanbans.map((k) => [String(k["id"]), k]));
    return vinculosUsuario.map((id) => byId.get(id)).filter((k): k is Row => !!k);
  }, [isMaster, allKanbans, empresaId, usuarioId, vinculosUsuario]);
  const loadingKanbans = loadingAll || (!isMaster && (loadingVinc || !usuarioId));
  const { data: etapas = [] } = useRows("kanban_etapas");
  const { data: atendimentos = [] } = useRows("atendimentos");
  const { data: pessoas = [] } = useRows("pessoas");
  const { data: orcamentos = [] } = useRows("orcamentos");

  const [kanbanId, setKanbanId] = useState<string>("");
  const [newKanban, setNewKanban] = useState(false);
  const [newEtapa, setNewEtapa] = useState(false);
  const [form, setForm] = useState({ nome: "", descricao: "", status: true });
  const [etapaForm, setEtapaForm] = useState({ descricao: "", status: true });
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragEtapaId, setDragEtapaId] = useState<string | null>(null);
  const [editEtapa, setEditEtapa] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState({ descricao: "", status: true, is_default_ia: false, is_default_humano: false, is_default_encerrado: false });

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

  const cardsByEtapa = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const a of atendimentos) {
      const etapaId = String(pick(a, ["kanban_etapa_id", "etapa_id", "id_etapa"]) ?? "");
      if (!etapaId) continue;
      const list = map.get(etapaId) ?? [];
      list.push(a);
      map.set(etapaId, list);
    }
    for (const o of orcamentos) {
      const etapaId = String(o["kanban_etapa_id"] ?? "");
      if (!etapaId) continue;
      const list = map.get(etapaId) ?? [];
      list.push({ ...o, __orc: true });
      map.set(etapaId, list);
    }
    return map;
  }, [atendimentos, orcamentos]);

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
    mutationFn: async (value: { descricao: string; status: boolean }) => {
      const payload: Row = {
        descricao: value.descricao.trim(),
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
      setEtapaForm({ descricao: "", status: true });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível criar."),
  });

  const updateEtapa = useMutation({
    mutationFn: async (value: { id: string; descricao: string; status: boolean; is_default_ia: boolean; is_default_humano: boolean; is_default_encerrado: boolean }) => {
      const { error } = await supabase
        .from("kanban_etapas")
        .update({
          descricao: value.descricao.trim(),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["table", "orcamentos"] }),
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível mover."),
  });

  const onDrop = (etapaId: string) => {
    if (!dragId) return;
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
    if (alvo?.["is_default_encerrado"] === true && atual?.["is_default_encerrado"] !== true) {
      void pesquisa.pedir({
        atendimento: card,
        pessoa: pessoaById.get(String(pick(card, ["pessoas_id", "pessoa_id"]) ?? "")),
        executar: () => moveCard.mutateAsync({ id, etapaId, column }).then(() => true, () => false),
      });
      return;
    }
    moveCard.mutate({ id, etapaId, column });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Kanban</h1>
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
          {kanbanId && (
            <Button
              size="icon"
              variant="outline"
              aria-label="Configurar quadro"
              title="Configurar quadro"
              onClick={() => {
                setCfgNovo(false);
                setCfgOpen(true);
              }}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
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
        </div>
      </div>

      <KanbanConfigDialog
        open={cfgOpen}
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
            const cards = cardsByEtapa.get(id) ?? [];
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
                    {cards.length}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label="Editar etapa"
                    onClick={() => {
                      setEditForm({
                        descricao: text(pick(etapa, ETAPA_FIELDS, "")),
                        status: String(pick(etapa, ["status"], "true")) !== "false",
                        is_default_ia: etapa["is_default_ia"] === true,
                        is_default_humano: etapa["is_default_humano"] === true,
                        is_default_encerrado: etapa["is_default_encerrado"] === true,
                      });
                      setEditEtapa(etapa);
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

                <div className="flex flex-col gap-2">
                  {cards.length === 0 && (
                    <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                      Arraste atendimentos para cá
                    </p>
                  )}
                  {cards.map((card) => {
                    if (card["__orc"]) {
                      const dk = `orc:${String(card["id"])}`;
                      return (
                        <button
                          key={dk}
                          type="button"
                          draggable
                          onDragStart={() => setDragId(dk)}
                          onDragEnd={() => setDragId(null)}
                          onClick={() => navigate({ to: "/orcamentos" })}
                          className={cn(
                            "flex w-full items-start gap-2 rounded-md border border-border bg-card p-3 text-left shadow-sm transition hover:border-primary",
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
                            <SituacaoBadge value={card["situacao"]} />
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
                setEtapaForm({ descricao: "", status: true });
                setNewEtapa(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Nova etapa
            </Button>
          </div>
        </div>
      )}

      <Dialog open={newKanban} onOpenChange={setNewKanban}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo kanban</DialogTitle>
            <DialogDescription>Informe os dados do quadro.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
          <DialogFooter className="border-t pt-4 mt-4">
            <Button variant="outline" onClick={() => setNewKanban(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!form.nome.trim() || createKanban.isPending}
              onClick={() => createKanban.mutate(form)}
            >
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pesquisa.dialog}
      <Dialog open={newEtapa} onOpenChange={setNewEtapa}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova etapa</DialogTitle>
            <DialogDescription>A etapa será adicionada ao final do quadro.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
          <DialogFooter className="border-t pt-4 mt-4">
            <Button variant="outline" onClick={() => setNewEtapa(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!etapaForm.descricao.trim() || createEtapa.isPending}
              onClick={() => createEtapa.mutate(etapaForm)}
            >
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editEtapa !== null} onOpenChange={(o) => !o && setEditEtapa(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar etapa</DialogTitle>
            <DialogDescription>Altere o nome e o status da etapa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
          <DialogFooter className="border-t pt-4 mt-4">
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
