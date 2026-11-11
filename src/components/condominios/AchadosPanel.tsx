import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, Hand, PackageSearch, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { UploadInfo } from "@/components/ui/upload-info";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { comprimirImagem } from "@/lib/image-compress";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { AcaoIcone } from "./AcaoIcone";
import { s } from "./cond-data";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };

export const CATEGORIAS_ACHADOS = [
  { value: "brinquedos", label: "Brinquedos" },
  { value: "chaves", label: "Chaves" },
  { value: "documentos", label: "Documentos e cartões" },
  { value: "eletronicos", label: "Eletrônicos" },
  { value: "outros", label: "Outros" },
  { value: "pets", label: "Pets" },
  { value: "roupas", label: "Roupas e acessórios" },
];
const STATUS = { guardado: "Guardado", reclamado: "Reivindicado", devolvido: "Devolvido", doado: "Doado / descartado" } as const;
const COR: Record<string, string> = { guardado: "border-primary/40 bg-primary/10", reclamado: "border-warning/60 bg-warning/15", devolvido: "border-success/40 bg-success/10", doado: "border-muted-foreground/30 bg-muted" };
const cat = (v: unknown) => CATEGORIAS_ACHADOS.find((c) => c.value === v)?.label ?? "Outros";
const dataBr = (v: unknown) => (v ? new Date(String(v)).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");
const paraInput = (v: unknown) => { const d = v ? new Date(String(v)) : new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };

async function enviarFoto(original: File): Promise<string | null> {
  const file = await comprimirImagem(original, "chat");
  const path = `achados/${crypto.randomUUID()}.${(original.name.split(".").pop() || "jpg").toLowerCase()}`;
  const up = await supabase.storage.from("chat_media").upload(path, file, file.type ? { contentType: file.type } : undefined);
  if (up.error) { toast.error(`Falha no envio da foto: ${up.error.message}`); return null; }
  return supabase.storage.from("chat_media").getPublicUrl(path).data.publicUrl;
}

/** Achados & Perdidos: portaria/gestão cadastra e devolve; morador consulta e reivindica. */
export function AchadosPanel({ condominioId, perms }: { condominioId: string; perms: Perms }) {
  const gestor = perms.canCreate || perms.canUpdate;
  return (
    <Tabs defaultValue={gestor ? "gestao" : "vitrine"} className="space-y-3">
      {gestor && (
        <TabsList>
          <TabsTrigger value="gestao">Portaria & Gestão</TabsTrigger>
          <TabsTrigger value="vitrine">Visão do morador</TabsTrigger>
        </TabsList>
      )}
      {gestor && <TabsContent value="gestao"><Gestao condominioId={condominioId} perms={perms} /></TabsContent>}
      <TabsContent value="vitrine"><Vitrine condominioId={condominioId} /></TabsContent>
    </Tabs>
  );
}

function Foto({ url, borrar, className }: { url: string; borrar?: boolean; className?: string }) {
  if (!url) return <div className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}><PackageSearch className="size-8 opacity-50" /></div>;
  return <img src={url} alt="Foto do item" loading="lazy" className={cn("object-cover", borrar && "blur-md", className)} />;
}

function Gestao({ condominioId, perms }: { condominioId: string; perms: Perms }) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("abertos");
  const [editar, setEditar] = useState<Row | "novo" | null>(null);
  const [devolver, setDevolver] = useState<Row | null>(null);
  const q = useQuery({
    queryKey: ["cond", "achados", condominioId],
    queryFn: async (): Promise<Row[]> => {
      const r = await db.from("cond_achados").select("*").eq("condominio_id", condominioId).order("encontrado_em", { ascending: false });
      if (r.error) throw r.error;
      return (r.data ?? []) as Row[];
    },
  });
  const recarregar = () => void qc.invalidateQueries({ queryKey: ["cond", "achados", condominioId] });
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (q.data ?? []).filter((a) => {
      const st = s(a["status"]);
      if (status === "abertos" ? !(st === "guardado" || st === "reclamado") : status !== "todos" && st !== status) return false;
      return !t || [a["titulo"], a["descricao"], a["local_encontrado"], a["local_guardado"], cat(a["categoria"])].some((x) => s(x).toLowerCase().includes(t));
    });
  }, [q.data, busca, status]);

  const marcarDoado = async (a: Row) => {
    if (!(await confirmar({ titulo: "Marcar como doado/descartado?", descricao: "Use depois do prazo de guarda definido no regimento." }))) return;
    const r = await db.from("cond_achados").update({ status: "doado" }).eq("id", a["id"]);
    if (r.error) return void toast.error(r.error.message);
    recarregar();
  };
  const excluir = async (a: Row) => {
    if (!(await confirmar({ titulo: "Excluir este item?", descricao: "O registro some do histórico.", destrutivo: true }))) return;
    const r = await db.from("cond_achados").delete().eq("id", a["id"]);
    if (r.error) return void toast.error(r.error.message);
    recarregar();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar item, local ou categoria…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-sm" />
        <div className="w-56">
          <SearchSelect value={status} onChange={(v) => setStatus(v || "abertos")} options={[
            { value: "abertos", label: "Em aberto (guardados e reivindicados)" },
            { value: "devolvido", label: "Devolvidos" },
            { value: "doado", label: "Doados / descartados" },
            { value: "todos", label: "Todos" },
          ]} />
        </div>
        {perms.canCreate && <Button className="ml-auto" onClick={() => setEditar("novo")}><Plus className="mr-1 size-4" /> Cadastrar item</Button>}
      </div>
      {q.error && <p className="text-sm text-destructive">Não foi possível carregar. Rode o script de Achados & Perdidos no banco.</p>}
      {!q.isLoading && !lista.length && <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground"><PackageSearch className="mx-auto mb-2 size-8 opacity-60" />Nenhum item por aqui.</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {lista.map((a) => {
          const st = s(a["status"]) as keyof typeof STATUS;
          return (
            <div key={s(a["id"])} className="flex flex-col overflow-hidden rounded-lg border bg-card">
              <Foto url={s(a["foto"])} className="h-40 w-full" />
              <div className="flex flex-1 flex-col gap-1 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{s(a["titulo"])}</p>
                  <Badge variant="outline" className={COR[st]}>{STATUS[st] ?? st}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{cat(a["categoria"])} · {dataBr(a["encontrado_em"])}</p>
                {s(a["local_encontrado"]) && <p className="text-xs"><span className="text-muted-foreground">Achado em:</span> {s(a["local_encontrado"])}</p>}
                {s(a["local_guardado"]) && <p className="text-xs"><span className="text-muted-foreground">Guardado em:</span> {s(a["local_guardado"])}</p>}
                {st === "reclamado" && <p className="rounded bg-warning/15 p-1.5 text-xs">Um morador disse que é dele{s(a["reclamado_obs"]) ? `: “${s(a["reclamado_obs"])}”` : "."}</p>}
                {st === "devolvido" && <p className="text-xs text-muted-foreground">Entregue a {s(a["devolvido_para"])} {s(a["devolvido_unidade"]) && `(${s(a["devolvido_unidade"])})`} em {dataBr(a["devolvido_em"])}</p>}
                <div className="mt-auto flex justify-end gap-1 pt-2">
                  {(st === "guardado" || st === "reclamado") && perms.canUpdate && <AcaoIcone titulo="Registrar devolução" destaque onClick={() => setDevolver(a)}><CheckCircle2 className="size-4" /></AcaoIcone>}
                  {perms.canUpdate && <AcaoIcone titulo="Editar" onClick={() => setEditar(a)}><Pencil className="size-4" /></AcaoIcone>}
                  {(st === "guardado" || st === "reclamado") && perms.canUpdate && <AcaoIcone titulo="Doar / descartar" onClick={() => void marcarDoado(a)}><Hand className="size-4" /></AcaoIcone>}
                  {perms.canDelete && <AcaoIcone titulo="Excluir" destrutivo onClick={() => void excluir(a)}><Trash2 className="size-4" /></AcaoIcone>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {editar && <Editor condominioId={condominioId} item={editar === "novo" ? null : editar} onFechar={() => setEditar(null)} onSalvo={() => { setEditar(null); recarregar(); }} />}
      {devolver && <Devolver item={devolver} onFechar={() => setDevolver(null)} onSalvo={() => { setDevolver(null); recarregar(); }} />}
    </div>
  );
}

function Editor({ condominioId, item, onFechar, onSalvo }: { condominioId: string; item: Row | null; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({
    titulo: s(item?.["titulo"]), categoria: s(item?.["categoria"]) || "outros", descricao: s(item?.["descricao"]),
    local_encontrado: s(item?.["local_encontrado"]), local_guardado: s(item?.["local_guardado"]), encontrado_por: s(item?.["encontrado_por"]),
    encontrado_em: paraInput(item?.["encontrado_em"]), foto: s(item?.["foto"]), sensivel: item?.["sensivel"] === true,
  });
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const foto = async (file?: File) => {
    if (!file) return;
    setEnviando(true);
    const url = await enviarFoto(file);
    setEnviando(false);
    if (url) set("foto", url);
  };
  const salvar = async () => {
    if (f.titulo.trim().length < 2) return void toast.error("Diga o que é o item.");
    setSalvando(true);
    const dados = { ...f, titulo: f.titulo.trim(), encontrado_em: new Date(f.encontrado_em).toISOString(), condominio_id: condominioId };
    const r = item ? await db.from("cond_achados").update(dados).eq("id", item["id"]) : await db.from("cond_achados").insert(dados);
    setSalvando(false);
    if (r.error) return void toast.error(r.error.message);
    toast.success("Item salvo.");
    onSalvo();
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onFechar()}>
      <SheetContent className="z-[90] flex w-full flex-col p-0 sm:max-w-none md:w-[60vw]" onInteractOutside={(e) => e.preventDefault()}>
        <SheetHeader className="border-b p-4"><SheetTitle>{item ? "Editar item" : "Cadastrar item achado"}</SheetTitle></SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1">Foto do item <UploadInfo perfil="chat" /></Label>
            <div className="flex flex-wrap items-center gap-3">
              <Foto url={f.foto} className="h-32 w-44 rounded-md border" />
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
                <Camera className="size-4" /> {enviando ? "Enviando…" : f.foto ? "Trocar foto" : "Tirar ou escolher foto"}
                <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={enviando} onChange={(e) => void foto(e.target.files?.[0])} />
              </label>
              {f.foto && <Button variant="ghost" size="sm" onClick={() => set("foto", "")}>Remover</Button>}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="ach-tit">O que é?</Label><Input id="ach-tit" placeholder="Ex.: Chave com chaveiro azul" value={f.titulo} onChange={(e) => set("titulo", e.target.value)} /></div>
            <div className="space-y-1"><Label>Categoria</Label><SearchSelect value={f.categoria} onChange={(v) => set("categoria", v || "outros")} options={CATEGORIAS_ACHADOS} /></div>
            <div className="space-y-1"><Label htmlFor="ach-loc">Onde foi achado?</Label><Input id="ach-loc" placeholder="Ex.: Piscina, hall da Torre B" value={f.local_encontrado} onChange={(e) => set("local_encontrado", e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="ach-gua">Onde está guardado?</Label><Input id="ach-gua" placeholder="Ex.: Gaveta 2 da portaria" value={f.local_guardado} onChange={(e) => set("local_guardado", e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="ach-dt">Quando foi achado?</Label><Input id="ach-dt" type="datetime-local" value={f.encontrado_em} onChange={(e) => set("encontrado_em", e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="ach-por">Quem achou / entregou</Label><Input id="ach-por" placeholder="Ex.: Equipe de limpeza" value={f.encontrado_por} onChange={(e) => set("encontrado_por", e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label htmlFor="ach-desc">Detalhes</Label><Textarea id="ach-desc" rows={3} placeholder="Cor, marca, sinais que ajudam o dono a reconhecer" value={f.descricao} onChange={(e) => set("descricao", e.target.value)} /></div>
          <div className="flex items-start justify-between gap-3 rounded-md border p-3">
            <div><p className="text-sm font-medium">Item com dados pessoais (documento, cartão)</p><p className="text-xs text-muted-foreground">LGPD: para os moradores a foto aparece borrada e os detalhes ficam ocultos. O dono confirma na portaria.</p></div>
            <Switch checked={f.sensivel} onCheckedChange={(v) => set("sensivel", v)} aria-label="Item com dados pessoais" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={salvando || enviando}>{salvando ? "Salvando…" : "Salvar"}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Devolver({ item, onFechar, onSalvo }: { item: Row; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({ devolvido_para: "", devolvido_documento: "", devolvido_unidade: "" });
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    if (f.devolvido_para.trim().length < 2) return void toast.error("Informe quem retirou.");
    setSalvando(true);
    const { data: u } = await supabase.auth.getUser();
    const r = await db.from("cond_achados").update({ ...f, status: "devolvido", devolvido_em: new Date().toISOString(), devolvido_por: u.user?.id ?? null }).eq("id", item["id"]);
    setSalvando(false);
    if (r.error) return void toast.error(r.error.message);
    toast.success("Devolução registrada.");
    onSalvo();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="z-[100]">
        <DialogHeader><DialogTitle>Registrar devolução</DialogTitle><DialogDescription>{s(item["titulo"])}</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor="dv-nome">Quem retirou</Label><Input id="dv-nome" value={f.devolvido_para} onChange={(e) => setF({ ...f, devolvido_para: e.target.value })} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="dv-doc">Documento</Label><Input id="dv-doc" placeholder="RG ou CPF" value={f.devolvido_documento} onChange={(e) => setF({ ...f, devolvido_documento: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="dv-un">Unidade</Label><Input id="dv-un" placeholder="Ex.: Torre A 302" value={f.devolvido_unidade} onChange={(e) => setF({ ...f, devolvido_unidade: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando…" : "Confirmar entrega"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Vitrine({ condominioId }: { condominioId: string }) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [reivindicar, setReivindicar] = useState<Row | null>(null);
  const [obs, setObs] = useState("");
  const q = useQuery({
    queryKey: ["cond", "achados-vitrine", condominioId],
    queryFn: async (): Promise<Row[]> => {
      const r = await db.rpc("cond_achados_vitrine", { p_condominio: condominioId });
      if (r.error) throw r.error;
      return (r.data ?? []) as Row[];
    },
  });
  const lista = (q.data ?? []).filter((a) => (!categoria || a["categoria"] === categoria) && (!busca.trim() || [a["titulo"], a["descricao"], a["local_encontrado"]].some((x) => s(x).toLowerCase().includes(busca.trim().toLowerCase()))));
  const enviar = async () => {
    if (!reivindicar) return;
    const r = await db.rpc("cond_achados_reivindicar", { p_id: reivindicar["id"], p_obs: obs.trim() });
    if (r.error) return void toast.error(r.error.message);
    toast.success("Pronto! A portaria foi avisada. Leve um documento para retirar.");
    setReivindicar(null); setObs("");
    void qc.invalidateQueries({ queryKey: ["cond", "achados-vitrine", condominioId] });
    void qc.invalidateQueries({ queryKey: ["cond", "achados", condominioId] });
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Perdeu algo? Busque aqui…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-sm" />
        <div className="w-56"><SearchSelect value={categoria} onChange={(v) => setCategoria(v ?? "")} options={CATEGORIAS_ACHADOS} placeholder="Todas as categorias" /></div>
      </div>
      {q.error && <p className="text-sm text-destructive">Não foi possível carregar os itens.</p>}
      {!q.isLoading && !lista.length && <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground"><PackageSearch className="mx-auto mb-2 size-8 opacity-60" />Nenhum item achado no momento.</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {lista.map((a) => (
          <div key={s(a["id"])} className="flex flex-col overflow-hidden rounded-lg border bg-card">
            <Foto url={s(a["foto"])} borrar={a["sensivel"] === true} className="h-40 w-full" />
            <div className="flex flex-1 flex-col gap-1 p-3 text-sm">
              <p className="font-semibold">{s(a["titulo"])}</p>
              <p className="text-xs text-muted-foreground">{cat(a["categoria"])} · achado em {dataBr(a["encontrado_em"])}</p>
              {s(a["local_encontrado"]) && <p className="text-xs">Local: {s(a["local_encontrado"])}</p>}
              {s(a["descricao"]) && <p className="line-clamp-2 text-xs text-muted-foreground">{s(a["descricao"])}</p>}
              {a["sensivel"] === true && <p className="text-xs text-muted-foreground">Dados ocultos por segurança. Confirme na portaria.</p>}
              <div className="mt-auto pt-2">
                {a["status"] === "guardado" ? (
                  <Button size="sm" className="w-full" onClick={() => setReivindicar(a)}>É meu</Button>
                ) : (
                  <Badge variant="outline" className={cn("w-full justify-center", COR["reclamado"])}>{a["meu"] === true ? "Você reivindicou — retire na portaria" : "Já reivindicado"}</Badge>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={!!reivindicar} onOpenChange={(o) => !o && setReivindicar(null)}>
        <DialogContent className="z-[100]">
          <DialogHeader><DialogTitle>Este item é seu?</DialogTitle><DialogDescription>Conte um detalhe que só o dono sabe. A portaria confere na retirada.</DialogDescription></DialogHeader>
          <Textarea rows={3} placeholder="Ex.: tem um adesivo do Corinthians atrás" value={obs} onChange={(e) => setObs(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReivindicar(null)}>Cancelar</Button>
            <Button onClick={() => void enviar()}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
