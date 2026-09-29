import { useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const BUCKET = "itens-imagens";
const MAX_BYTES = 280 * 1024;

type Props = {
  value: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
};

function pathFromUrl(url: string) {
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length).split("?")[0]!) : null;
}

async function compress(file: File): Promise<File> {
  let quality = 0.8;
  let out: File = file;
  for (let attempt = 0; attempt < 4; attempt++) {
    out = await imageCompression(file, {
      maxSizeMB: 0.27,
      maxWidthOrHeight: attempt < 2 ? 1600 : 1200,
      useWebWorker: true,
      fileType: "image/webp",
      initialQuality: quality,
    });
    if (out.size <= MAX_BYTES) return out;
    quality -= 0.15;
  }
  throw new Error(`Não foi possível reduzir "${file.name}" para 280 KB.`);
}

/** Galeria de imagens com compressão local (≤280 KB) e upload ao bucket itens-imagens. */
export function ImageGallery({ value, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return toast.error("Selecione arquivos de imagem.");
    setBusy(true);
    const urls: string[] = [];
    for (const file of list) {
      try {
        const small = await compress(file);
        const path = `${crypto.randomUUID()}.webp`;
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, small, { cacheControl: "3600", upsert: false, contentType: "image/webp" });
        if (error) throw error;
        urls.push(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Falha ao enviar ${file.name}.`);
      }
    }
    if (urls.length) {
      onChange([...value, ...urls]);
      toast.success(urls.length === 1 ? "Imagem enviada." : `${urls.length} imagens enviadas.`);
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = async (url: string) => {
    const path = pathFromUrl(url);
    if (path) {
      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      if (error) return toast.error(`Não foi possível excluir: ${error.message}`);
    }
    onChange(value.filter((u) => u !== url));
  };

  return (
    <div className="space-y-3">
      <div
        onClick={() => !disabled && !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled && !busy) void handleFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-center text-sm transition ${
          dragOver ? "border-primary bg-primary/5" : "border-border"
        } ${disabled ? "pointer-events-none opacity-60" : ""}`}
      >
        {busy ? (
          <Loader2 className="text-primary h-6 w-6 animate-spin" />
        ) : (
          <ImagePlus className="text-muted-foreground h-6 w-6" />
        )}
        <span className="text-muted-foreground">
          {busy ? "Comprimindo e enviando…" : "Arraste imagens aqui ou clique para selecionar"}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => e.target.files && void handleFiles(e.target.files)}
        />
      </div>

      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {value.map((url, i) => (
            <div key={url} className="border-border relative aspect-square overflow-hidden rounded-md border">
              <img src={url} alt={`Imagem ${i + 1}`} className="h-full w-full object-cover" />
              {i === 0 && (
                <span className="bg-primary text-primary-foreground absolute top-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-semibold">
                  Capa
                </span>
              )}
              {!disabled && (
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="absolute top-1 right-1 h-7 w-7"
                  aria-label="Excluir imagem"
                  onClick={() => void remove(url)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
