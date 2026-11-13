import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, Images, Loader2, MessageSquare, Pencil, Plus, Send, Star, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { UploadInfo } from "@/components/ui/upload-info";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { comprimirImagem } from "@/lib/image-compress";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { AcaoIcone } from "./AcaoIcone";
import { CampoData } from "./CampoData";
import { s } from "./cond-data";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
const REACOES = [
  { tipo: "curti", emoji: "👍", label: "Curti" }, { tipo: "amei", emoji: "❤️", label: "Amei" },
  { tipo: "festa", emoji: "🎉", label: "Festa" }, { tipo: "haha", emoji: "😂", label: "Haha" }, { tipo: "uau", emoji: "😮", label: "Uau" },
] as const;
const dataBr = (v: unknown) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "");

async function enviarFoto(original: File): Promise<string | null> {
  const file = await comprimirImagem(original, "laudo");
  const path = `galeria/${crypto.randomUUID()}.${(original.name.split(".").pop() || "jpg").toLowerCase()}`;
  const up = await supabase.storage.from("chat_media").upload(path, file, file.type ? { contentType: file.type } : undefined);
  if (up.error) { toast.error(`Falha no envio: ${up.error.message}`); return null; }
  return supabase.storage.from("chat_media").getPublicUrl(path).data.publicUrl;
}

/** Galeria de Fotos & Eventos: álbuns por evento, reações e comentários identificados. */
export function GaleriaPanel({ condominioId, perms }: { condominioId: string; perms: Perms }) {
  const gestor = perms.canCreate || perms.canUpdate;
  const [aberto, setAberto] = useState<string | null>(null);
  const [editar, setEditar] = useState<Row | "novo" | null>(null);
  const [busca, setBusca] = useState("");
  const qc = useQueryClient();
  const chave = ["cond", "albuns", condominioId];
  const q = useQuery({
    queryKey: chave,
    queryFn: async (): Promise<Row[]> => {
      const r = await db.from("cond_albuns").select("*, cond_album_fotos(count)").eq("condominio_id", condominioId).order("data_evento", { ascending: false, nullsFirst: false });
      if (r.error) throw r.error;
      return (r.data ?? []) as Row[];
    },
  });
  const albuns = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (q.data ?? []).filter((a) => !t || [a["titulo"], a["descricao"]].some((x) => s(x).toLowerCase().includes(t)));
  }, [q.data, busca]);
  const album = (q.data ?? []).find((a) => s(a["id"]) === aberto);
  const recarregar = () => void qc.invalidateQueries({ queryKey: chave });

  if (album) return <AlbumView album={album} gestor={gestor} perms={perms} onVoltar={() => setAberto(null)} onEditar={() => setEditar(album)} onMudou={recarregar} editar={editar} setEditar={setEditar} condominioId={condominioId} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Buscar álbum" placeholder="Buscar álbum ou evento…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-sm" />
        {perms.canCreate && <Button className="ml-auto" onClick={() => setEditar("novo")}><Plus className="mr-1 size-4" aria-hidden />Novo álbum</Button>}
      </div>
      {q.error && <p className="text-sm text-destructive">Não foi possível carregar. Rode o script de Pets & Galeria no banco.</p>}
      {!q.isLoading && !q.error && !albuns.length && <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground"><Images className="mx-auto mb-2 size-8 opacity-60" aria-hidden />Nenhum álbum ainda.</div>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {albuns.map((a) => {
          const n = Number((a["cond_album_fotos"] as Array<{ count: number }> | undefined)?.[0]?.count ?? 0);
          return (
            <li key={s(a["id"])}>
              <button type="button" onClick={() => setAberto(s(a["id"]))} className="group flex w-full flex-col overflow-hidden rounded-lg border bg-card text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {s(a["capa_url"]) ? <img src={s(a["capa_url"])} alt="" loading="lazy" className="h-44 w-full object-cover transition-transform group-hover:scale-[1.02]" />
                  : <div className="flex h-44 items-center justify-center bg-muted"><Images className="size-10 text-muted-foreground opacity-50" aria-hidden /></div>}
                <div className="space-y-1 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{s(a["titulo"])}</p>
                    {!a["publicado"] && <Badge variant="outline">Rascunho</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{[dataBr(a["data_evento"]), `${n} ${n === 1 ? "foto" : "fotos"}`].filter(Boolean).join(" · ")}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {editar && <AlbumDialog condominioId={condominioId} album={editar === "novo" ? null : editar} onClose={() => setEditar(null)} onOk={recarregar} />}
    </div>
  );
}

function AlbumDialog({ condominioId, album, onClose, onOk }: { condominioId: string; album: Row | null; onClose: () => void; onOk: () => void }) {
  const [f, setF] = useState({
    titulo: s(album?.["titulo"]), descricao: s(album?.["descricao"]), data_evento: s(album?.["data_evento"]),
    publicado: Boolean(album?.["publicado"] ?? false), permite_comentarios: Boolean(album?.["permite_comentarios"] ?? true), permite_reacoes: Boolean(album?.["permite_reacoes"] ?? true),
  });
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    if (!f.titulo.trim()) return void toast.error("Informe o nome do álbum.");
    setSalvando(true);
    const v = { ...f, titulo: f.titulo.trim(), descricao: f.descricao || null, data_evento: f.data_evento || null };
    const r = album ? await db.from("cond_albuns").update(v).eq("id", album["id"]) : await db.from("cond_albuns").insert({ ...v, condominio_id: condominioId });
    setSalvando(false);
    if (r.error) return void toast.error(r.error.message);
    toast.success("Álbum salvo."); onOk(); onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{album ? "Editar álbum" : "Novo álbum"}</DialogTitle><DialogDescription>Ex.: Festa Junina 2026, Natal, Inauguração da academia.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor="alb-t">Nome do álbum</Label><Input id="alb-t" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></div>
          <div className="space-y-1"><Label>Data do evento</Label><CampoData inicio={2000} value={f.data_evento} onChange={(v: string) => setF({ ...f, data_evento: v })} /></div>
          <div className="space-y-1"><Label htmlFor="alb-d">Descrição</Label><Textarea id="alb-d" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></div>
          <label className="flex items-center justify-between gap-2 text-sm">Publicado para os moradores<Switch checked={f.publicado} onCheckedChange={(v) => setF({ ...f, publicado: v })} /></label>
          <label className="flex items-center justify-between gap-2 text-sm">Permitir reações<Switch checked={f.permite_reacoes} onCheckedChange={(v) => setF({ ...f, permite_reacoes: v })} /></label>
          <label className="flex items-center justify-between gap-2 text-sm">Permitir comentários<Switch checked={f.permite_comentarios} onCheckedChange={(v) => setF({ ...f, permite_comentarios: v })} /></label>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={salvando} onClick={() => void salvar()}>Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AlbumView({ album, gestor, perms, onVoltar, onEditar, onMudou, editar, setEditar, condominioId }: {
  album: Row; gestor: boolean; perms: Perms; onVoltar: () => void; onEditar: () => void; onMudou: () => void;
  editar: Row | "novo" | null; setEditar: (v: Row | "novo" | null) => void; condominioId: string;
}) {
  const qc = useQueryClient();
  const albumId = s(album["id"]);
  const chave = ["cond", "album-fotos", albumId];
  const ref = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(0);
  const [atual, setAtual] = useState<number | null>(null);
  const q = useQuery({
    queryKey: chave,
    queryFn: async (): Promise<Row[]> => {
      const r = await db.from("cond_album_fotos").select("*, cond_foto_reacoes(tipo,usuario_id), cond_foto_comentarios(count)").eq("album_id", albumId).order("ordem").order("created_at");
      if (r.error) throw r.error;
      return (r.data ?? []) as Row[];
    },
  });
  const fotos = q.data ?? [];
  const recarregar = () => { void qc.invalidateQueries({ queryKey: chave }); onMudou(); };

  const enviar = async (files: FileList | null) => {
    const lista = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!lista.length) return;
    setEnviando(lista.length);
    let ordem = fotos.length;
    for (const f of lista) {
      const url = await enviarFoto(f);
      if (url) {
        const r = await db.from("cond_album_fotos").insert({ album_id: albumId, url, ordem: ordem++ });
        if (r.error) toast.error(r.error.message);
        else if (!s(album["capa_url"]) && ordem === 1) await db.from("cond_albuns").update({ capa_url: url }).eq("id", albumId);
      }
      setEnviando((n) => n - 1);
    }
    recarregar();
  };
  const definirCapa = async (f: Row) => {
    const r = await db.from("cond_albuns").update({ capa_url: f["url"] }).eq("id", albumId);
    if (r.error) return void toast.error(r.error.message);
    toast.success("Capa atualizada."); onMudou();
  };
  const excluirFoto = async (f: Row) => {
    if (!(await confirmar({ title: "Excluir esta foto?", description: "Reações e comentários dela também serão removidos.", destructive: true }))) return;
    const r = await db.from("cond_album_fotos").delete().eq("id", f["id"]);
    if (r.error) return void toast.error(r.error.message);
    recarregar();
  };
  const excluirAlbum = async () => {
    if (!(await confirmar({ title: "Excluir o álbum inteiro?", description: "Todas as fotos, reações e comentários serão removidos.", destructive: true }))) return;
    const r = await db.from("cond_albuns").delete().eq("id", albumId);
    if (r.error) return void toast.error(r.error.message);
    onVoltar(); onMudou();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onVoltar}><ArrowLeft className="mr-1 size-4" aria-hidden />Álbuns</Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{s(album["titulo"])} {!album["publicado"] && <Badge variant="outline" className="ml-1 align-middle">Rascunho</Badge>}</h2>
          <p className="text-xs text-muted-foreground">{[dataBr(album["data_evento"]), s(album["descricao"])].filter(Boolean).join(" · ")}</p>
        </div>
        {gestor && (
          <div className="flex items-center gap-1">
            {perms.canUpdate && <AcaoIcone titulo="Editar álbum" onClick={onEditar}><Pencil className="size-4" /></AcaoIcone>}
            {perms.canDelete && <AcaoIcone titulo="Excluir álbum" onClick={() => void excluirAlbum()} destrutivo><Trash2 className="size-4" /></AcaoIcone>}
            <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void enviar(e.target.files); e.target.value = ""; }} />
            <Button onClick={() => ref.current?.click()} disabled={enviando > 0}>
              {enviando > 0 ? <Loader2 className="mr-1 size-4 animate-spin" aria-hidden /> : <Upload className="mr-1 size-4" aria-hidden />}
              {enviando > 0 ? `Enviando ${enviando}…` : "Adicionar fotos"}
            </Button>
            <UploadInfo perfil="laudo" />
          </div>
        )}
      </div>
      {!q.isLoading && !fotos.length && <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Este álbum ainda não tem fotos.</div>}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {fotos.map((f, i) => {
          const reac = (f["cond_foto_reacoes"] as Row[] | undefined) ?? [];
          const com = Number((f["cond_foto_comentarios"] as Array<{ count: number }> | undefined)?.[0]?.count ?? 0);
          return (
            <li key={s(f["id"])} className="group relative overflow-hidden rounded-md border bg-muted">
              <button type="button" onClick={() => setAtual(i)} className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Abrir foto ${i + 1}${s(f["legenda"]) ? `: ${s(f["legenda"])}` : ""}`}>
                <img src={s(f["url"])} alt={s(f["legenda"]) || `Foto ${i + 1} do álbum`} loading="lazy" className="aspect-square w-full object-cover" />
              </button>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex gap-2 bg-background/80 px-2 py-1 text-xs">
                {reac.length > 0 && <span>❤️ {reac.length}</span>}{com > 0 && <span className="flex items-center gap-0.5"><MessageSquare className="size-3" aria-hidden />{com}</span>}
              </div>
              {gestor && (
                <div className="absolute right-1 top-1 flex gap-1 rounded bg-background/90 md:opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  {perms.canUpdate && <AcaoIcone titulo="Usar como capa" onClick={() => void definirCapa(f)}><Star className="size-4" /></AcaoIcone>}
                  {perms.canDelete && <AcaoIcone titulo="Excluir foto" onClick={() => void excluirFoto(f)} destrutivo><Trash2 className="size-4" /></AcaoIcone>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {atual != null && fotos[atual] && (
        <Lightbox fotos={fotos} indice={atual} setIndice={setAtual} album={album} gestor={gestor} onMudou={() => void qc.invalidateQueries({ queryKey: chave })} />
      )}
      {editar && editar !== "novo" && <AlbumDialog condominioId={condominioId} album={editar} onClose={() => setEditar(null)} onOk={onMudou} />}
    </div>
  );
}

function Lightbox({ fotos, indice, setIndice, album, gestor, onMudou }: { fotos: Row[]; indice: number; setIndice: (i: number | null) => void; album: Row; gestor: boolean; onMudou: () => void }) {
  const foto = fotos[indice]!;
  const fotoId = s(foto["id"]);
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [eu, setEu] = useState<string | null>(null);
  useEffect(() => { void supabase.auth.getUser().then((r) => setEu(r.data.user?.id ?? null)); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight" && indice < fotos.length - 1) setIndice(indice + 1);
      if (e.key === "ArrowLeft" && indice > 0) setIndice(indice - 1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [indice, fotos.length, setIndice]);
  const chaveCom = ["cond", "foto-comentarios", fotoId];
  const com = useQuery({
    queryKey: chaveCom,
    queryFn: async (): Promise<Row[]> => {
      const r = await db.from("cond_foto_comentarios").select("*").eq("foto_id", fotoId).order("created_at");
      if (r.error) throw r.error;
      return (r.data ?? []) as Row[];
    },
  });
  const reac = (foto["cond_foto_reacoes"] as Row[] | undefined) ?? [];
  const minha = reac.find((r) => s(r["usuario_id"]) === eu);
  const reagir = async (tipo: string) => {
    if (!eu) return;
    const r = s(minha?.["tipo"]) === tipo
      ? await db.from("cond_foto_reacoes").delete().eq("foto_id", fotoId).eq("usuario_id", eu)
      : await db.from("cond_foto_reacoes").upsert({ foto_id: fotoId, usuario_id: eu, tipo }, { onConflict: "foto_id,usuario_id" });
    if (r.error) return void toast.error(r.error.message);
    onMudou();
  };
  const comentar = async () => {
    const t = texto.trim();
    if (!t) return;
    const r = await db.from("cond_foto_comentarios").insert({ foto_id: fotoId, texto: t.slice(0, 1000) });
    if (r.error) return void toast.error(r.error.message);
    setTexto(""); void qc.invalidateQueries({ queryKey: chaveCom }); onMudou();
  };
  const apagar = async (c: Row) => {
    if (!(await confirmar({ title: "Apagar comentário?", destructive: true }))) return;
    const r = await db.from("cond_foto_comentarios").delete().eq("id", c["id"]);
    if (r.error) return void toast.error(r.error.message);
    void qc.invalidateQueries({ queryKey: chaveCom }); onMudou();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && setIndice(null)}>
      <DialogContent className="max-w-6xl gap-0 p-0 [&>button:last-child]:hidden" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="sr-only"><DialogTitle>Foto {indice + 1} de {fotos.length}</DialogTitle><DialogDescription>Use as setas do teclado para navegar.</DialogDescription></DialogHeader>
        <div className="grid max-h-[90vh] md:grid-cols-[1fr_340px]">
          <div className="relative flex min-h-[50vh] items-center justify-center bg-foreground/95">
            <img src={s(foto["url"])} alt={s(foto["legenda"]) || `Foto ${indice + 1}`} className="max-h-[90vh] w-auto object-contain" />
            {indice > 0 && <Button size="icon" variant="secondary" className="absolute left-2" aria-label="Foto anterior" onClick={() => setIndice(indice - 1)}><ChevronLeft className="size-5" /></Button>}
            {indice < fotos.length - 1 && <Button size="icon" variant="secondary" className="absolute right-2" aria-label="Próxima foto" onClick={() => setIndice(indice + 1)}><ChevronRight className="size-5" /></Button>}
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-background/80 px-2 py-0.5 text-xs">{indice + 1} / {fotos.length}</span>
          </div>
          <div className="flex max-h-[90vh] flex-col border-l bg-background">
            <div className="flex items-center justify-between border-b p-3">
              <p className="truncate text-sm font-semibold">{s(album["titulo"])}</p>
              <Button size="icon" variant="ghost" aria-label="Fechar" onClick={() => setIndice(null)}><X className="size-4" /></Button>
            </div>
            {album["permite_reacoes"] !== false && (
              <div className="flex flex-wrap gap-1 border-b p-3" role="group" aria-label="Reações">
                {REACOES.map((r) => {
                  const n = reac.filter((x) => x["tipo"] === r.tipo).length;
                  const sel = s(minha?.["tipo"]) === r.tipo;
                  return (
                    <button key={r.tipo} type="button" aria-pressed={sel} aria-label={`${r.label}${n ? `, ${n}` : ""}`} onClick={() => void reagir(r.tipo)}
                      className={cn("flex items-center gap-1 rounded-full border px-2 py-1 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", sel && "border-primary bg-primary/10")}>
                      <span aria-hidden>{r.emoji}</span>{n > 0 && <span className="text-xs">{n}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            <ul className="flex-1 space-y-3 overflow-y-auto p-3 text-sm" aria-label="Comentários">
              {!com.data?.length && <li className="text-muted-foreground">Nenhum comentário ainda.</li>}
              {(com.data ?? []).map((c) => (
                <li key={s(c["id"])} className="group">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{s(c["autor_nome"]) || "Morador"}</span>
                    <span className="text-[11px] text-muted-foreground">{new Date(s(c["created_at"])).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words">{s(c["texto"])}</p>
                  {(s(c["usuario_id"]) === eu || gestor) && <button type="button" onClick={() => void apagar(c)} className="text-xs text-destructive underline-offset-2 hover:underline">Apagar</button>}
                </li>
              ))}
            </ul>
            {album["permite_comentarios"] !== false ? (
              <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); void comentar(); }}>
                <Label htmlFor="foto-com" className="sr-only">Escreva um comentário</Label>
                <Textarea id="foto-com" rows={2} maxLength={1000} placeholder="Escreva um comentário…" value={texto} onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void comentar(); } }} className="min-h-0 resize-none" />
                <Button type="submit" size="icon" aria-label="Enviar comentário" disabled={!texto.trim()}><Send className="size-4" /></Button>
              </form>
            ) : <p className="border-t p-3 text-xs text-muted-foreground">Comentários desativados neste álbum.</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
