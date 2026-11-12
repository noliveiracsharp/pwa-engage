import { useRef, useState } from "react";
import { Bold, Italic, Strikethrough, Link2, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { comprimirImagem } from "@/lib/image-compress";
import { perguntar } from "@/components/layout/DialogoGlobal";

/** Editor de texto no formato do WhatsApp (*negrito*, _itálico_, ~riscado~), com quebras de linha, links e imagens. */
export function TextoWhatsApp({ value, onChange, pasta }: { value: string; onChange: (v: string) => void; pasta: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [subindo, setSubindo] = useState(false);

  function envolver(marca: string) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const sel = value.slice(a, b) || "texto";
    onChange(value.slice(0, a) + marca + sel + marca + value.slice(b));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + marca.length, a + marca.length + sel.length); });
  }
  function inserir(trecho: string) {
    const el = ref.current;
    const pos = el?.selectionStart ?? value.length;
    const antes = value.slice(0, pos);
    const sep = antes && !antes.endsWith("\n") ? "\n" : "";
    onChange(antes + sep + trecho + "\n" + value.slice(pos));
  }
  async function link() {
    const url = await perguntar({ title: "Inserir link", description: "Cole o endereço completo (https://…).", placeholder: "https://", confirmText: "Inserir" });
    if (url?.trim()) inserir(url.trim());
  }
  async function imagem(f: File) {
    setSubindo(true);
    try {
      const file = await comprimirImagem(f, "chat");
      const path = `${pasta}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const up = await supabase.storage.from("chat_media").upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      inserir(supabase.storage.from("chat_media").getPublicUrl(path).data.publicUrl);
    } catch (e) {
      toast.error(`Não foi possível enviar a imagem: ${(e as Error).message}`);
    } finally { setSubindo(false); }
  }
  const botao = (label: string, icon: React.ReactNode, fn: () => void) => (
    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" tooltip={label} aria-label={label} onClick={fn}>{icon}</Button>
  );
  return (
    <div className="rounded-md border border-input bg-background">
      <div className="flex items-center gap-1 border-b border-border px-1 py-0.5" role="toolbar" aria-label="Formatação">
        {botao("Negrito", <Bold className="h-4 w-4" />, () => envolver("*"))}
        {botao("Itálico", <Italic className="h-4 w-4" />, () => envolver("_"))}
        {botao("Riscado", <Strikethrough className="h-4 w-4" />, () => envolver("~"))}
        {botao("Inserir link", <Link2 className="h-4 w-4" />, () => void link())}
        {botao("Inserir imagem", subindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />, () => fileRef.current?.click())}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void imagem(f); e.target.value = ""; }} />
      </div>
      <Textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} rows={6} className="border-0 focus-visible:ring-0" placeholder="Enter pula linha. Use a barra acima para negrito, links e imagens." />
    </div>
  );
}
