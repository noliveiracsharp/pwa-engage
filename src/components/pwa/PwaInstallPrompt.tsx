import { Share, Smartphone, X, PlusSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/usePwaInstall";

export function PwaInstallPrompt() {
  const { plataforma, instalar, dispensar } = usePwaInstall();
  if (!plataforma) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="pwa-titulo"
      className="fixed inset-x-3 bottom-3 z-[95] mx-auto max-w-md animate-in slide-in-from-bottom-4 fade-in rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <button
        type="button"
        onClick={dispensar}
        aria-label="Fechar"
        className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <img src="/icon-192.png?v=3" alt="" className="h-12 w-12 shrink-0 rounded-xl border border-border" />
        <div className="min-w-0">
          <h2 id="pwa-titulo" className="flex items-center gap-1.5 text-sm font-semibold">
            <Smartphone className="h-4 w-4 text-primary" aria-hidden /> Instale o App ConectCon HUB
          </h2>
          {plataforma === "android" ? (
            <p className="mt-0.5 text-xs text-muted-foreground">Acesse rápido direto da tela inicial, sem ocupar memória do celular.</p>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Toque em <Share className="mx-0.5 inline h-4 w-4 align-text-bottom text-primary" aria-label="Compartilhar" /> na barra do Safari e depois em{" "}
              <span className="whitespace-nowrap font-medium text-foreground">
                <PlusSquare className="mx-0.5 inline h-4 w-4 align-text-bottom" aria-hidden />“Adicionar à Tela de Início”
              </span>.
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        {plataforma === "android" ? (
          <>
            <Button variant="ghost" size="sm" onClick={dispensar}>Agora não</Button>
            <Button size="sm" onClick={instalar}>Instalar</Button>
          </>
        ) : (
          <Button size="sm" onClick={dispensar}>Entendi</Button>
        )}
      </div>
    </div>
  );
}
