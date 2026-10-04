import { useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";

const LIMITE = 70;

/** Área rolável com "puxar para atualizar" no celular. */
export function PullToRefresh({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const inicio = useRef<number | null>(null);
  const [puxado, setPuxado] = useState(0);
  const [atualizando, setAtualizando] = useState(false);
  const qc = useQueryClient();

  return (
    <main
      ref={ref}
      className={className}
      onTouchStart={(e) => { inicio.current = (ref.current?.scrollTop ?? 1) <= 0 ? e.touches[0]!.clientY : null; }}
      onTouchMove={(e) => {
        if (inicio.current === null || atualizando) return;
        const d = e.touches[0]!.clientY - inicio.current;
        setPuxado(d > 0 ? Math.min(d * 0.5, LIMITE + 30) : 0);
      }}
      onTouchEnd={async () => {
        inicio.current = null;
        if (puxado >= LIMITE && !atualizando) {
          setAtualizando(true);
          setPuxado(LIMITE);
          await qc.invalidateQueries();
          window.location.reload();
          return;
        }
        setPuxado(0);
      }}
    >
      {(puxado > 0 || atualizando) && (
        <div className="flex items-center justify-center text-muted-foreground" style={{ height: puxado }}>
          {atualizando
            ? <Loader2 className="h-5 w-5 animate-spin" />
            : <RefreshCw className="h-5 w-5 transition-transform" style={{ transform: `rotate(${puxado * 3}deg)`, opacity: puxado / LIMITE }} />}
        </div>
      )}
      {children}
    </main>
  );
}
