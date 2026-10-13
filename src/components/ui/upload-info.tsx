import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PERFIS_IMAGEM, type PerfilImagem } from "@/lib/image-compress";
import { cn } from "@/lib/utils";

/** Ícone (i) que explica a otimização automática de imagens no envio. */
export function UploadInfo({ perfil, className, arquivos }: { perfil: PerfilImagem; className?: string; arquivos?: boolean }) {
  const p = PERFIS_IMAGEM[perfil];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Como as imagens são enviadas"
          onClick={(e) => e.stopPropagation()}
          className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-primary", className)}
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm" onClick={(e) => e.stopPropagation()}>
        <p className="font-medium">{p.titulo}</p>
        <p className="mt-1 text-muted-foreground">
          As imagens são otimizadas automaticamente antes do envio: até {p.maxPx}px no lado maior e cerca de {p.maxKB} KB.
        </p>
        <p className="mt-1 text-muted-foreground">{p.uso}</p>
        {arquivos && <p className="mt-1 text-muted-foreground">Outros arquivos (PDF, áudio, vídeo, planilhas) são enviados como estão.</p>}
      </PopoverContent>
    </Popover>
  );
}
