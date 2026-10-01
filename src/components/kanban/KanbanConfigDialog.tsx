import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { pick, type Row } from "@/lib/row";
import { labelAmigavel, parseCamposCardTipado, type CampoCardTipado } from "@/lib/orcamento-kanban";

const errMsg = (e: unknown, f: string) => (e instanceof Error ? e.message : f);
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
};

export function KanbanConfigDialog({
  open,
  onOpenChange,
  kanban,
  etapas,
  etapasComCards,
  empresaId,
  onCreated,
}: Props) {
  const qc = useQueryClient();
  const kanbanId = kanban ? String(kanban["id"]) : "";
  const [tab, setTab] = useState("dados");
  const [form, setForm] = useState({ nome: "", descricao: "", status: true });
  const [novaEtapa, setNovaEtapa] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [funcaoId, setFuncaoId] = useState("");
  const [sel, setSel] = useState<CampoCardTipado[]>([]);

  useEffect(() => {
    if (!open) return;
    setTab("dados");
    setForm({
      nome: String(kanban?.["nome"] ?? ""),
      descricao: String(kanban?.["descricao"] ?? ""),
      status: kanban ? String(kanban["status"] ?? "true") !== "false" : true,
    });
    setEditId(null);
    setNovaEtapa("");
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
        kanban_nome_id: kanbanId,
        ordem: etapas.length + 1,
        status: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setNovaEtapa("");
    },
    onError: (e) => toast.error(errMsg(e, "Não foi possível criar.")),
  });

  const updEtapa = useMutation({
    mutationFn: async (v: { id: string; patch: Row }) => {
      const { error } = await supabase.from("kanban_etapas").update(v.patch).eq("id", v.id);
      if (error) throw error;
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
          .eq("id", list[i]!["id"] as string);
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
      const t = supabase.from("funcoes_kanban" as never);
      const { error } = vinculo
        ? await (vinculo["id"] !== undefined
            ? t.update(payload as never).eq("id", vinculo["id"] as never)
            : t.update(payload as never).eq("kanban_nome_id", kanbanId as never))
        : await t.insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Integração salva.");
    },
    onError: (e) => toast.error(errMsg(e, "Não foi possível salvar.")),
  });

  const toggle = (c: { key: string; tipo: string }, on: boolean) =>
    setSel((s) =>
      on
        ? [...s, { key: c.key, label: labelAmigavel(c.key), tipo: c.tipo || "text" }]
        : s.filter((x) => x.key !== c.key),
    );

  const selKeys = useMemo(() => new Set(sel.map((s) => s.key)), [sel]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{kanban ? "Configurar quadro" : "Novo quadro"}</DialogTitle>
          <DialogDescription>Dados, etapas e integração do quadro Kanban.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dados">Dados do Quadro</TabsTrigger>
            <TabsTrigger value="etapas" disabled={!kanbanId}>
              Etapas
            </TabsTrigger>
            <TabsTrigger value="integracao" disabled={!kanbanId}>
              Integração e Cards
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-4 pt-4">
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
            <DialogFooter className="border-t pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                disabled={!form.nome.trim() || saveDados.isPending}
                onClick={() => saveDados.mutate()}
              >
                Salvar
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="etapas" className="space-y-3 pt-4">
            <div className="max-h-[45vh] space-y-2 overflow-y-auto">
              {etapas.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma etapa cadastrada.</p>
              )}
              {etapas.map((e, i) => {
                const id = String(e["id"]);
                const ativo = String(e["status"] ?? "true") !== "false";
                return (
                  <div
                    key={id}
                    className="flex items-center gap-2 rounded-md border border-border p-2"
                  >
                    <div className="flex flex-col">
                      <button
                        type="button"
                        aria-label="Subir"
                        disabled={i === 0 || mover.isPending}
                        onClick={() => mover.mutate({ from: i, to: i - 1 })}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Descer"
                        disabled={i === etapas.length - 1 || mover.isPending}
                        onClick={() => mover.mutate({ from: i, to: i + 1 })}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {editId === id ? (
                      <>
                        <Input
                          className="h-8 flex-1"
                          value={editDesc}
                          autoFocus
                          onChange={(ev) => setEditDesc(ev.target.value)}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Salvar etapa"
                          disabled={!editDesc.trim()}
                          onClick={() =>
                            updEtapa.mutate({ id, patch: { descricao: editDesc.trim() } })
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
                      </>
                    ) : (
                      <>
                        <span className="flex-1 truncate text-sm">
                          {String(e["descricao"] ?? "")}
                        </span>
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
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Excluir etapa"
                          disabled={etapasComCards.has(id)}
                          title={
                            etapasComCards.has(id) ? "Há cards vinculados a esta etapa" : "Excluir"
                          }
                          onClick={() => confirm("Excluir esta etapa?") && delEtapa.mutate(id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Input
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
          </TabsContent>

          <TabsContent value="integracao" className="space-y-4 pt-4">
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
            <DialogFooter className="border-t pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                disabled={!funcaoId || saveIntegracao.isPending}
                onClick={() => saveIntegracao.mutate()}
              >
                Salvar
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
