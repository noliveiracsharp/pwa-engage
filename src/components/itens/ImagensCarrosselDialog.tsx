import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  imagens: string[];
};

/** Modal com carrossel de todas as imagens de um item. */
export function ImagensCarrosselDialog({ open, onOpenChange, titulo, imagens }: Props) {
  const [api, setApi] = useState<CarouselApi>();
  const [atual, setAtual] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setAtual(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{titulo}</DialogTitle>
        </DialogHeader>
        <div className="px-10">
          <Carousel setApi={setApi} opts={{ loop: imagens.length > 1 }}>
            <CarouselContent>
              {imagens.map((src, i) => (
                <CarouselItem key={`${src}-${i}`}>
                  <div className="bg-muted flex h-[60vh] items-center justify-center rounded-md">
                    <img src={src} alt={`${titulo} — imagem ${i + 1}`} className="max-h-full max-w-full object-contain" />
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            {imagens.length > 1 && (
              <>
                <CarouselPrevious />
                <CarouselNext />
              </>
            )}
          </Carousel>
        </div>
        <p className="text-muted-foreground text-center text-sm">
          {atual + 1} de {imagens.length}
        </p>
      </DialogContent>
    </Dialog>
  );
}
