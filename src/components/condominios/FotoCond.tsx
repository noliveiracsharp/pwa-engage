import { useRef, useState } from "react";
import { Camera, Loader2, ScanFace, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { comprimirImagem } from "@/lib/image-compress";
import { recortarRosto } from "@/lib/foto-rosto";
import { cn } from "@/lib/utils";

type Props = { value: string; onChange: (url: string) => void; rosto?: boolean; disabled?: boolean; tamanho?: "sm" | "lg"; alt?: string };

/** Foto do condomínio. Com `rosto`, a IA localiza e recorta o rosto (controle de acesso). */
export function FotoCond({ value, onChange, rosto = false, disabled, tamanho = "lg", alt = "Foto" }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");

  async function enviar(original: File) {
    if (!original.type.startsWith("image/")) { toast.error("Selecione uma imagem."); return; }
    setOcupado(true); setAviso("");
    try {
      let f = original;
      if (rosto) {
        const r = await recortarRosto(original);
        f = r.arquivo;
        if (!r.ok) setAviso(r.aviso ?? "");
      }
      f = await comprimirImagem(f, "avatar");
      const path = `cond/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("avatars").upload(path, f, { contentType: f.type || "image/jpeg" });
      if (error) throw error;
      onChange(supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl);
      toast.success(rosto ? "Foto enquadrada e salva." : "Foto salva.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível enviar a foto."); }
    finally { setOcupado(false); if (ref.current) ref.current.value = ""; }
  }

  const dim = tamanho === "lg" ? "size-28" : "size-12";
  return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" disabled={disabled || ocupado} onClick={() => ref.current?.click()} aria-label={value ? "Trocar foto" : "Adicionar foto"}
        className={cn("relative flex items-center justify-center overflow-hidden border bg-muted transition hover:ring-2 hover:ring-primary/40 disabled:cursor-default disabled:hover:ring-0", rosto ? "rounded-full" : "rounded-lg", dim)}>
        {value ? <img src={value} alt={alt} className="size-full object-cover" /> : rosto ? <User className="size-1/2 text-muted-foreground" /> : <Camera className="size-1/2 text-muted-foreground" />}
        {ocupado && <span className="absolute inset-0 flex items-center justify-center bg-background/70"><Loader2 className="size-5 animate-spin" /></span>}
      </button>
      {tamanho === "lg" && !disabled && (
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => ref.current?.click()}>
            {rosto ? <ScanFace className="size-4" /> : <Camera className="size-4" />} {value ? "Trocar" : "Foto"}
          </Button>
          {value && <Button type="button" size="icon" variant="ghost" className="size-8 text-destructive" aria-label="Remover foto" onClick={() => onChange("")}><Trash2 className="size-4" /></Button>}
        </div>
      )}
      {rosto && tamanho === "lg" && <p className="max-w-56 text-center text-xs text-muted-foreground">{aviso || "De frente, sem óculos escuros, boné ou máscara. A IA enquadra o rosto."}</p>}
      {aviso && <p className="sr-only" role="alert">{aviso}</p>}
      <input ref={ref} type="file" accept="image/*" capture={rosto ? "user" : "environment"} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f); }} />
    </div>
  );
}
