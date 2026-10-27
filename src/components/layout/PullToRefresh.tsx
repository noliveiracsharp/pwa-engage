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
      id="conteudo-principal"
      tabIndex={-1}
      ref={ref}
      className={`${className ?? ""} focus:outline-none`}
      onTouchStart={(e) => {
        inicio.current = null;
        const main = ref.current;
        const alvo = e.target as Node | null;
        // Ignora toques vindos de portais (Sheet/Dialog) ou fora do <main>.
        if (!main || !alvo || !main.contains(alvo) || main.scrollTop > 0) return;
        // Ignora se algum contêiner rolável interno não estiver no topo.
        let el = alvo instanceof HTMLElement ? alvo : alvo.parentElement;
        while (el && el !== main) {
          if (el.scrollTop > 0) return;
          el = el.parentElement;
        }
        if (document.querySelector('[role="dialog"], [data-state="open"][data-radix-popper-content-wrapper]')) return;
        inicio.current = e.touches[0]!.clientY;
      }}
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
