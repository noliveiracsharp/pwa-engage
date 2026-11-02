import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Bot, Check, ClipboardCheck, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { ChecklistTemplates, useChecklistTemplates } from "./ChecklistTemplates";
import { EtapaCorPicker } from "./EtapaCorPicker";
import { corEtapa } from "@/lib/kanban-cores";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { pick, type Row } from "@/lib/row";
import { labelAmigavel, parseCamposCardTipado, type CampoCardTipado } from "@/lib/orcamento-kanban";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { KanbanPerfisAcesso } from "./KanbanPerfisAcesso";

const errMsg = (e: unknown, f: string) => {
  const m = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
  return m ? `${f} ${m}` : f;
};
const funcaoKey = (f: Row) => String(pick(f, ["funcao_id", "id"]) ?? "");

/** Normaliza o retorno da RPC listar_colunas_tabela em [{key, tipo}]. */
function colunasDaRpc(data: unknown): { key: string; tipo: string }[] {
  let v = data;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (Array.isArray(v) && v.length === 1 && v[0] && typeof v[0] === "object") {
    const inner = Object.values(v[0] as Row)[0];
    if (Object.keys(v[0] as Row).length === 1 && Array.isArray(inner)) v = inner;
  }
  if (!Array.isArray(v)) return [];
  return v
    .map((c) => {
      if (typeof c === "string") return { key: c, tipo: "" };
      const r = c as Row;
      const key = pick<string>(r, ["key", "column_name", "coluna", "nome", "name"]);
      return key
        ? {
            key: String(key),
            tipo: String(pick(r, ["tipo", "data_type", "type", "udt_name"], "") ?? ""),
          }
        : null;
    })
    .filter((c): c is { key: string; tipo: string } => !!c);
}

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kanban: Row | null;
  etapas: Row[];
  etapasComCards: Set<string>;
  empresaId: unknown;
  onCreated: (id: string) => void;
  canDelete?: boolean;
  kanbans?: Row[];
  todasEtapas?: Row[];
  onDeleted?: () => void;
  abaInicial?: string;
};

export function KanbanConfigDialog({
  open,
  onOpenChange,
  kanban,
  etapas,
  etapasComCards,
  empresaId,
  onCreated,
  canDelete = false,
  kanbans = [],
  todasEtapas = [],
  onDeleted,
  abaInicial,
}: Props) {
  const qc = useQueryClient();
  const kanbanId = kanban ? String(kanban["id"]) : "";
  const [tab, setTab] = useState("dados");
  const [form, setForm] = useState({ nome: "", descricao: "", status: true, totais: false, temperatura: false, entrada: false });
  const [novaEtapa, setNovaEtapa] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editCor, setEditCor] = useState("padrao");
  const [novaCor, setNovaCor] = useState("padrao");
  const [editIA, setEditIA] = useState(false);
  const [editHum, setEditHum] = useState(false);
  const [editCk, setEditCk] = useState(false);
  const [editGanha, setEditGanha] = useState(false);
  const [editEnc, setEditEnc] = useState(false);
  const [editTpl, setEditTpl] = useState("");
  const [editCkS, setEditCkS] = useState(false);
  const [editTplS, setEditTplS] = useState("");
  const [editDestK, setEditDestK] = useState("");
  const [editDestE, setEditDestE] = useState("");
  const { data: templates = [] } = useChecklistTemplates(empresaId);
  const [funcaoId, setFuncaoId] = useState("");
  const [sel, setSel] = useState<CampoCardTipado[]>([]);

  useEffect(() => {
    if (!open) return;
    setTab(kanban && abaInicial ? abaInicial : "dados");
    setForm({
      nome: String(kanban?.["nome"] ?? ""),
      descricao: String(kanban?.["descricao"] ?? ""),
      status: kanban ? String(kanban["status"] ?? "true") !== "false" : true,
      totais: [true, "true", "t", 1].includes(kanban?.["exibir_totais"] as never),
      temperatura: [true, "true", "t", 1].includes(kanban?.["habilitar_temperatura"] as never),
      entrada: [true, "true", "t", 1].includes(kanban?.["quadro_entrada"] as never),
    });
    setEditId(null);
    setNovaEtapa("");
      setNovaCor("padrao");
  }, [open, kanban]);

  const { data: funcoes = [] } = useQuery({
    queryKey: ["funcoes-com-tabela-base"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funcoes")
        .select("*")
        .not("tabela_base", "is", null);
      if (error) throw error;
      return ((data ?? []) as Row[]).filter((f) => String(f["tabela_base"] ?? "").trim());
    },
  });

  // Vínculo existente deste quadro
  const { data: vinculo = null } = useQuery({
    queryKey: ["kanban-vinculo-cfg", kanbanId],
    enabled: open && !!kanbanId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funcoes_kanban" as never)
        .select("*")
        .eq("kanban_nome_id", kanbanId);
      if (error) return null;
      return ((data ?? []) as Row[])[0] ?? null;
    },
  });

  useEffect(() => {
    if (!open) return;
    setFuncaoId(vinculo ? String(pick(vinculo, ["funcao_id", "funcoes_id"]) ?? "") : "");
    setSel(parseCamposCardTipado(vinculo?.["campos_card"]) ?? []);
  }, [open, vinculo]);

  const funcaoSel = funcoes.find((f) => funcaoKey(f) === funcaoId);
  const tabelaBase = funcaoSel ? String(funcaoSel["tabela_base"]).trim() : "";

  const {
    data: colunas = [],
    isLoading: loadingCols,
    error: erroCols,
  } = useQuery({
    queryKey: ["listar-colunas", tabelaBase],
    enabled: open && !!tabelaBase,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "listar_colunas_tabela" as never,
        { nome_tabela: tabelaBase } as never,
      );
      if (error) throw error;
      return colunasDaRpc(data);
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["table", "kanban_nome"] });
    qc.invalidateQueries({ queryKey: ["table", "kanban_etapas"] });
    qc.invalidateQueries({ queryKey: ["kanban-vinculo"] });
    qc.invalidateQueries({ queryKey: ["kanban-vinculo-cfg"] });
  };

  const saveDados = useMutation({
    mutationFn: async () => {
      const payload: Row = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim(),
        status: form.status,
      };
      // Só envia os parâmetros quando ligados ou já existentes, para não quebrar bancos sem o script.
      if (form.totais || (kanban && "exibir_totais" in kanban)) payload["exibir_totais"] = form.totais;
      if (form.temperatura || (kanban && "habilitar_temperatura" in kanban)) payload["habilitar_temperatura"] = form.temperatura;
      if (form.entrada || (kanban && "quadro_entrada" in kanban)) payload["quadro_entrada"] = form.entrada;
      if (kanbanId) {
        const { error } = await supabase.from("kanban_nome").update(payload).eq("id", kanbanId);
        if (error) throw error;
        return kanbanId;
      }
      if (empresaId !== undefined) payload["empresa_id"] = empresaId;
      const { data, error } = await supabase
        .from("kanban_nome")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return String((data as Row)["id"]);
    },
    onSuccess: (id) => {
      invalidate();
      toast.success(kanbanId ? "Quadro atualizado." : "Quadro criado. Agora cadastre as etapas.");
      if (!kanbanId) {
        onCreated(id);
        setTab("etapas");
      }
    },
    onError: (e) => toast.error(errMsg(e, "Não foi possível salvar.")),
  });

  const addEtapa = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("kanban_etapas").insert({
        descricao: novaEtapa.trim(),
        cor: novaCor,
        kanban_nome_id: kanbanId,
        ordem: etapas.length + 1,
        status: true,
        is_default_ia: false,
        is_default_humano: false,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setNovaEtapa("");
      setNovaCor("padrao");
    },
    onError: (e) => toast.error(errMsg(e, "Não foi possível criar.")),
  });

  const updEtapa = useMutation({
    mutationFn: async (v: { id: string; patch: Row }) => {
      // Campos independentes: grava exatamente o que está na tela.
      const { data, error } = await supabase.from("kanban_etapas").update(v.patch as never).eq("id", v.id).select("*");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("A etapa não foi atualizada (sem permissão no banco para alterar esta etapa).");
      const salvo = data[0] as Row;
      if ("exige_checklist" in v.patch && !("exige_checklist" in salvo)) {
        throw new Error("A coluna exige_checklist não existe em kanban_etapas. Execute o script SQL do checklist.");
      }
    },
    onSuccess: () => {
      invalidate();
      setEditId(null);
    },
    onError: (e) => toast.error(errMsg(e, "Não foi possível salvar.")),
  });

  const delEtapa = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("kanban_etapas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(errMsg(e, "Não foi possível excluir.")),
  });

  const mover = useMutation({
    mutationFn: async ({ from, to }: { from: number; to: number }) => {
      const list = [...etapas];
      const [m] = list.splice(from, 1);
      if (!m) return;
      list.splice(to, 0, m);
      for (let i = 0; i < list.length; i += 1) {
        const { error } = await supabase
          .from("kanban_etapas")
          .update({ ordem: i + 1 })
          .eq("id", String(list[i]?.["id"] ?? ""));
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(errMsg(e, "Não foi possível reordenar.")),
  });

  const saveIntegracao = useMutation({
    mutationFn: async () => {
      if (!funcaoId) throw new Error("Selecione uma função.");
      const payload: Row = { kanban_nome_id: kanbanId, funcao_id: funcaoId, campos_card: sel };
      if (empresaId !== undefined) payload["empresa_id"] = empresaId;
      const gravar = (p: Row) => {
        const t = supabase.from("funcoes_kanban" as never);
        return vinculo
          ? vinculo["id"] !== undefined
            ? t.update(p as never).eq("id", vinculo["id"] as never)
            : t.update(p as never).eq("kanban_nome_id", kanbanId as never)
          : t.insert(p as never);
      };
      let { error } = await gravar(payload);
      // Tabela sem coluna empresa_id: grava sem ela.
      if (error && /empresa_id/.test(error.message ?? "") && "empresa_id" in payload) {
        const { empresa_id: _e, ...semEmpresa } = payload;
        ({ error } = await gravar(semEmpresa));
      }
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Integração salva.");
    },
    onError: (e) => toast.error(errMsg(e, "Não foi possível salvar.")),
  });

  const temCards = etapas.some((e) => etapasComCards.has(String(e["id"])));
  const [transfer, setTransfer] = useState(false);
  const [destKanban, setDestKanban] = useState("");
  const [destEtapa, setDestEtapa] = useState("");
  useEffect(() => {
    if (!open) setTransfer(false);
  }, [open]);
  const outrosKanbans = kanbans.filter((k) => String(k["id"]) !== kanbanId);
  const etapasDest = todasEtapas
    .filter((e) => String(e["kanban_nome_id"] ?? "") === destKanban)
    .sort((x, y) => Number(x["ordem"] ?? 0) - Number(y["ordem"] ?? 0));

  const contarOrcamentos = async () => {
    const { count } = await supabase
      .from("orcamentos")
      .select("id", { count: "exact", head: true })
      .eq("kanban_nome_id" as never, kanbanId as never);
    return count ?? 0;
  };

  const delKanban = useMutation({
    mutationFn: async () => {
      const etapaIds = etapas.map((e) => String(e["id"]));
      if (transfer) {
        if (!destKanban || !destEtapa) throw new Error("Escolha o quadro e a etapa de destino.");
        const patch = { kanban_nome_id: destKanban, kanban_etapa_id: destEtapa };
        const { error: eo } = await supabase
          .from("orcamentos")
          .update(patch as never)
          .eq("kanban_nome_id" as never, kanbanId as never);
        if (eo) throw eo;
        if (etapaIds.length) {
          const { error: eo2 } = await supabase
            .from("orcamentos")
            .update(patch as never)
            .in("kanban_etapa_id" as never, etapaIds as never);
          if (eo2) throw eo2;
          const { error: ea } = await supabase
            .from("atendimentos")
            .update(patch as never)
            .in("kanban_etapa_id" as never, etapaIds as never);
          if (ea) {
            const { error: ea2 } = await supabase
              .from("atendimentos")
              .update({ kanban_etapa_id: destEtapa } as never)
              .in("kanban_etapa_id" as never, etapaIds as never);
            if (ea2) throw ea2;
          }
        }
      } else if (temCards || (await contarOrcamentos()) > 0) {
        throw new Error("Há cards vinculados. Escolha para onde transferi-los.");
      }
      await supabase.from("funcoes_kanban" as never).delete().eq("kanban_nome_id", kanbanId as never);
      await supabase.from("usuario_kanban" as never).delete().eq("kanban_nome_id", kanbanId as never);
      const { error: e1 } = await supabase.from("kanban_etapas").delete().eq("kanban_nome_id", kanbanId);
      if (e1) throw e1;
      const { error } = await supabase.from("kanban_nome").delete().eq("id", kanbanId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["table", "orcamentos"] });
      qc.invalidateQueries({ queryKey: ["table", "atendimentos"] });
      toast.success(transfer ? "Itens transferidos e quadro excluído." : "Quadro excluído.");
      onOpenChange(false);
      onDeleted?.();
    },
    onError: (e) => toast.error(errMsg(e, "Não foi possível excluir.")),
  });

  const pedirExclusao = async () => {
    const precisa = temCards || (await contarOrcamentos()) > 0;
    if (precisa) {
      setDestKanban("");
      setDestEtapa("");
      setTransfer(true);
      return;
    }
    if (await confirmar("Excluir este quadro e todas as suas etapas?")) delKanban.mutate();
  };

  const toggle = (c: { key: string; tipo: string }, on: boolean) =>
    setSel((s) =>
      on
        ? [...s, { key: c.key, label: labelAmigavel(c.key), tipo: c.tipo || "text" }]
        : s.filter((x) => x.key !== c.key),
    );

  const selKeys = useMemo(() => new Set(sel.map((s) => s.key)), [sel]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-0 overflow-hidden p-0">
        <SheetHeader className="shrink-0 border-b px-6 py-5 pr-12 text-left">
          <SheetTitle>{kanban ? "Configurar quadro" : "Novo quadro"}</SheetTitle>
          <SheetDescription>Dados, etapas e integração do quadro Kanban.</SheetDescription>
        </SheetHeader>
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-4 my-4 grid h-auto shrink-0 grid-cols-2 gap-1 sm:grid-cols-5">
            <TabsTrigger value="dados">Dados do Quadro</TabsTrigger>
            <TabsTrigger value="etapas" disabled={!kanbanId}>
              Etapas
            </TabsTrigger>
            <TabsTrigger value="integracao" disabled={!kanbanId}>
              Integração e Cards
            </TabsTrigger>
            <TabsTrigger value="checklists">Checklists</TabsTrigger>
            <TabsTrigger value="perfis" disabled={!kanbanId}>
              Perfis de Acesso
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="m-0 min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6">
            <div>
              <Label htmlFor="kb-nome" className="mb-1.5 block">
                Nome
              </Label>
              <Input
                id="kb-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="kb-desc" className="mb-1.5 block">
                Descrição
              </Label>
              <Input
                id="kb-desc"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="kb-status">Status</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {form.status ? "Ativo" : "Inativo"}
                </span>
                <Switch
                  id="kb-status"
                  checked={form.status}
                  onCheckedChange={(v) => setForm({ ...form, status: v })}
                />
              </div>
            </div>
            <label className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
              <span>Exibir totalizador financeiro no cabeçalho<span className="block text-xs text-muted-foreground">Soma o valor dos cards em cada etapa e no funil. Ideal para Ofertas.</span></span>
              <Switch checked={form.totais} onCheckedChange={(v) => setForm({ ...form, totais: v })} />
            </label>
            <label className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
              <span>Habilitar temperatura dos cards<span className="block text-xs text-muted-foreground">Pinta o card conforme Frio, Morno ou Quente definido na Oferta.</span></span>
              <Switch checked={form.temperatura} onCheckedChange={(v) => setForm({ ...form, temperatura: v })} />
            </label>
            <label className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
              <span>Quadro de entrada das conversas<span className="block text-xs text-muted-foreground">Novas mensagens do WhatsApp (sem atalho #) começam neste quadro. Ligue em apenas um.</span></span>
              <Switch checked={form.entrada} onCheckedChange={(v) => setForm({ ...form, entrada: v })} />
            </label>
            {transfer && (
              <div className="space-y-3 rounded-md border border-destructive/50 p-3">
                <p className="text-sm">
                  Este quadro tem itens vinculados. Para onde devem ser transferidos?
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    value={destKanban}
                    onValueChange={(v) => {
                      setDestKanban(v);
                      setDestEtapa("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Quadro de destino" />
                    </SelectTrigger>
                    <SelectContent>
                      {outrosKanbans.map((k) => (
                        <SelectItem key={String(k["id"])} value={String(k["id"])}>
                          {String(k["nome"] ?? "")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={destEtapa} onValueChange={setDestEtapa} disabled={!destKanban}>
                    <SelectTrigger>
                      <SelectValue placeholder="Etapa de destino" />
                    </SelectTrigger>
                    <SelectContent>
                      {etapasDest.map((e) => (
                        <SelectItem key={String(e["id"])} value={String(e["id"])}>
                          {String(e["descricao"] ?? "")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {outrosKanbans.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Não há outro quadro. Crie um antes de excluir este.
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setTransfer(false)}>
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={!destEtapa || delKanban.isPending}
                    onClick={() => delKanban.mutate()}
                  >
                    Transferir e excluir
                  </Button>
                </div>
              </div>
            )}

          </TabsContent>

          <TabsContent value="etapas" className="m-0 min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-6 sm:px-6">
            <div className="space-y-3">
              {etapas.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma etapa cadastrada.</p>
              )}
              {etapas.map((e, i) => {
                const id = String(e["id"]);
                const ativo = String(e["status"] ?? "true") !== "false";
                return (
                  <div
                    key={id}
                    className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-md border border-border p-4"
                  >
                    <div className="flex flex-col">
                      <Button
                        variant="ghost" size="icon"
                        type="button"
                        aria-label="Subir"
                        disabled={i === 0 || mover.isPending}
                        onClick={() => mover.mutate({ from: i, to: i - 1 })}
                        className="h-7 w-7 text-muted-foreground disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        type="button"
                        aria-label="Descer"
                        disabled={i === etapas.length - 1 || mover.isPending}
                        onClick={() => mover.mutate({ from: i, to: i + 1 })}
                        className="h-7 w-7 text-muted-foreground disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {editId === id ? (
                      <div className="min-w-0 space-y-4">
                        <Input
                          className="w-full min-w-0" aria-label="Nome da etapa"
                          value={editDesc}
                          autoFocus
                          onChange={(ev) => setEditDesc(ev.target.value)}
                        />
                        <EtapaCorPicker value={editCor} onChange={setEditCor} />
                        <label className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
                          <span>Etapa padrão da IA</span><Switch checked={editIA} onCheckedChange={setEditIA} />
                        </label>
                        <label className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
                          <span>Etapa padrão da equipe</span><Switch checked={editHum} onCheckedChange={setEditHum} />
                        </label>
                        <label className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
                          <span>Exigir checklist para entrar</span><Switch checked={editCk} onCheckedChange={setEditCk} />
                        </label>
                        {editCk && (
                          <Select value={editTpl} onValueChange={setEditTpl}>
                            <SelectTrigger className="w-full"><SelectValue placeholder={templates.length ? "Escolha o checklist" : "Crie na aba Checklists"} /></SelectTrigger>
                            <SelectContent>
                              {[...templates].sort((a, b) => String(a["nome"] ?? "").localeCompare(String(b["nome"] ?? ""), "pt-BR")).map((t) => <SelectItem key={String(t["id"])} value={String(t["id"])}>{String(t["nome"] ?? "")}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                        <label className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
                          <span>Exigir checklist para sair</span><Switch checked={editCkS} onCheckedChange={setEditCkS} />
                        </label>
                        {editCkS && (
                          <Select value={editTplS} onValueChange={setEditTplS}>
                            <SelectTrigger className="w-full"><SelectValue placeholder={templates.length ? "Escolha o checklist" : "Crie na aba Checklists"} /></SelectTrigger>
                            <SelectContent>
                              {[...templates].sort((a, b) => String(a["nome"] ?? "").localeCompare(String(b["nome"] ?? ""), "pt-BR")).map((t) => <SelectItem key={String(t["id"])} value={String(t["id"])}>{String(t["nome"] ?? "")}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                        <label className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
                          <span>Venda ganha / fechamento<span className="block text-xs text-muted-foreground">Entra na DRE do Board e no faturamento</span></span>
                          <Switch checked={editGanha} onCheckedChange={(v) => { setEditGanha(v); if (v) setEditEnc(false); }} />
                        </label>
                        <label className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
                          <span>Etapa de Encerramento / Desistência<span className="block text-xs text-muted-foreground">O cliente desistiu ou a negociação foi encerrada sem contratação. Não entra na DRE nem no faturamento; usada pelo botão Encerrar do chat.</span></span>
                          <Switch checked={editEnc} onCheckedChange={(v) => { setEditEnc(v); if (v) setEditGanha(false); }} />
                        </label>
                        <div className="space-y-2 rounded-md border p-3">
                          <span className="block text-sm">Ao entrar nesta etapa, criar card em outro quadro<span className="block text-xs text-muted-foreground">Ex.: Comercial → Implantação. Leva contato e responsável.</span></span>
                          <Select value={editDestK || "nenhum"} onValueChange={(v) => { setEditDestK(v === "nenhum" ? "" : v); setEditDestE(""); }}>
                            <SelectTrigger className="w-full"><SelectValue placeholder="Quadro de destino" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="nenhum">Não criar</SelectItem>
                              {kanbans.filter((k) => String(k["id"]) !== kanbanId).map((k) => <SelectItem key={String(k["id"])} value={String(k["id"])}>{String(k["nome"] ?? k["descricao"] ?? "")}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {editDestK && (
                            <Select value={editDestE} onValueChange={setEditDestE}>
                              <SelectTrigger className="w-full"><SelectValue placeholder="Etapa inicial no destino" /></SelectTrigger>
                              <SelectContent>
                                {todasEtapas.filter((x) => String(x["kanban_nome_id"] ?? "") === editDestK).sort((a, b) => Number(a["ordem"] ?? 0) - Number(b["ordem"] ?? 0)).map((x) => <SelectItem key={String(x["id"])} value={String(x["id"])}>{String(x["descricao"] ?? "")}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Salvar etapa"
                          disabled={updEtapa.isPending || !editDesc.trim() || (editCk && !editTpl) || (editCkS && !editTplS) || (!!editDestK && !editDestE)}
                          onClick={() =>
                            updEtapa.mutate({ id, patch: {
                              descricao: editDesc.trim(), cor: editCor, is_default_ia: editIA, is_default_humano: editHum,
                              exige_checklist: editCk, checklist_template_id: editCk ? editTpl : null,
                              ...(editCkS || "exige_checklist_saida" in e ? { exige_checklist_saida: editCkS, checklist_saida_template_id: editCkS ? editTplS : null } : {}), etapa_ganha: editGanha, is_default_encerrado: editEnc,
                              acao_kanban_destino_id: editDestK || null, acao_etapa_destino_id: editDestK ? editDestE : null,
                            } })
                          }
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Cancelar"
                          onClick={() => setEditId(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="min-w-0 space-y-3">
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                          <span className={cn("h-3 w-3 shrink-0 rounded-full", corEtapa(e["cor"]).className)} />
                          <span className="break-words">
                          {String(e["descricao"] ?? "")}
                          </span>
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                        <Switch
                          checked={ativo}
                          aria-label="Status"
                          onCheckedChange={(v) => updEtapa.mutate({ id, patch: { status: v } })}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Editar etapa"
                          onClick={() => {
                            setEditId(id);
                            setEditDesc(String(e["descricao"] ?? ""));
                            setEditCor(corEtapa(e["cor"]).value);
                            setEditIA(e["is_default_ia"] === true);
                            setEditHum(e["is_default_humano"] === true);
                            setEditCk([true, 1, "true", "t"].includes(e["exige_checklist"] as never));
                            setEditTpl(String(e["checklist_template_id"] ?? ""));
                            setEditCkS([true, 1, "true", "t"].includes(e["exige_checklist_saida"] as never));
                            setEditTplS(String(e["checklist_saida_template_id"] ?? ""));
                            setEditGanha([true, 1, "true", "t"].includes(e["etapa_ganha"] as never));
                            setEditEnc(e["is_default_encerrado"] === true);
                            setEditDestK(String(e["acao_kanban_destino_id"] ?? ""));
                            setEditDestE(String(e["acao_etapa_destino_id"] ?? ""));
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {canDelete && <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Excluir etapa"
                          disabled={etapasComCards.has(id)}
                          title={
                            etapasComCards.has(id) ? "Há cards vinculados a esta etapa" : "Excluir"
                          }
                          onClick={async () => await confirmar("Excluir esta etapa?") && delEtapa.mutate(id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>}
                        </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                        {e["is_default_ia"] === true && <Badge variant="secondary" className="gap-1 text-[10px]"><Bot className="h-3 w-3" /> Padrão IA</Badge>}
                        {e["is_default_humano"] === true && <Badge variant="secondary" className="gap-1 text-[10px]"><Users className="h-3 w-3" /> Padrão Equipe</Badge>}
                        {e["is_default_encerrado"] === true && <Badge variant="secondary" className="gap-1 text-[10px]"><Check className="h-3 w-3" /> Encerramento</Badge>}
                        {[true, 1, "true", "t"].includes(e["exige_checklist"] as never) && <Badge variant="secondary" className="gap-1 text-[10px]"><ClipboardCheck className="h-3 w-3" /> Checklist entrada</Badge>}
                        {[true, 1, "true", "t"].includes(e["exige_checklist_saida"] as never) && <Badge variant="secondary" className="gap-1 text-[10px]"><ClipboardCheck className="h-3 w-3" /> Checklist saída</Badge>}
                        {!!e["acao_kanban_destino_id"] && <Badge variant="secondary" className="text-[10px]">→ {String(kanbans.find((k) => String(k["id"]) === String(e["acao_kanban_destino_id"]))?.["nome"] ?? "Outro quadro")}</Badge>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="space-y-3 border-t pt-4">
              <Label htmlFor="kb-nova-etapa">Nova etapa</Label>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Input id="kb-nova-etapa"
                placeholder="Nova etapa (ex.: Em análise)"
                value={novaEtapa}
                onChange={(e) => setNovaEtapa(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && novaEtapa.trim() && addEtapa.mutate()}
              />
              <Button
                disabled={!novaEtapa.trim() || addEtapa.isPending}
                onClick={() => addEtapa.mutate()}
              >
                <Plus className="mr-1 h-4 w-4" /> Adicionar
              </Button>
              </div>
              <EtapaCorPicker value={novaCor} onChange={setNovaCor} />
            </div>
          </TabsContent>

          <TabsContent value="perfis" className="m-0 min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            {kanbanId && <KanbanPerfisAcesso kanbanId={kanbanId} empresaId={empresaId} />}
          </TabsContent>

          <TabsContent value="checklists" className="m-0 min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            <ChecklistTemplates empresaId={empresaId} />
          </TabsContent>

          <TabsContent value="integracao" className="m-0 min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6">
            <div>
              <Label className="mb-1.5 block">Função</Label>
              <Select
                value={funcaoId}
                onValueChange={(v) => {
                  setFuncaoId(v);
                  setSel([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a função" />
                </SelectTrigger>
                <SelectContent>
                  {funcoes.map((f) => (
                    <SelectItem key={funcaoKey(f)} value={funcaoKey(f)}>
                      {String(pick(f, ["descricao", "nome"], "") ?? "")} ({String(f["tabela_base"])}
                      )
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {funcoes.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Nenhuma função com tabela base preenchida.
                </p>
              )}
            </div>
            {tabelaBase && (
              <div>
                <Label className="mb-2 block">Campos exibidos no card</Label>
                {loadingCols && (
                  <p className="text-sm text-muted-foreground">Carregando colunas…</p>
                )}
                {erroCols && (
                  <p className="text-sm text-destructive">
                    Não foi possível ler as colunas de {tabelaBase}.
                  </p>
                )}
                <div className="grid max-h-[40vh] gap-3 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-2">
                  {colunas.map((c) => (
                    <label key={c.key} className="flex items-center gap-3 text-sm">
                      <Checkbox
                        checked={selKeys.has(c.key)}
                        onCheckedChange={(v) => toggle(c, !!v)}
                      />
                      {labelAmigavel(c.key)}
                    </label>
                  ))}
                </div>
              </div>
            )}

          </TabsContent>
        </Tabs>
        <SheetFooter className="shrink-0 border-t bg-background p-4 sm:items-center">
          {tab === "dados" && canDelete && kanbanId && <Button variant="destructive" className="sm:mr-auto" disabled={delKanban.isPending || transfer} onClick={() => void pedirExclusao()}><Trash2 className="mr-1 h-4 w-4" />Excluir quadro</Button>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tab === "dados" || tab === "integracao" ? "Cancelar" : "Fechar"}</Button>
          {tab === "dados" && <Button disabled={!form.nome.trim() || saveDados.isPending} onClick={() => saveDados.mutate()}>Salvar</Button>}
          {tab === "integracao" && <Button disabled={!funcaoId || saveIntegracao.isPending} onClick={() => saveIntegracao.mutate()}>Salvar</Button>}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
