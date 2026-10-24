import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UploadInfo } from "@/components/ui/upload-info";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { supabase } from "@/integrations/supabase/client";
import { comprimirImagem } from "@/lib/image-compress";
import { ARTIGOS_PADRAO, type ArtigoAjuda } from "@/lib/ajuda";

type Props = { artigo: ArtigoAjuda | null; modulos: string[]; fechar: () => void };

/** Edição de guia da Central de Ajuda — exibido somente para o perfil Master. */
export function EditorArtigoAjuda({ artigo, modulos, fechar }: Props) {
  const qc = useQueryClient();
  const dbId = (artigo as { dbId?: string } | null)?.dbId;
  const oficial = artigo ? ARTIGOS_PADRAO.some((o) => o.id === artigo.id) : false;
  const [f, setF] = useState({
    titulo: artigo?.titulo ?? "", resumo: artigo?.resumo ?? "", modulo: artigo?.modulo ?? "Primeiros passos",
    rota: artigo?.rota ?? "", perfil: artigo?.perfil ?? "", passos: (artigo?.passos ?? []).join("\n"),
    dica: artigo?.dica ?? "", video: artigo?.video ?? "", imagem: artigo?.imagem ?? "", tags: (artigo?.tags ?? []).join(", "),
  });
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function enviarImagem(file?: File | null) {
    if (!file || !file.type.startsWith("image/")) { toast.error("Escolha ou cole uma imagem."); return; }
    setEnviando(true);
    try {
      const c = await comprimirImagem(file, "chat");
      const ext = c.name.split(".").pop() || "webp";
      const path = `guias/${artigo?.id ?? "novo"}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("ajuda_midias").upload(path, c, { contentType: c.type, upsert: true });
      if (error) throw error;
      set("imagem", supabase.storage.from("ajuda_midias").getPublicUrl(path).data.publicUrl);
      toast.success("Print adicionado.");
    } catch {
      toast.error("Não foi possível enviar o print. Confira se o script da Central de Ajuda foi rodado.");
    } finally { setEnviando(false); }
  }

  async function salvar() {
    if (!f.titulo.trim()) { toast.error("Informe o título."); return; }
    setSalvando(true);
    const reg = {
      titulo: f.titulo.trim(), resumo: f.resumo.trim(), modulo: f.modulo.trim() || "Primeiros passos",
      rota: f.rota.trim() || null, perfil: f.perfil.trim() || null, conteudo: f.passos.trim(),
      dica: f.dica.trim() || null, video_url: f.video.trim() || null, imagem_url: f.imagem || null,
      tags: f.tags, publicado: true, chave: oficial ? artigo!.id : null,
    };
    const q = supabase.from("ajuda_artigos" as never);
    const { error } = dbId ? await q.update(reg as never).eq("id" as never, dbId as never) : await q.insert(reg as never);
    setSalvando(false);
    if (error) { toast.error("Não foi possível salvar: " + error.message); return; }
    toast.success("Guia salvo.");
    await qc.invalidateQueries({ queryKey: ["ajuda-artigos"] });
    fechar();
  }

  async function remover() {
    if (!dbId) return;
    const ok = await confirmar({
      title: oficial ? "Restaurar guia original?" : "Excluir guia?",
      description: oficial ? "Suas alterações e o print deste guia serão descartados." : "O guia será removido da Central de Ajuda.",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("ajuda_artigos" as never).delete().eq("id" as never, dbId as never);
    if (error) { toast.error("Não foi possível remover."); return; }
    await qc.invalidateQueries({ queryKey: ["ajuda-artigos"] });
    fechar();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <div>
          <div className="mb-1 flex items-center gap-1"><Label>Print da tela</Label><UploadInfo perfil="chat" /></div>
          <div
            tabIndex={0}
            onPaste={(e) => { const it = [...e.clipboardData.items].find((i) => i.type.startsWith("image/")); if (it) { e.preventDefault(); void enviarImagem(it.getAsFile()); } }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void enviarImagem(e.dataTransfer.files[0]); }}
            onClick={() => inputRef.current?.click()}
            className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-3 text-center text-sm text-muted-foreground outline-none hover:bg-muted focus:border-primary"
          >
            {enviando ? <Loader2 className="h-6 w-6 animate-spin" /> : f.imagem ? (
              <img src={f.imagem} alt="Print do guia" className="max-h-60 rounded border border-border" />
            ) : (<><ImagePlus className="h-6 w-6" /><span>Clique aqui e cole o print (Ctrl+V), arraste ou clique para escolher</span></>)}
          </div>
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => { void enviarImagem(e.target.files?.[0]); e.target.value = ""; }} />
          {f.imagem && <Button variant="ghost" size="sm" className="mt-1" onClick={() => set("imagem", "")}><Trash2 className="mr-1 h-4 w-4" /> Remover print</Button>}
        </div>
        <div><Label>Título</Label><Input value={f.titulo} onChange={(e) => set("titulo", e.target.value)} /></div>
        <div><Label>Resumo</Label><Input value={f.resumo} onChange={(e) => set("resumo", e.target.value)} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Módulo</Label>
            <Input list="ajuda-modulos" value={f.modulo} onChange={(e) => set("modulo", e.target.value)} />
            <datalist id="ajuda-modulos">{[...modulos].sort((a, b) => a.localeCompare(b, "pt-BR")).map((m) => <option key={m} value={m} />)}</datalist>
          </div>
          <div><Label>Para quem</Label><Input value={f.perfil} onChange={(e) => set("perfil", e.target.value)} placeholder="Ex.: Todos" /></div>
          <div><Label>Tela (endereço)</Label><Input value={f.rota} onChange={(e) => set("rota", e.target.value)} placeholder="/financeiro" /></div>
          <div><Label>Vídeo (link)</Label><Input value={f.video} onChange={(e) => set("video", e.target.value)} /></div>
        </div>
        <div><Label>Passo a passo (um por linha)</Label><Textarea rows={7} value={f.passos} onChange={(e) => set("passos", e.target.value)} /></div>
        <div><Label>Dica</Label><Textarea rows={2} value={f.dica} onChange={(e) => set("dica", e.target.value)} /></div>
        <div><Label>Palavras para a busca (separadas por vírgula)</Label><Input value={f.tags} onChange={(e) => set("tags", e.target.value)} /></div>
        {dbId && (
          <Button variant="outline" size="sm" onClick={remover}>
            {oficial ? <><RotateCcw className="mr-1 h-4 w-4" /> Restaurar original</> : <><Trash2 className="mr-1 h-4 w-4" /> Excluir guia</>}
          </Button>
        )}
      </div>
      <div className="flex gap-2 border-t border-border p-4">
        <Button variant="outline" className="flex-1" onClick={fechar}>Cancelar</Button>
        <Button className="flex-1" onClick={salvar} disabled={salvando || enviando}>{salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salvar</Button>
      </div>
    </div>
  );
}
