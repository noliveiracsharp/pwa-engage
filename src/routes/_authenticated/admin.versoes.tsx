import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  type Atualizacao, type Sugestao, type TipoIncremento, type Versao,
  STATUS_SUGESTAO, TIPO_CLASS, TIPO_LABEL, fmtData, fmtVersao, proximaVersao,
} from "@/lib/versoes";

const db = supabase as any;

export const Route = createFileRoute("/_authenticated/admin/versoes")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Versões e Novidades — Atende.ai" },
      { name: "description", content: "Gestão de versões, notas de atualização e sugestões dos usuários." },
      { property: "og:title", content: "Versões e Novidades — Atende.ai" },
      { property: "og:description", content: "Gestão de versões, notas de atualização e sugestões dos usuários." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VersoesPage,
});

function VersoesPage() {
  const { isMaster, loading } = useAuth() as any;
  if (loading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (!isMaster)
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground">Somente o perfil Master pode gerenciar versões.</p>
        <Button asChild className="mt-4" variant="outline"><Link to="/dashboard">Voltar</Link></Button>
      </div>
    );
  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-bold">Versões e Novidades</h1>
      <Tabs defaultValue="versoes">
        <TabsList>
          <TabsTrigger value="versoes">Versões</TabsTrigger>
          <TabsTrigger value="itens">Novidades</TabsTrigger>
          <TabsTrigger value="sugestoes">Sugestões</TabsTrigger>
        </TabsList>
        <TabsContent value="versoes"><VersoesTab /></TabsContent>
        <TabsContent value="itens"><ItensTab /></TabsContent>
        <TabsContent value="sugestoes"><SugestoesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function useVersoes() {
  return useQuery({
    queryKey: ["sistema_versoes", "todas"],
    queryFn: async () => {
      const { data, error } = await db.from("sistema_versoes").select("*")
        .order("major", { ascending: false }).order("minor", { ascending: false }).order("patch", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Versao[];
    },
  });
}

function VersoesTab() {
  const qc = useQueryClient();
  const { data: versoes = [] } = useVersoes();
  const [form, setForm] = useState<{ tipo: TipoIncremento; descricao: string; data: string; atual: boolean } | null>(null);
  const ultima = versoes[0] ?? null;
  const previa = form ? proximaVersao(ultima, form.tipo) : null;

  const refresh = () => qc.invalidateQueries({ queryKey: ["sistema_versoes"] });

  const salvar = async () => {
    if (!form || !previa) return;
    if (form.atual) await db.from("sistema_versoes").update({ is_atual: false }).eq("is_atual", true);
    const { error } = await db.from("sistema_versoes").insert({
      ...previa, versao: fmtVersao(previa), descricao: form.descricao || null,
      data_lancamento: form.data, is_atual: form.atual,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`Versão ${fmtVersao(previa)} criada`);
    setForm(null);
    refresh();
  };

  const tornarAtual = async (v: Versao) => {
    await db.from("sistema_versoes").update({ is_atual: false }).eq("is_atual", true);
    const { error } = await db.from("sistema_versoes").update({ is_atual: true }).eq("id", v.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${v.versao} agora é a versão atual`);
    refresh();
  };

  const excluir = async (v: Versao) => {
    if (!confirm(`Excluir a versão ${v.versao}?`)) return;
    const { error } = await db.from("sistema_versoes").delete().eq("id", v.id);
    if (error) { toast.error(error.message); return; }
    refresh();
  };

  const novo = (tipo: TipoIncremento) => setForm({ tipo, descricao: "", data: new Date().toISOString().slice(0, 10), atual: true });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => novo("major")}><Plus className="mr-1 h-4 w-4" />Nova tecnologia (+Major)</Button>
        <Button variant="outline" onClick={() => novo("minor")}><Plus className="mr-1 h-4 w-4" />Nova funcionalidade (+Minor)</Button>
        <Button variant="outline" onClick={() => novo("patch")}><Plus className="mr-1 h-4 w-4" />Correção (+Patch)</Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader><TableRow><TableHead>Versão</TableHead><TableHead>Descrição</TableHead><TableHead>Lançamento</TableHead><TableHead>Situação</TableHead><TableHead className="w-40" /></TableRow></TableHeader>
          <TableBody>
            {versoes.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma versão cadastrada.</TableCell></TableRow>}
            {versoes.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-mono font-semibold">{v.versao}</TableCell>
                <TableCell>{v.descricao}</TableCell>
                <TableCell>{fmtData(v.data_lancamento)}</TableCell>
                <TableCell>{v.is_atual ? <Badge className="bg-success text-success-foreground">Atual</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-right">
                  {!v.is_atual && <Button size="sm" variant="ghost" onClick={() => tornarAtual(v)}>Tornar atual</Button>}
                  <Button size="icon" variant="ghost" onClick={() => excluir(v)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova versão {previa && fmtVersao(previa)}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Versão anterior: {ultima?.versao ?? "nenhuma"}</p>
              <div><Label>Descrição</Label><Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
              <div><Label>Data de lançamento</Label><Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></div>
              <div className="flex items-center gap-2"><Switch checked={form.atual} onCheckedChange={(c) => setForm({ ...form, atual: c })} /><Label>Definir como versão atual</Label></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={salvar}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ItemForm = Partial<Atualizacao>;

function ItensTab() {
  const qc = useQueryClient();
  const { data: versoes = [] } = useVersoes();
  const { data: itens = [] } = useQuery({
    queryKey: ["sistema_atualizacoes", "todas"],
    queryFn: async () => {
      const { data, error } = await db.from("sistema_atualizacoes").select("*").order("data_publicacao", { ascending: false }).order("ordem");
      if (error) throw error;
      return (data ?? []) as Atualizacao[];
    },
  });
  const [form, setForm] = useState<ItemForm | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["sistema_atualizacoes"] });

  const salvar = async () => {
    if (!form?.titulo?.trim() || !form.descricao?.trim()) { toast.error("Informe título e descrição"); return; }
    const payload = {
      titulo: form.titulo, descricao: form.descricao, tipo: form.tipo ?? "novo_recurso",
      categoria: form.categoria ?? "ultimas", versao_id: form.versao_id || null,
      data_publicacao: form.data_publicacao || null, ordem: Number(form.ordem ?? 0), ativo: form.ativo ?? true,
    };
    const { error } = form.id
      ? await db.from("sistema_atualizacoes").update(payload).eq("id", form.id)
      : await db.from("sistema_atualizacoes").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Novidade salva");
    setForm(null);
    refresh();
  };

  const excluir = async (a: Atualizacao) => {
    if (!confirm(`Excluir "${a.titulo}"?`)) return;
    const { error } = await db.from("sistema_atualizacoes").delete().eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    refresh();
  };

  const versaoNome = (id: string | null) => versoes.find((v) => v.id === id)?.versao ?? "—";

  return (
    <div className="space-y-4">
      <Button onClick={() => setForm({ tipo: "novo_recurso", categoria: "ultimas", ativo: true, ordem: 0, data_publicacao: new Date().toISOString().slice(0, 10), versao_id: versoes.find((v) => v.is_atual)?.id ?? null })}>
        <Plus className="mr-1 h-4 w-4" />Nova novidade
      </Button>
      <div className="rounded-md border">
        <Table>
          <TableHeader><TableRow><TableHead>Título</TableHead><TableHead>Tipo</TableHead><TableHead>Coluna</TableHead><TableHead>Versão</TableHead><TableHead>Data</TableHead><TableHead>Ativo</TableHead><TableHead className="w-24" /></TableRow></TableHeader>
          <TableBody>
            {itens.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhuma novidade cadastrada.</TableCell></TableRow>}
            {itens.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.titulo}</TableCell>
                <TableCell><span className={cn("rounded px-2 py-0.5 text-[10px] font-semibold uppercase", TIPO_CLASS[a.tipo])}>{TIPO_LABEL[a.tipo]}</span></TableCell>
                <TableCell>{a.categoria === "ultimas" ? "Últimas" : "Futuras"}</TableCell>
                <TableCell className="font-mono">{versaoNome(a.versao_id)}</TableCell>
                <TableCell>{fmtData(a.data_publicacao)}</TableCell>
                <TableCell>{a.ativo ? "Sim" : "Não"}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => setForm(a)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => excluir(a)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{form?.id ? "Editar novidade" : "Nova novidade"}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div><Label>Título</Label><Input value={form.titulo ?? ""} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></div>
              <div><Label>Descrição</Label><Textarea rows={4} value={form.descricao ?? ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Tipo</Label>
                  <Select value={form.tipo ?? "novo_recurso"} onValueChange={(v) => setForm({ ...form, tipo: v as Atualizacao["tipo"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(TIPO_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Coluna</Label>
                  <Select value={form.categoria ?? "ultimas"} onValueChange={(v) => setForm({ ...form, categoria: v as Atualizacao["categoria"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="ultimas">Últimas atualizações</SelectItem><SelectItem value="futuras">Futuras atualizações</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>Versão</Label>
                  <Select value={form.versao_id ?? "none"} onValueChange={(v) => setForm({ ...form, versao_id: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">Sem versão</SelectItem>{versoes.map((v) => <SelectItem key={v.id} value={v.id}>{v.versao}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Data</Label><Input type="date" value={form.data_publicacao ?? ""} onChange={(e) => setForm({ ...form, data_publicacao: e.target.value })} /></div>
                <div><Label>Ordem</Label><Input type="number" value={form.ordem ?? 0} onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) })} /></div>
                <div className="flex items-end gap-2 pb-2"><Switch checked={form.ativo ?? true} onCheckedChange={(c) => setForm({ ...form, ativo: c })} /><Label>Ativo</Label></div>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={salvar}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SugestoesTab() {
  const qc = useQueryClient();
  const { data: sugestoes = [] } = useQuery({
    queryKey: ["sistema_sugestoes", "todas"],
    queryFn: async () => {
      const { data, error } = await db.from("sistema_sugestoes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Sugestao[];
    },
  });
  const { data: nomes = {} } = useQuery({
    queryKey: ["sistema_sugestoes", "nomes", sugestoes.map((s) => s.id).join()],
    enabled: sugestoes.length > 0,
    queryFn: async () => {
      const uids = [...new Set(sugestoes.map((s) => s.usuario_id).filter(Boolean))];
      const eids = [...new Set(sugestoes.map((s) => s.empresa_id).filter(Boolean))];
      const [u, e] = await Promise.all([
        uids.length ? db.from("usuarios").select("id,nome").in("id", uids) : { data: [] },
        eids.length ? db.from("empresas").select("id,nome").in("id", eids) : { data: [] },
      ]);
      const map: Record<string, string> = {};
      for (const r of [...(u.data ?? []), ...(e.data ?? [])]) map[r.id] = r.nome;
      return map;
    },
  });
  const [edit, setEdit] = useState<Sugestao | null>(null);

  const salvar = async () => {
    if (!edit) return;
    const { error } = await db.from("sistema_sugestoes").update({ status: edit.status, resposta_admin: edit.resposta_admin || null }).eq("id", edit.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Sugestão atualizada");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["sistema_sugestoes"] });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Usuário</TableHead><TableHead>Empresa</TableHead><TableHead>Sugestão</TableHead><TableHead>Status</TableHead><TableHead className="w-16" /></TableRow></TableHeader>
          <TableBody>
            {sugestoes.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhuma sugestão recebida.</TableCell></TableRow>}
            {sugestoes.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="whitespace-nowrap">{new Date(s.created_at).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell>{(s.usuario_id && nomes[s.usuario_id]) || "—"}</TableCell>
                <TableCell>{(s.empresa_id && nomes[s.empresa_id]) || "—"}</TableCell>
                <TableCell className="max-w-md whitespace-pre-line">{s.sugestao}</TableCell>
                <TableCell><Badge variant="secondary">{STATUS_SUGESTAO[s.status] ?? s.status}</Badge></TableCell>
                <TableCell><Button size="icon" variant="ghost" onClick={() => setEdit(s)}><Pencil className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Responder sugestão</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <p className="rounded-md bg-muted p-3 text-sm whitespace-pre-line">{edit.sugestao}</p>
              <div><Label>Status</Label>
                <Select value={edit.status} onValueChange={(v) => setEdit({ ...edit, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STATUS_SUGESTAO).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Resposta</Label><Textarea value={edit.resposta_admin ?? ""} onChange={(e) => setEdit({ ...edit, resposta_admin: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button><Button onClick={salvar}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
