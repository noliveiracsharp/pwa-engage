import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { RotateCw, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useConexao } from "@/hooks/useConexao";
import { ROTULO_CONEXAO, type EstadoConexao } from "@/lib/conexao";
import { cn } from "@/lib/utils";

const Ctx = createContext<{ estado: EstadoConexao; reconectar: () => void }>({ estado: "online", reconectar: () => {} });

export function ConexaoProvider({ children }: { children: ReactNode }) {
  const v = useConexao();
  const anterior = useRef<EstadoConexao>("online");
  useEffect(() => {
    if (anterior.current === "offline" && v.estado === "online") toast.success("Conexão restabelecida!");
    if (v.estado !== "verificando") anterior.current = v.estado;
  }, [v.estado]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

const COR: Record<EstadoConexao, string> = {
  online: "bg-success",
  verificando: "bg-warning animate-pulse",
  offline: "bg-destructive animate-pulse",
};

/** Semáforo do header: cor + ícone + texto acessível (nunca só cor). */
export function SemaforoConexao() {
  const { estado, reconectar } = useContext(Ctx);
  const Icone = estado === "offline" ? WifiOff : estado === "verificando" ? RotateCw : Wifi;
  return (
    <TooltipProvider delayDuration={100}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={reconectar} aria-label={`${ROTULO_CONEXAO[estado]}. Verificar novamente`} className="relative">
          <Icone className={cn("size-4", estado === "offline" && "text-destructive", estado === "verificando" && "animate-spin")} aria-hidden />
          <span className={cn("absolute right-1.5 top-1.5 size-2.5 rounded-full ring-2 ring-background", COR[estado])} aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{ROTULO_CONEXAO[estado]}</TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
}

/** Faixa fixa e bem visível quando não há comunicação. */
export function BannerOffline() {
  const { estado, reconectar } = useContext(Ctx);
  const offline = estado === "offline";
  return (
    <div role="status" aria-live="assertive" aria-atomic="true">
      {offline && (
        <div className="flex flex-wrap items-center justify-center gap-3 bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground">
          <WifiOff className="size-4 shrink-0" aria-hidden />
          <span>Você está sem conexão com a internet. Salvamentos e envios podem falhar até a rede voltar.</span>
          <Button size="sm" variant="secondary" onClick={reconectar} className="h-7">
            <RotateCw className="size-3.5" aria-hidden /> Tentar reconectar
          </Button>
        </div>
      )}
    </div>
  );
}
