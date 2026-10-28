import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocumentoEditor, StatusDocBadge, useModelos, VencimentoInfo, type DocumentoRow } from "@/components/documentos/DocumentosPainel";
import { ContratoOfertaModelos } from "@/components/documentos/ContratoOfertaModelos";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useAudit } from "@/lib/audit";
import { ENTIDADES, entidadeLabel, MODELOS_PADRAO, STATUS_DOC, VARIAVEIS, type EntidadeDoc } from "@/lib/documentos";
import { formatDate } from "@/lib/orcamentos";
import { normalizeSearch } from "@/lib/documentos-busca";
import type { Row } from "@/lib/row";
import { confirmar } from "@/components/layout/DialogoGlobal";

const db = supabase as any;

export const Route = createFileRoute("/_authenticated/documentos")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Documentos — Atende.ai" },
      { name: "description", content: "Contratos e termos de responsabilidade por usuário, cliente, empresa e veículo." },
      { property: "og:title", content: "Documentos — Atende.ai" },
      { property: "og:description", content: "Contratos e termos de responsabilidade por usuário, cliente, empresa e veículo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DocumentosPage,
});

function DocumentosPage() {
  const perms = usePagePermissions("/documentos");
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <FileText className="text-primary size-6" />
        <h1 className="text-2xl font-semibold">Documentos</h1>
      </div>
      <Tabs defaultValue="docs">
        <TabsList>
          <TabsTrigger value="docs">Documentos emitidos</TabsTrigger>
          <TabsTrigger value="modelos">Modelos</TabsTrigger>
          <TabsTrigger value="contrato-oferta">Contrato da Oferta</TabsTrigger>
        </TabsList>
        <TabsContent value="docs"><Emitidos canEdit={perms.canUpdate} /></TabsContent>
        <TabsContent value="contrato-oferta"><ContratoOfertaModelos canEdit={perms.canUpdate} /></TabsContent>
        <TabsContent value="modelos"><Modelos canCreate={perms.canCreate} canEdit={perms.canUpdate} canDelete={perms.canDelete} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Emitidos({ canEdit }: { canEdit: boolean }) {
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [edit, setEdit] = useState<DocumentoRow | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["documentos", "todos"],
    queryFn: async () => {
      const { data, error } = await db.from("documentos").select("*").order("dt_emissao", { ascending: false }).limit(1000);
      if (error) throw error;
      return (data ?? []) as DocumentoRow[];
    },
  });
  const lista = useMemo(() => {
    const q = normalizeSearch(busca);
    return data.filter((d) =>
      (tipo === "todos" || d.entidade_tipo === tipo) &&
      (status === "todos" || (status === "vencendo" ? !!d.dt_vencimento && d.status !== "cancelado" && (new Date(d.dt_vencimento).getTime() - Date.now()) / 864e5 <= 30 : d.status === status)) &&
      (!q || normalizeSearch(`${d.titulo} ${d.entidade_nome ?? ""}`).includes(q)));
  }, [data, busca, tipo, status]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Pesquisar por título ou nome…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-sm" />
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os cadastros</SelectItem>
            {ENTIDADES.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as situações</SelectItem>
            <SelectItem value="vencendo">Vencendo em 30 dias / vencidos</SelectItem>
            {STATUS_DOC.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <p className="text-muted-foreground text-xs">Para emitir, abra o cadastro (Usuários, Parceiros, Empresas ou Veículos) e clique em "Documentos".</p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Documento</TableHead>
              <TableHead>Para</TableHead>
              <TableHead>Emissão</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : !lista.length ? (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground">Nenhum documento.</TableCell></TableRow>
            ) : lista.map((d) => (
              <TableRow key={d.id} className="cursor-pointer" onClick={() => setEdit(d)}>
                <TableCell className="font-medium">{d.titulo}</TableCell>
                <TableCell>{d.entidade_nome}<div className="text-muted-foreground text-xs">{entidadeLabel(d.entidade_tipo)}</div></TableCell>
                <TableCell>{formatDate(d.dt_emissao)}</TableCell>
                <TableCell><VencimentoInfo data={d.dt_vencimento} /></TableCell>
                <TableCell><StatusDocBadge status={d.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <DocumentoEditor open={edit !== null} onOpenChange={(o) => !o && setEdit(null)} doc={edit} canEdit={canEdit} />
    </div>
  );
}

type ModeloForm = { id?: string; titulo: string; categoria: string; entidade_tipo: EntidadeDoc; conteudo: string; validade_dias: string; status: boolean };
const VAZIO: ModeloForm = { titulo: "", categoria: "", entidade_tipo: "usuario", conteudo: "", validade_dias: "", status: true };

function Modelos({ canCreate, canEdit, canDelete }: { canCreate: boolean; canEdit: boolean; canDelete: boolean }) {
  const qc = useQueryClient();
  const { stamp } = useAudit();
  const { data: modelos = [], isLoading } = useModelos();
  const [f, setF] = useState<ModeloForm | null>(null);
  const [busy, setBusy] = useState(false);

  async function instalarPadrao() {
    const existentes = new Set(modelos.map((m) => String(m["titulo"]).toLowerCase()));
    const novos = MODELOS_PADRAO.filter((m) => !existentes.has(m.titulo.toLowerCase()));
    if (!novos.length) return void toast.info("Os modelos padrão já estão instalados.");
    setBusy(true);
    const { error } = await db.from("documento_modelos").insert(novos.map((m) => stamp({ ...m, status: true } as Row, true)));
    setBusy(false);
    if (error) return void toast.error("Não foi possível instalar", { description: error.message });
    toast.success(`${novos.length} modelo(s) instalado(s).`);
    qc.invalidateQueries({ queryKey: ["documento_modelos"] });
  }

  async function salvar() {
    if (!f) return;
    if (!f.titulo.trim()) return void toast.error("Informe o título.");
    setBusy(true);
    const payload: Row = {
      titulo: f.titulo.trim(),
      categoria: f.categoria.trim() || null,
      entidade_tipo: f.entidade_tipo,
      conteudo: f.conteudo,
      validade_dias: f.validade_dias ? Number(f.validade_dias) : null,
      status: f.status,
    };
    const { error } = f.id
      ? await db.from("documento_modelos").update(stamp(payload, false)).eq("id", f.id)
      : await db.from("documento_modelos").insert(stamp(payload, true));
    setBusy(false);
    if (error) return void toast.error(error.code === "23505" ? "Já existe um modelo com esse título." : "Não foi possível salvar", { description: error.message });
    qc.invalidateQueries({ queryKey: ["documento_modelos"] });
    setF(null);
  }

  async function excluir(m: Row) {
    if (!await confirmar(`Excluir o modelo "${m["titulo"]}"? Documentos já emitidos continuam.`)) return;
    const { error } = await db.from("documento_modelos").delete().eq("id", m["id"]);
    if (error) return void toast.error("Não foi possível excluir", { description: error.message });
    qc.invalidateQueries({ queryKey: ["documento_modelos"] });
  }

  const vars = f ? [...VARIAVEIS[f.entidade_tipo], ...VARIAVEIS.geral] : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canCreate && <Button onClick={() => setF({ ...VAZIO })} className="gap-1"><Plus className="size-4" /> Novo modelo</Button>}
        {canCreate && <Button variant="outline" onClick={instalarPadrao} disabled={busy} className="gap-1"><Download className="size-4" /> Instalar modelos padrão</Button>}
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Modelo</TableHead>
              <TableHead>Para</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : !modelos.length ? (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground">Nenhum modelo. Clique em "Instalar modelos padrão".</TableCell></TableRow>
            ) : modelos.map((m) => (
              <TableRow key={String(m["id"])}>
                <TableCell className="font-medium">{String(m["titulo"])}<div className="text-muted-foreground text-xs">{String(m["categoria"] ?? "")}</div></TableCell>
                <TableCell>{entidadeLabel(m["entidade_tipo"])}</TableCell>
                <TableCell>{m["validade_dias"] ? `${m["validade_dias"]} dias` : "—"}</TableCell>
                <TableCell>{m["status"] === false ? "Não" : "Sim"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {canEdit && (
                    <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setF({
                      id: String(m["id"]), titulo: String(m["titulo"] ?? ""), categoria: String(m["categoria"] ?? ""),
                      entidade_tipo: m["entidade_tipo"] as EntidadeDoc, conteudo: String(m["conteudo"] ?? ""),
                      validade_dias: m["validade_dias"] ? String(m["validade_dias"]) : "", status: m["status"] !== false,
                    })}><Pencil className="size-4" /></Button>
                  )}
                  {canDelete && <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => excluir(m)}><Trash2 className="size-4" /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={f !== null} onOpenChange={(o) => !o && setF(null)}>
        <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-4"><DialogTitle>{f?.id ? "Editar modelo" : "Novo modelo"}</DialogTitle></DialogHeader>
          {f && (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2"><Label>Título</Label><Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Categoria</Label><Input value={f.categoria} placeholder="Contrato, Termo…" onChange={(e) => setF({ ...f, categoria: e.target.value })} /></div>
                <div className="space-y-1.5">
                  <Label>Usado em</Label>
                  <Select value={f.entidade_tipo} onValueChange={(v) => setF({ ...f, entidade_tipo: v as EntidadeDoc })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ENTIDADES.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Validade (dias)</Label><Input type="number" min={0} value={f.validade_dias} placeholder="Sem vencimento" onChange={(e) => setF({ ...f, validade_dias: e.target.value })} /></div>
                <div className="flex items-center gap-2 pt-6"><Switch checked={f.status} onCheckedChange={(c) => setF({ ...f, status: c })} /><Label>Ativo</Label></div>
              </div>
              <div className="space-y-1.5">
                <Label>Texto</Label>
                <Textarea rows={16} className="font-serif text-sm" value={f.conteudo} onChange={(e) => setF({ ...f, conteudo: e.target.value })} />
                <div className="flex flex-wrap gap-1">
                  {vars.map((k) => (
                    <button key={k} type="button" className="bg-muted hover:bg-accent rounded px-1.5 py-0.5 font-mono text-xs"
                      onClick={() => setF({ ...f, conteudo: `${f.conteudo}{{${k}}}` })}>{`{{${k}}}`}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="shrink-0 border-t px-6 py-4">
            <Button variant="outline" onClick={() => setF(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={busy}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
